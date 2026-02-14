import {
  AiSummary,
  AuthSession,
  Call,
  CampaignApproval,
  CmsJob,
  CmsRole,
  Contact,
  FeatureFlags,
  MessageStatus,
  NormalizedCallEvent,
  OutboundMessage,
  ProviderCallRef,
  StructuredCallSummary,
  TranscriptResult,
  User,
} from '@mm/cms-contracts';
import {
  createToken,
  hashOpaqueToken,
  parseBearerToken,
  verifyPassword,
  verifyToken,
} from './auth';
import { AuthError, NotFoundError, ValidationError } from './errors';
import { assertEmailPolicy, assertRole, assertSmsPolicy } from './policy';
import { getAllowedTransitions, isStageTransitionAllowed } from './stage-rules';
import { JsonStateStore } from './state-store';
import { CmsState, MessageEvent, UserRecord } from './state';
import { calculatePurgeTargets } from './retention';

export interface Actor {
  userId: string;
  roles: CmsRole[];
}

export interface CmsServiceConfig {
  jwtSecret: string;
  passwordSalt: string;
  accessTokenTtlSeconds: number;
  refreshTokenTtlSeconds: number;
}

export interface StartCallInput {
  contactId: string;
  fromNumber: string;
  toNumber: string;
  provider?: Call['provider'];
}

export interface SendEmailInput {
  to: string;
  from: string;
  subject: string;
  body: string;
  contactId?: string;
}

export interface SendSmsInput {
  to: string;
  from: string;
  body: string;
  contactId?: string;
}

export interface JobRunResult {
  claimed: CmsJob[];
}

export class CmsService {
  constructor(
    private readonly store: JsonStateStore,
    private readonly config: CmsServiceConfig
  ) {}

  login(email: string, password: string): AuthSession {
    return this.store.mutate((state) => {
      const user = state.users.find(
        (candidate) => candidate.email.toLowerCase() === email.toLowerCase()
      );
      if (!user) {
        throw new AuthError('Invalid email or password');
      }
      if (!verifyPassword(password, user.passwordHash, this.config.passwordSalt)) {
        throw new AuthError('Invalid email or password');
      }

      user.lastLoginAt = this.nowIso();
      user.updatedAt = user.lastLoginAt;

      const session = this.createAuthSession(state, user);
      this.appendAudit(state, {
        actorUserId: user.id,
        action: 'auth.login',
        entityType: 'user',
        entityId: user.id,
      });
      return session;
    });
  }

  refresh(refreshToken: string): AuthSession {
    const payload = verifyToken(refreshToken, this.config.jwtSecret);
    if (payload.type !== 'refresh') {
      throw new AuthError('Expected refresh token');
    }

    return this.store.mutate((state) => {
      const tokenHash = hashOpaqueToken(refreshToken);
      const tokenRecord = state.refreshTokens.find(
        (candidate) =>
          candidate.tokenHash === tokenHash &&
          !candidate.revokedAt &&
          new Date(candidate.expiresAt).getTime() > Date.now()
      );
      if (!tokenRecord) {
        throw new AuthError('Refresh token not recognized');
      }

      tokenRecord.revokedAt = this.nowIso();
      const user = state.users.find((candidate) => candidate.id === tokenRecord.userId);
      if (!user) {
        throw new AuthError('User for token no longer exists');
      }

      const session = this.createAuthSession(state, user);
      this.appendAudit(state, {
        actorUserId: user.id,
        action: 'auth.refresh',
        entityType: 'user',
        entityId: user.id,
      });
      return session;
    });
  }

  authenticate(authHeader?: string): Actor {
    const token = parseBearerToken(authHeader);
    const payload = verifyToken(token, this.config.jwtSecret);
    if (payload.type !== 'access') {
      throw new AuthError('Expected access token');
    }
    return {
      userId: payload.sub,
      roles: payload.roles,
    };
  }

  getMe(actor: Actor): User {
    const state = this.store.read();
    const user = state.users.find((candidate) => candidate.id === actor.userId);
    if (!user) {
      throw new AuthError('Actor not found');
    }
    return sanitizeUser(user);
  }

