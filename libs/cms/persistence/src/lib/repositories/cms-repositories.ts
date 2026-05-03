import {
  Account,
  AiActionItem,
  AiFollowUpSuggestion,
  AiSummary,
  AuditLog,
  Call,
  CallEvent,
  CallRecording,
  CallTranscript,
  CampaignApproval,
  CmsJob,
  Contact,
  ContactAvailability,
  ContactMethod,
  ContactStageHistoryEntry,
  FeatureFlags,
  FollowUp,
  Interaction,
  OutboundMessage,
  Reminder,
  Stage,
  Task,
  WebhookEventDedupe,
} from '@mm/cms-contracts';
import { CmsState, MessageEvent, RefreshTokenRecord, UserRecord } from '@mm/cms-core';
import { SqlQueryable } from '../sql-client';
import { CounterRepository, JsonTableRepository, SingletonJsonRepository } from './json-table-repository';

interface CmsMeta {
  version: number;
  createdAt: string;
  updatedAt: string;
}

export class CmsRepositories {
  readonly meta = new SingletonJsonRepository<CmsMeta>('cms_meta');
  readonly users = new JsonTableRepository<UserRecord>('users');
  readonly refreshTokens = new JsonTableRepository<RefreshTokenRecord>('refresh_tokens');
  readonly accounts = new JsonTableRepository<Account>('accounts');
  readonly contacts = new JsonTableRepository<Contact>('contacts');
  readonly contactMethods = new JsonTableRepository<ContactMethod>('contact_methods');
  readonly contactAvailability = new JsonTableRepository<ContactAvailability>('contact_availability');
  readonly stages = new JsonTableRepository<Stage>('stages');
  readonly stageHistory = new JsonTableRepository<ContactStageHistoryEntry>('stage_history');
  readonly interactions = new JsonTableRepository<Interaction>('interactions');
  readonly followUps = new JsonTableRepository<FollowUp>('follow_ups');
  readonly tasks = new JsonTableRepository<Task>('tasks');
  readonly reminders = new JsonTableRepository<Reminder>('reminders');
  readonly calls = new JsonTableRepository<Call>('calls');
  readonly callEvents = new JsonTableRepository<CallEvent>('call_events');
  readonly callRecordings = new JsonTableRepository<CallRecording>('call_recordings');
  readonly callTranscripts = new JsonTableRepository<CallTranscript>('call_transcripts');
  readonly aiSummaries = new JsonTableRepository<AiSummary>('ai_summaries');
  readonly aiActionItems = new JsonTableRepository<AiActionItem>('ai_action_items');
  readonly aiFollowUps = new JsonTableRepository<AiFollowUpSuggestion>('ai_follow_ups');
  readonly messages = new JsonTableRepository<OutboundMessage>('messages');
  readonly messageEvents = new JsonTableRepository<MessageEvent>('message_events');
  readonly featureFlags = new SingletonJsonRepository<FeatureFlags>('feature_flags');
  readonly campaignApprovals = new JsonTableRepository<CampaignApproval>('campaign_approvals');
  readonly auditLogs = new JsonTableRepository<AuditLog>('audit_logs');
  readonly webhookEventDedupe = new JsonTableRepository<WebhookEventDedupe>('webhook_event_dedupe');
  readonly jobs = new JsonTableRepository<CmsJob>('jobs');
  readonly counters = new CounterRepository();

  async readState(db: SqlQueryable): Promise<CmsState | null> {
    const meta = await this.meta.get(db);
    if (!meta) {
      return null;
    }

    const [
      users,
      refreshTokens,
      accounts,
      contacts,
      contactMethods,
      contactAvailability,
      stages,
      stageHistory,
      interactions,
      followUps,
      tasks,
      reminders,
      calls,
      callEvents,
      callRecordings,
      callTranscripts,
      aiSummaries,
      aiActionItems,
      aiFollowUps,
      messages,
      messageEvents,
      featureFlags,
      campaignApprovals,
      auditLogs,
      webhookEventDedupe,
      jobs,
      counters,
    ] = await Promise.all([
      this.users.list(db),
      this.refreshTokens.list(db),
      this.accounts.list(db),
      this.contacts.list(db),
      this.contactMethods.list(db),
      this.contactAvailability.list(db),
      this.stages.list(db),
      this.stageHistory.list(db),
      this.interactions.list(db),
      this.followUps.list(db),
      this.tasks.list(db),
      this.reminders.list(db),
      this.calls.list(db),
      this.callEvents.list(db),
      this.callRecordings.list(db),
      this.callTranscripts.list(db),
      this.aiSummaries.list(db),
      this.aiActionItems.list(db),
      this.aiFollowUps.list(db),
      this.messages.list(db),
      this.messageEvents.list(db),
      this.featureFlags.get(db),
      this.campaignApprovals.list(db),
      this.auditLogs.list(db),
      this.webhookEventDedupe.list(db),
      this.jobs.list(db),
      this.counters.list(db),
    ]);

    return {
      meta,
      users,
      refreshTokens,
      accounts,
      contacts,
      contactMethods,
      contactAvailability,
      stages,
      stageHistory,
      interactions,
      followUps,
      tasks,
      reminders,
      calls,
      callEvents,
      callRecordings,
      callTranscripts,
      aiSummaries,
      aiActionItems,
      aiFollowUps,
      messages,
      messageEvents,
      featureFlags: featureFlags ?? {
        emailEnabled: true,
        smsEnabled: false,
        smsCampaignApproved: false,
        webSoftphoneEnabled: false,
      },
      campaignApprovals,
      auditLogs,
      webhookEventDedupe,
      jobs,
      counters,
    };
  }

  async replaceState(db: SqlQueryable, state: CmsState): Promise<void> {
    await this.meta.set(db, state.meta);
    await this.users.replaceAll(db, state.users);
    await this.refreshTokens.replaceAll(db, state.refreshTokens);
    await this.accounts.replaceAll(db, state.accounts);
    await this.contacts.replaceAll(db, state.contacts);
    await this.contactMethods.replaceAll(db, state.contactMethods);
    await this.contactAvailability.replaceAll(db, state.contactAvailability);
    await this.stages.replaceAll(db, state.stages);
    await this.stageHistory.replaceAll(db, state.stageHistory);
    await this.interactions.replaceAll(db, state.interactions);
    await this.followUps.replaceAll(db, state.followUps);
    await this.tasks.replaceAll(db, state.tasks);
    await this.reminders.replaceAll(db, state.reminders);
    await this.calls.replaceAll(db, state.calls);
    await this.callEvents.replaceAll(db, state.callEvents);
    await this.callRecordings.replaceAll(db, state.callRecordings);
    await this.callTranscripts.replaceAll(db, state.callTranscripts);
    await this.aiSummaries.replaceAll(db, state.aiSummaries);
    await this.aiActionItems.replaceAll(db, state.aiActionItems);
    await this.aiFollowUps.replaceAll(db, state.aiFollowUps);
    await this.messages.replaceAll(db, state.messages);
    await this.messageEvents.replaceAll(db, state.messageEvents);
    await this.campaignApprovals.replaceAll(db, state.campaignApprovals);
    await this.auditLogs.replaceAll(db, state.auditLogs);
    await this.webhookEventDedupe.replaceAll(db, state.webhookEventDedupe);
    await this.jobs.replaceAll(db, state.jobs);
    await this.counters.replaceAll(db, state.counters);

    await this.featureFlags.set(db, state.featureFlags);
  }
}