  listContacts(): Contact[] {
    const state = this.store.read();
    return state.contacts;
  }

  createContact(actor: Actor, input: Partial<Contact> & Pick<Contact, 'firstName' | 'lastName'>): Contact {
    return this.store.mutate((state) => {
      const id = this.nextId(state, 'contact', 'con');
      const now = this.nowIso();
      const contact: Contact = {
        id,
        firstName: input.firstName,
        lastName: input.lastName,
        accountId: input.accountId,
        email: input.email,
        phone: input.phone,
        jobTitle: input.jobTitle,
        ownerUserId: input.ownerUserId ?? actor.userId,
        stageId: input.stageId ?? 'new',
        createdAt: now,
        updatedAt: now,
      };
      state.contacts.push(contact);
      this.appendAudit(state, {
        actorUserId: actor.userId,
        action: 'contact.create',
        entityType: 'contact',
        entityId: contact.id,
      });
      return contact;
    });
  }

  getContact(contactId: string): Contact {
    const state = this.store.read();
    const contact = state.contacts.find((candidate) => candidate.id === contactId);
    if (!contact) {
      throw new NotFoundError('Contact', contactId);
    }
    return contact;
  }

  patchContact(actor: Actor, contactId: string, patch: Partial<Contact>): Contact {
    return this.store.mutate((state) => {
      const contact = state.contacts.find((candidate) => candidate.id === contactId);
      if (!contact) {
        throw new NotFoundError('Contact', contactId);
      }
      const now = this.nowIso();
      if (patch.firstName !== undefined) {
        contact.firstName = patch.firstName;
      }
      if (patch.lastName !== undefined) {
        contact.lastName = patch.lastName;
      }
      if (patch.jobTitle !== undefined) {
        contact.jobTitle = patch.jobTitle;
      }
      if (patch.email !== undefined) {
        contact.email = patch.email;
      }
      if (patch.phone !== undefined) {
        contact.phone = patch.phone;
      }
      if (patch.accountId !== undefined) {
        contact.accountId = patch.accountId;
      }
      contact.updatedAt = now;
      this.appendAudit(state, {
        actorUserId: actor.userId,
        action: 'contact.patch',
        entityType: 'contact',
        entityId: contact.id,
        detail: { patch },
      });
      return contact;
    });
  }

  addContactNote(actor: Actor, contactId: string, body: string): void {
    if (!body.trim()) {
      throw new ValidationError('Note body is required');
    }

    this.store.mutate((state) => {
      this.requireContact(state, contactId);
      const now = this.nowIso();
      state.interactions.push({
        id: this.nextId(state, 'interaction', 'int'),
        contactId,
        createdByUserId: actor.userId,
        type: 'note',
        body,
        createdAt: now,
      });
      this.appendAudit(state, {
        actorUserId: actor.userId,
        action: 'contact.note.add',
        entityType: 'contact',
        entityId: contactId,
      });
    });
  }

  addFollowUp(
    actor: Actor,
    contactId: string,
    summary: string,
    dueAt: string,
    assignedToUserId?: string
  ): void {
    if (!summary.trim()) {
      throw new ValidationError('Follow-up summary is required');
    }

    this.store.mutate((state) => {
      this.requireContact(state, contactId);
      const now = this.nowIso();
      state.followUps.push({
        id: this.nextId(state, 'followup', 'fup'),
        contactId,
        summary,
        dueAt,
        assignedToUserId: assignedToUserId ?? actor.userId,
        createdAt: now,
      });
      state.interactions.push({
        id: this.nextId(state, 'interaction', 'int'),
        contactId,
        createdByUserId: actor.userId,
        type: 'follow-up',
        body: summary,
        createdAt: now,
      });
      this.appendAudit(state, {
        actorUserId: actor.userId,
        action: 'contact.followup.add',
        entityType: 'contact',
        entityId: contactId,
        detail: { dueAt },
      });
    });
  }

  transitionStage(
    actor: Actor,
    contactId: string,
    toStageId: Contact['stageId'],
    reason?: string
  ): Contact {
    return this.store.mutate((state) => {
      const contact = this.requireContact(state, contactId);
      if (!isStageTransitionAllowed(contact.stageId, toStageId)) {
        throw new ValidationError('Invalid stage transition', {
          from: contact.stageId,
          to: toStageId,
          allowed: getAllowedTransitions(contact.stageId),
        });
      }
      const now = this.nowIso();
      const fromStageId = contact.stageId;
      contact.stageId = toStageId;
      contact.updatedAt = now;
      state.stageHistory.push({
        id: this.nextId(state, 'stagehistory', 'sth'),
        contactId,
        fromStageId,
        toStageId,
        reason,
        changedByUserId: actor.userId,
        changedAt: now,
      });
      state.interactions.push({
        id: this.nextId(state, 'interaction', 'int'),
        contactId,
        createdByUserId: actor.userId,
        type: 'stage-change',
        body: `${fromStageId} -> ${toStageId}`,
        createdAt: now,
        metadata: reason ? { reason } : undefined,
      });
      this.appendAudit(state, {
        actorUserId: actor.userId,
        action: 'contact.stage.transition',
        entityType: 'contact',
        entityId: contactId,
        detail: { fromStageId, toStageId, reason },
      });
      return contact;
    });
  }

  listAccounts() {
    return this.store.read().accounts;
  }

  listStages() {
    return this.store.read().stages;
  }

  createOutboundCallIntent(actor: Actor, input: StartCallInput): Call {
    return this.store.mutate((state) => {
      this.requireContact(state, input.contactId);
      const now = this.nowIso();
      const call: Call = {
        id: this.nextId(state, 'call', 'cal'),
        contactId: input.contactId,
        initiatedByUserId: actor.userId,
        fromNumber: input.fromNumber,
        toNumber: input.toNumber,
        provider: input.provider ?? 'twilio',
        status: 'initiated',
        recordingConsentPlayed: true,
        createdAt: now,
        updatedAt: now,
      };
      state.calls.push(call);
      state.interactions.push({
        id: this.nextId(state, 'interaction', 'int'),
        contactId: call.contactId,
        createdByUserId: actor.userId,
        type: 'call',
        body: `Outbound call started from ${call.fromNumber} to ${call.toNumber}`,
        createdAt: now,
        metadata: {
          callId: call.id,
        },
      });
      this.appendAudit(state, {
        actorUserId: actor.userId,
        action: 'call.start',
        entityType: 'call',
        entityId: call.id,
      });
      return call;
    });
  }

  bindProviderCall(callId: string, providerRef: ProviderCallRef): Call {
    return this.store.mutate((state) => {
      const call = this.requireCall(state, callId);
      call.providerCallId = providerRef.providerCallId;
      call.provider = providerRef.provider;
      call.updatedAt = this.nowIso();
      this.appendAudit(state, {
        action: 'call.provider.bind',
        entityType: 'call',
        entityId: call.id,
        detail: { ...providerRef },
      });
      return call;
    });
  }

  endCall(actor: Actor, callId: string, finalStatus: Call['status'] = 'completed'): Call {
    return this.store.mutate((state) => {
      const call = this.requireCall(state, callId);
      const now = this.nowIso();
      call.status = finalStatus;
      call.endedAt = now;
      call.updatedAt = now;
      this.appendAudit(state, {
        actorUserId: actor.userId,
        action: 'call.end',
        entityType: 'call',
        entityId: callId,
        detail: { finalStatus },
      });
      return call;
    });
  }

  getCall(callId: string): Call {
    const state = this.store.read();
    return this.requireCall(state, callId);
  }

  getTranscriptForCall(callId: string) {
    const state = this.store.read();
    return state.callTranscripts.find((item) => item.callId === callId) ?? null;
  }

  ingestTelephonyEvents(source: string, events: NormalizedCallEvent[]): { accepted: number; ignored: number } {
    return this.store.mutate((state) => {
      let accepted = 0;
      let ignored = 0;
      for (const event of events) {
        if (state.webhookEventDedupe.some((item) => item.source === source && item.eventId === event.eventId)) {
          ignored += 1;
          continue;
        }

        state.webhookEventDedupe.push({
          id: this.nextId(state, 'webhookdedupe', 'whd'),
          source,
          eventId: event.eventId,
          firstSeenAt: this.nowIso(),
        });

        const call = state.calls.find((candidate) => candidate.providerCallId === event.providerCallId);
        if (!call) {
          ignored += 1;
          continue;
        }

        accepted += 1;
        state.callEvents.push({
          id: this.nextId(state, 'callevent', 'cev'),
          callId: call.id,
          providerEventId: event.eventId,
          eventType: event.eventType,
          rawPayload: event.payload,
          eventAt: event.eventAt,
          createdAt: this.nowIso(),
        });

        if (event.mappedStatus) {
          call.status = event.mappedStatus;
          call.updatedAt = this.nowIso();
          if (event.mappedStatus === 'in-progress' && !call.startedAt) {
            call.startedAt = this.nowIso();
          }
          if (
            event.mappedStatus === 'completed' ||
            event.mappedStatus === 'failed' ||
            event.mappedStatus === 'no-answer' ||
            event.mappedStatus === 'canceled'
          ) {
            call.endedAt = this.nowIso();
          }
        }

        if (event.recordingArtifact) {
          const recording = {
            id: this.nextId(state, 'recording', 'rec'),
            callId: call.id,
            sourceUrl: event.recordingArtifact.sourceUrl,
            storageKey: event.recordingArtifact.storageKey,
            providerRecordingId: event.recordingArtifact.providerRecordingId,
            durationSeconds: event.recordingArtifact.durationSeconds,
            createdAt: this.nowIso(),
          };
          state.callRecordings.push(recording);
          this.enqueueJob(state, {
            type: 'call.transcribe',
            payload: {
              callId: call.id,
              recordingId: recording.id,
              recordingUrl: recording.sourceUrl,
            },
          });
        }
      }

      this.appendAudit(state, {
        action: 'webhook.telephony.ingest',
        entityType: 'webhook',
        detail: { source, accepted, ignored },
      });

      return { accepted, ignored };
    });
  }

  saveTranscript(callId: string, recordingId: string | undefined, transcript: TranscriptResult): void {
    this.store.mutate((state) => {
      this.requireCall(state, callId);
      const existing = state.callTranscripts.find((item) => item.callId === callId);
      if (existing) {
        existing.content = transcript.content;
        existing.provider = transcript.provider;
      } else {
        state.callTranscripts.push({
          id: this.nextId(state, 'transcript', 'trn'),
          callId,
          recordingId,
          content: transcript.content,
          provider: transcript.provider,
          createdAt: this.nowIso(),
        });
      }
      this.enqueueJob(state, {
        type: 'call.extract',
        payload: {
          callId,
        },
      });
      this.appendAudit(state, {
        action: 'call.transcript.saved',
        entityType: 'call',
        entityId: callId,
      });
    });
  }

  saveExtraction(callId: string, extraction: StructuredCallSummary): AiSummary {
    return this.store.mutate((state) => {
      this.requireCall(state, callId);

      const now = this.nowIso();
      const summary: AiSummary = {
        id: this.nextId(state, 'aisummary', 'ais'),
        callId,
        summary: extraction.summary,
        keyPoints: extraction.keyPoints,
        confidence: extraction.confidence,
        status: 'proposed',
        createdAt: now,
      };
      state.aiSummaries.push(summary);

      for (const item of extraction.actionItems) {
        state.aiActionItems.push({
          id: this.nextId(state, 'aiaction', 'aia'),
          callId,
          description: item.description,
          dueAt: item.dueAt,
          confidence: item.confidence,
          ownerUserId: this.defaultOwnerId(state),
          createdAt: now,
        });
      }

      for (const item of extraction.followUps) {
        state.aiFollowUps.push({
          id: this.nextId(state, 'aifollowup', 'aif'),
          callId,
          summary: item.summary,
          dueAt: item.dueAt,
          confidence: item.confidence,
          createdAt: now,
        });
      }

      this.appendAudit(state, {
        action: 'call.ai.extract.saved',
        entityType: 'call',
        entityId: callId,
        detail: { confidence: extraction.confidence },
      });

      return summary;
    });
  }

  getAiSummary(callId: string): AiSummary | null {
    const state = this.store.read();
    const summaries = state.aiSummaries
      .filter((item) => item.callId === callId)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
    return summaries[0] ?? null;
  }

  approveAiSummary(actor: Actor, callId: string): AiSummary {
    return this.store.mutate((state) => {
      const summary =
        state.aiSummaries
          .filter((item) => item.callId === callId)
          .sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0] ?? null;
      if (!summary) {
        throw new NotFoundError('AiSummary', callId);
      }

      summary.status = 'approved';
      summary.approvedAt = this.nowIso();
      summary.approvedByUserId = actor.userId;

      const call = this.requireCall(state, callId);
      const followUps = state.aiFollowUps.filter((item) => item.callId === callId);
      const actionItems = state.aiActionItems.filter((item) => item.callId === callId);
      for (const item of followUps) {
        state.followUps.push({
          id: this.nextId(state, 'followup', 'fup'),
          contactId: call.contactId,
          assignedToUserId: actor.userId,
          summary: item.summary,
          dueAt: item.dueAt ?? new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
          createdAt: this.nowIso(),
        });
      }
      for (const item of actionItems) {
        state.tasks.push({
          id: this.nextId(state, 'task', 'tsk'),
          contactId: call.contactId,
          title: item.description,
          dueAt: item.dueAt,
          status: 'open',
          assignedToUserId: item.ownerUserId,
          createdAt: this.nowIso(),
        });
      }

      this.appendAudit(state, {
        actorUserId: actor.userId,
        action: 'call.ai.summary.approved',
        entityType: 'call',
        entityId: callId,
      });

      return summary;
    });
  }

  sendEmail(actor: Actor, input: SendEmailInput): OutboundMessage {
    return this.store.mutate((state) => {
      assertEmailPolicy(state.featureFlags);
      const now = this.nowIso();
      const message: OutboundMessage = {
        id: this.nextId(state, 'message', 'msg'),
        channel: 'email',
        status: 'queued',
        to: input.to,
        from: input.from,
        subject: input.subject,
        body: input.body,
        contactId: input.contactId,
        createdByUserId: actor.userId,
        createdAt: now,
        updatedAt: now,
      };
      state.messages.push(message);
      this.addMessageEvent(state, message.id, 'queued');
      this.enqueueJob(state, {
        type: 'email.send',
        payload: { messageId: message.id },
      });
      this.appendAudit(state, {
        actorUserId: actor.userId,
        action: 'message.email.send.requested',
        entityType: 'message',
        entityId: message.id,
      });
      return message;
    });
  }

  sendSms(actor: Actor, input: SendSmsInput): OutboundMessage {
    return this.store.mutate((state) => {
      assertSmsPolicy(state.featureFlags);
      const now = this.nowIso();
      const message: OutboundMessage = {
        id: this.nextId(state, 'message', 'msg'),
        channel: 'sms',
        status: 'queued',
        to: input.to,
        from: input.from,
        body: input.body,
        contactId: input.contactId,
        createdByUserId: actor.userId,
        createdAt: now,
        updatedAt: now,
      };
      state.messages.push(message);
      this.addMessageEvent(state, message.id, 'queued');
      this.appendAudit(state, {
        actorUserId: actor.userId,
        action: 'message.sms.send.requested',
        entityType: 'message',
        entityId: message.id,
      });
      return message;
    });
  }

  getMessageStatus(messageId: string): OutboundMessage {
    const state = this.store.read();
    const message = state.messages.find((candidate) => candidate.id === messageId);
    if (!message) {
      throw new NotFoundError('Message', messageId);
    }
    return message;
  }

  setMessageStatus(messageId: string, status: MessageStatus, rawPayload?: Record<string, unknown>): void {
    this.store.mutate((state) => {
      const message = state.messages.find((candidate) => candidate.id === messageId);
      if (!message) {
        throw new NotFoundError('Message', messageId);
      }
      message.status = status;
      message.updatedAt = this.nowIso();
      this.addMessageEvent(state, message.id, status, rawPayload);
      this.appendAudit(state, {
        action: 'message.status.set',
        entityType: 'message',
        entityId: message.id,
        detail: { status },
      });
    });
  }

  getFeatureFlags(): FeatureFlags {
    return this.store.read().featureFlags;
  }

  patchFeatureFlags(actor: Actor, patch: Partial<FeatureFlags>): FeatureFlags {
    assertRole(actor.roles, ['owner']);
    return this.store.mutate((state) => {
      const next: FeatureFlags = {
        ...state.featureFlags,
        ...patch,
      };

      if (next.smsEnabled && !next.smsCampaignApproved) {
        throw new ValidationError(
          'Cannot enable SMS while smsCampaignApproved is false. Submit campaign approval first.'
        );
      }

      state.featureFlags = next;
      this.appendAudit(state, {
        actorUserId: actor.userId,
        action: 'admin.feature-flags.patch',
        entityType: 'feature-flags',
        detail: { patch, next },
      });
      return next;
    });
  }

  approveCampaign(actor: Actor, approvalNote: string): CampaignApproval {
    assertRole(actor.roles, ['owner']);
    if (!approvalNote.trim()) {
      throw new ValidationError('approvalNote is required');
    }

    return this.store.mutate((state) => {
      const approval: CampaignApproval = {
        id: this.nextId(state, 'approval', 'cap'),
        approvedByUserId: actor.userId,
        approvedAt: this.nowIso(),
        approvalNote,
      };
      state.campaignApprovals.push(approval);
      state.featureFlags.smsCampaignApproved = true;
      this.appendAudit(state, {
        actorUserId: actor.userId,
        action: 'admin.campaign-approval.create',
        entityType: 'campaign-approval',
        entityId: approval.id,
      });
      return approval;
    });
  }

  getAuditLogs(limit = 200) {
    const state = this.store.read();
    return [...state.auditLogs]
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .slice(0, limit);
  }

  claimDueJobs(limit = 10): JobRunResult {
    return this.store.mutate((state) => {
      const now = Date.now();
      const sorted = [...state.jobs].sort((left, right) => left.availableAt.localeCompare(right.availableAt));
      const due = sorted.filter((job) => new Date(job.availableAt).getTime() <= now).slice(0, limit);
      if (due.length === 0) {
        return {
          claimed: [],
        };
      }

      const dueIds = new Set(due.map((item) => item.id));
      state.jobs = state.jobs.filter((item) => !dueIds.has(item.id));
      this.appendAudit(state, {
        action: 'jobs.claim',
        entityType: 'job',
        detail: { count: due.length },
      });
      return {
        claimed: due,
      };
    });
  }

  requeueJob(job: CmsJob, delaySeconds = 30): void {
    this.store.mutate((state) => {
      const retryJob: CmsJob = {
        ...job,
        attempts: job.attempts + 1,
        availableAt: new Date(Date.now() + delaySeconds * 1000).toISOString(),
      };
      state.jobs.push(retryJob);
      this.appendAudit(state, {
        action: 'jobs.requeue',
        entityType: 'job',
        entityId: job.id,
        detail: { attempts: retryJob.attempts },
      });
    });
  }

  enqueueRetentionPurgeIfMissing(retentionDays = 90): void {
    this.store.mutate((state) => {
      const hasJob = state.jobs.some((job) => job.type === 'retention.purge');
      if (!hasJob) {
        this.enqueueJob(state, {
          type: 'retention.purge',
          payload: {
            retentionDays,
          },
        });
      }
    });
  }

  runRetentionPurge(retentionDays = 90): { purgedRecordings: number; purgedTranscripts: number } {
    return this.store.mutate((state) => {
      const now = new Date();
      const targets = calculatePurgeTargets(
        state.callRecordings,
        state.callTranscripts,
        now,
        retentionDays
      );

      for (const recordingId of targets.recordingIds) {
        const recording = state.callRecordings.find((item) => item.id === recordingId);
        if (recording && !recording.purgedAt) {
          recording.purgedAt = this.nowIso();
          recording.sourceUrl = 'purged://retention-policy';
        }
      }

      for (const transcriptId of targets.transcriptIds) {
        const transcript = state.callTranscripts.find((item) => item.id === transcriptId);
        if (transcript && !transcript.purgedAt) {
          transcript.purgedAt = this.nowIso();
          transcript.content = '[Purged by retention policy]';
        }
      }

      this.appendAudit(state, {
        action: 'retention.purge.run',
        entityType: 'retention',
        detail: {
          retentionDays,
          purgedRecordings: targets.recordingIds.length,
          purgedTranscripts: targets.transcriptIds.length,
        },
      });

      return {
        purgedRecordings: targets.recordingIds.length,
        purgedTranscripts: targets.transcriptIds.length,
      };
    });
  }

  private createAuthSession(state: CmsState, user: UserRecord): AuthSession {
    const accessToken = createToken(
      {
        sub: user.id,
        roles: user.roles,
        type: 'access',
      },
      this.config.accessTokenTtlSeconds,
      this.config.jwtSecret
    );

    const refreshToken = createToken(
      {
        sub: user.id,
        roles: user.roles,
        type: 'refresh',
      },
      this.config.refreshTokenTtlSeconds,
      this.config.jwtSecret
    );

    state.refreshTokens.push({
      id: this.nextId(state, 'refresh', 'rft'),
      userId: user.id,
      tokenHash: hashOpaqueToken(refreshToken),
      expiresAt: new Date(Date.now() + this.config.refreshTokenTtlSeconds * 1000).toISOString(),
      createdAt: this.nowIso(),
    });

    return {
      user: sanitizeUser(user),
      tokens: {
        accessToken,
        refreshToken,
        expiresInSeconds: this.config.accessTokenTtlSeconds,
      },
    };
  }

  private requireContact(state: CmsState, contactId: string): Contact {
    const contact = state.contacts.find((candidate) => candidate.id === contactId);
    if (!contact) {
      throw new NotFoundError('Contact', contactId);
    }
    return contact;
  }

  private requireCall(state: CmsState, callId: string): Call {
    const call = state.calls.find((candidate) => candidate.id === callId);
    if (!call) {
      throw new NotFoundError('Call', callId);
    }
    return call;
  }

  private defaultOwnerId(state: CmsState): string {
    return (
      state.users.find((item) => item.roles.includes('owner'))?.id ??
      state.users[0]?.id ??
      'unknown'
    );
  }

  private enqueueJob(
    state: CmsState,
    input:
      | {
          type: 'email.send';
          payload: {
            messageId: string;
          };
        }
      | {
          type: 'call.transcribe';
          payload: {
            callId: string;
            recordingId: string;
            recordingUrl: string;
          };
        }
      | {
          type: 'call.extract';
          payload: {
            callId: string;
          };
        }
      | {
          type: 'retention.purge';
          payload: {
            retentionDays: number;
          };
        }
  ): CmsJob {
    const now = this.nowIso();
    const jobId = this.nextId(state, 'job', 'job');
    const job: CmsJob = {
      id: jobId,
      type: input.type,
      payload: input.payload,
      createdAt: now,
      availableAt: now,
      attempts: 0,
    } as CmsJob;
    state.jobs.push(job);
    return job;
  }

  private addMessageEvent(
    state: CmsState,
    messageId: string,
    status: MessageStatus,
    rawPayload?: Record<string, unknown>
  ): MessageEvent {
    const event: MessageEvent = {
      id: this.nextId(state, 'messageevent', 'mse'),
      messageId,
      status,
      rawPayload,
      createdAt: this.nowIso(),
    };
    state.messageEvents.push(event);
    return event;
  }

  private appendAudit(
    state: CmsState,
    input: {
      actorUserId?: string;
      action: string;
      entityType: string;
      entityId?: string;
      detail?: Record<string, unknown>;
    }
  ): void {
    state.auditLogs.push({
      id: this.nextId(state, 'audit', 'adt'),
      actorUserId: input.actorUserId,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      createdAt: this.nowIso(),
      detail: input.detail,
    });
  }

  private nowIso(): string {
    return new Date().toISOString();
  }

  private nextId(state: CmsState, counterName: string, prefix: string): string {
    const next = (state.counters[counterName] ?? 0) + 1;
    state.counters[counterName] = next;
    return `${prefix}_${next}`;
  }
}

export function sanitizeUser(user: UserRecord): User {
  const { passwordHash: _passwordHash, ...safeUser } = user;
  return safeUser;
}
