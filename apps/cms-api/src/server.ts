import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { createServer, IncomingMessage, Server, ServerResponse } from 'node:http';
import { URL } from 'node:url';
import {
  CmsService,
  MockExtractionProvider,
  MockTranscriptionProvider,
  MockTwilioTelephonyProvider,
  assertRole,
  CmsError,
  CmsStateStore,
} from '@mm/cms-core';
import {
  CallStatus,
  ContactStageId,
  ExtractionProvider,
  ProviderWebhookEvent,
  TelephonyProvider,
  TranscriptionProvider,
} from '@mm/cms-contracts';

export interface CmsApiConfig {
  stateStore: CmsStateStore;
  jwtSecret: string;
  passwordSalt: string;
  twilioWebhookSecret: string;
  accessTokenTtlSeconds: number;
  refreshTokenTtlSeconds: number;
}

export interface CmsApiServerContext {
  server: Server;
  service: CmsService;
  telephonyProvider: TelephonyProvider;
  transcriptionProvider: TranscriptionProvider;
  extractionProvider: ExtractionProvider;
}

interface JsonRequest {
  rawBody: string;
  body: Record<string, unknown>;
}

const JSON_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
};

export function createCmsApiServer(config: CmsApiConfig): CmsApiServerContext {
  const service = new CmsService(config.stateStore, {
    jwtSecret: config.jwtSecret,
    passwordSalt: config.passwordSalt,
    accessTokenTtlSeconds: config.accessTokenTtlSeconds,
    refreshTokenTtlSeconds: config.refreshTokenTtlSeconds,
  });

  const telephonyProvider = new MockTwilioTelephonyProvider();
  const transcriptionProvider = new MockTranscriptionProvider();
  const extractionProvider = new MockExtractionProvider();

  const server = createServer(async (req, res) => {
    setCorsHeaders(res);

    if (req.method === 'OPTIONS') {
      res.writeHead(204).end();
      return;
    }

    const requestId = randomUUID();
    try {
      const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
      const path = normalizePath(url.pathname);

      if (req.method === 'GET' && path === '/health') {
        writeJson(res, 200, {
          status: 'ok',
          service: 'cms-api',
          requestId,
          at: new Date().toISOString(),
        });
        return;
      }

      if (req.method === 'POST' && path === '/auth/login') {
        const { body } = await readJsonBody(req);
        const email = String(body.email ?? '');
        const password = String(body.password ?? '');
        const session = await service.login(email, password);
        writeJson(res, 200, {
          requestId,
          ...session,
        });
        return;
      }

      if (req.method === 'POST' && path === '/auth/refresh') {
        const { body } = await readJsonBody(req);
        const refreshToken = String(body.refreshToken ?? '');
        const session = await service.refresh(refreshToken);
        writeJson(res, 200, {
          requestId,
          ...session,
        });
        return;
      }

      if (req.method === 'GET' && path === '/auth/me') {
        const actor = service.authenticate(req.headers.authorization);
        writeJson(res, 200, {
          requestId,
          user: await service.getMe(actor),
        });
        return;
      }

      if (req.method === 'POST' && path === '/webhooks/telephony/twilio') {
        const request = await readJsonBody(req);
        verifyWebhookSignature(
          request.rawBody,
          req.headers['x-twilio-signature'],
          config.twilioWebhookSecret
        );

        const eventId =
          String(
            request.body.eventId ??
              request.body.EventSid ??
              request.body.RecordingSid ??
              request.body.CallSid ??
              randomUUID()
          );
        const providerEvent: ProviderWebhookEvent = {
          source: 'twilio',
          eventId,
          payload: request.body,
        };

        const normalizedEvents = await telephonyProvider.handleWebhook(providerEvent);
        const result = await service.ingestTelephonyEvents('twilio', normalizedEvents);
        writeJson(res, 202, {
          requestId,
          accepted: result.accepted,
          ignored: result.ignored,
        });
        return;
      }

      const actor = service.authenticate(req.headers.authorization);

      if (req.method === 'GET' && path === '/contacts') {
        writeJson(res, 200, {
          requestId,
          contacts: await service.listContacts(),
        });
        return;
      }

      if (req.method === 'POST' && path === '/contacts') {
        const request = await readJsonBody(req);
        const contact = await service.createContact(actor, {
          firstName: String(request.body.firstName ?? ''),
          lastName: String(request.body.lastName ?? ''),
          email: request.body.email ? String(request.body.email) : undefined,
          phone: request.body.phone ? String(request.body.phone) : undefined,
          jobTitle: request.body.jobTitle ? String(request.body.jobTitle) : undefined,
          accountId: request.body.accountId ? String(request.body.accountId) : undefined,
          ownerUserId: request.body.ownerUserId ? String(request.body.ownerUserId) : undefined,
        });
        writeJson(res, 201, {
          requestId,
          contact,
        });
        return;
      }

      if (req.method === 'GET' && path.startsWith('/contacts/')) {
        const segments = path.split('/').filter(Boolean);
        if (segments.length === 2) {
          const contact = await service.getContact(segments[1]);
          writeJson(res, 200, {
            requestId,
            contact,
          });
          return;
        }
      }

      if (req.method === 'PATCH' && path.startsWith('/contacts/')) {
        const segments = path.split('/').filter(Boolean);
        if (segments.length === 2) {
          const request = await readJsonBody(req);
          const contact = await service.patchContact(
            actor,
            segments[1],
            request.body as Record<string, unknown>
          );
          writeJson(res, 200, {
            requestId,
            contact,
          });
          return;
        }
      }

      if (req.method === 'POST' && path.match(/^\/contacts\/[^/]+\/notes$/)) {
        const segments = path.split('/').filter(Boolean);
        const request = await readJsonBody(req);
        await service.addContactNote(actor, segments[1], String(request.body.body ?? ''));
        writeJson(res, 201, {
          requestId,
          ok: true,
        });
        return;
      }

      if (req.method === 'POST' && path.match(/^\/contacts\/[^/]+\/follow-ups$/)) {
        const segments = path.split('/').filter(Boolean);
        const request = await readJsonBody(req);
        await service.addFollowUp(
          actor,
          segments[1],
          String(request.body.summary ?? ''),
          String(request.body.dueAt ?? new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()),
          request.body.assignedToUserId ? String(request.body.assignedToUserId) : undefined
        );
        writeJson(res, 201, {
          requestId,
          ok: true,
        });
        return;
      }

      if (req.method === 'POST' && path.match(/^\/contacts\/[^/]+\/stage-transition$/)) {
        const segments = path.split('/').filter(Boolean);
        const request = await readJsonBody(req);
        const contact = await service.transitionStage(
          actor,
          segments[1],
          String(request.body.toStageId) as ContactStageId,
          request.body.reason ? String(request.body.reason) : undefined
        );
        writeJson(res, 200, {
          requestId,
          contact,
        });
        return;
      }

      if (req.method === 'GET' && path === '/accounts') {
        writeJson(res, 200, {
          requestId,
          accounts: await service.listAccounts(),
        });
        return;
      }

      if (req.method === 'GET' && path === '/pipeline/stages') {
        writeJson(res, 200, {
          requestId,
          stages: await service.listStages(),
        });
        return;
      }

      if (req.method === 'POST' && path === '/calls/start') {
        const request = await readJsonBody(req);
        const call = await service.createOutboundCallIntent(actor, {
          contactId: String(request.body.contactId ?? ''),
          fromNumber: String(request.body.fromNumber ?? ''),
          toNumber: String(request.body.toNumber ?? ''),
          provider: request.body.provider ? (String(request.body.provider) as 'twilio' | 'telnyx' | 'mock') : 'twilio',
        });
        const providerRef = await telephonyProvider.createOutboundCall({
          callId: call.id,
          fromNumber: call.fromNumber,
          toNumber: call.toNumber,
          recordCall: true,
          callerName: 'EMC Notary',
          consentPrompt:
            'This call may be recorded for quality and compliance. By staying on the line, you consent to recording.',
        });
        const boundCall = await service.bindProviderCall(call.id, providerRef);
        writeJson(res, 201, {
          requestId,
          call: boundCall,
          consentPromptEnabled: true,
          consentPrompt:
            'This call may be recorded for quality and compliance. By staying on the line, you consent to recording.',
        });
        return;
      }

      if (req.method === 'POST' && path.match(/^\/calls\/[^/]+\/end$/)) {
        const segments = path.split('/').filter(Boolean);
        const request = await readJsonBody(req);
        const allowedStatuses: CallStatus[] = ['completed', 'failed', 'no-answer', 'canceled'];
        const rawStatus = request.body.status ? String(request.body.status) : 'completed';
        const finalStatus = allowedStatuses.includes(rawStatus as CallStatus)
          ? (rawStatus as CallStatus)
          : 'completed';
        const call = await service.endCall(actor, segments[1], finalStatus);
        writeJson(res, 200, {
          requestId,
          call,
        });
        return;
      }

      if (req.method === 'GET' && path.match(/^\/calls\/[^/]+$/)) {
        const segments = path.split('/').filter(Boolean);
        const call = await service.getCall(segments[1]);
        writeJson(res, 200, {
          requestId,
          call,
        });
        return;
      }

      if (req.method === 'GET' && path.match(/^\/calls\/[^/]+\/transcript$/)) {
        const segments = path.split('/').filter(Boolean);
        const transcript = await service.getTranscriptForCall(segments[1]);
        writeJson(res, 200, {
          requestId,
          transcript,
        });
        return;
      }

      if (req.method === 'POST' && path === '/messages/email/send') {
        const request = await readJsonBody(req);
        const message = await service.sendEmail(actor, {
          to: String(request.body.to ?? ''),
          from: String(request.body.from ?? ''),
          subject: String(request.body.subject ?? ''),
          body: String(request.body.body ?? ''),
          contactId: request.body.contactId ? String(request.body.contactId) : undefined,
        });
        writeJson(res, 202, {
          requestId,
          message,
        });
        return;
      }

      if (req.method === 'POST' && path === '/messages/sms/send') {
        const request = await readJsonBody(req);
        const message = await service.sendSms(actor, {
          to: String(request.body.to ?? ''),
          from: String(request.body.from ?? ''),
          body: String(request.body.body ?? ''),
          contactId: request.body.contactId ? String(request.body.contactId) : undefined,
        });
        writeJson(res, 202, {
          requestId,
          message,
        });
        return;
      }

      if (req.method === 'GET' && path.match(/^\/messages\/[^/]+\/status$/)) {
        const segments = path.split('/').filter(Boolean);
        const message = await service.getMessageStatus(segments[1]);
        writeJson(res, 200, {
          requestId,
          message,
        });
        return;
      }

      if (req.method === 'POST' && path.match(/^\/ai\/calls\/[^/]+\/extract$/)) {
        const segments = path.split('/').filter(Boolean);
        const transcript = await service.getTranscriptForCall(segments[2]);
        if (!transcript) {
          throw new CmsError('TRANSCRIPT_REQUIRED', 'Transcript required before extraction', 400);
        }
        const extraction = await extractionProvider.extract({
          callId: segments[2],
          transcript: transcript.content,
        });
        const summary = await service.saveExtraction(segments[2], extraction);
        writeJson(res, 202, {
          requestId,
          summary,
        });
        return;
      }

      if (req.method === 'GET' && path.match(/^\/ai\/calls\/[^/]+\/summary$/)) {
        const segments = path.split('/').filter(Boolean);
        const summary = await service.getAiSummary(segments[2]);
        writeJson(res, 200, {
          requestId,
          summary,
        });
        return;
      }

      if (req.method === 'POST' && path.match(/^\/ai\/calls\/[^/]+\/approve-summary$/)) {
        const segments = path.split('/').filter(Boolean);
        const summary = await service.approveAiSummary(actor, segments[2]);
        writeJson(res, 200, {
          requestId,
          summary,
        });
        return;
      }

      if (req.method === 'GET' && path === '/admin/feature-flags') {
        assertRole(actor.roles, ['owner', 'manager']);
        writeJson(res, 200, {
          requestId,
          featureFlags: await service.getFeatureFlags(),
        });
        return;
      }

      if (req.method === 'PATCH' && path === '/admin/feature-flags') {
        assertRole(actor.roles, ['owner']);
        const request = await readJsonBody(req);
        const featureFlags = await service.patchFeatureFlags(actor, request.body);
        writeJson(res, 200, {
          requestId,
          featureFlags,
        });
        return;
      }

      if (req.method === 'POST' && path === '/admin/campaign-approval') {
        assertRole(actor.roles, ['owner']);
        const request = await readJsonBody(req);
        const approval = await service.approveCampaign(actor, String(request.body.approvalNote ?? ''));
        writeJson(res, 201, {
          requestId,
          approval,
        });
        return;
      }

      if (req.method === 'GET' && path === '/admin/audit-logs') {
        assertRole(actor.roles, ['owner', 'manager']);
        const limitParam = Number(url.searchParams.get('limit') ?? 200);
        const auditLogs = await service.getAuditLogs(Number.isNaN(limitParam) ? 200 : limitParam);
        writeJson(res, 200, {
          requestId,
          auditLogs,
        });
        return;
      }

      if (req.method === 'POST' && path.match(/^\/debug\/calls\/[^/]+\/mock-transcript$/)) {
        assertRole(actor.roles, ['owner', 'manager', 'caller']);
        const segments = path.split('/').filter(Boolean);
        const request = await readJsonBody(req);
        const transcript = await transcriptionProvider.transcribe({
          callId: segments[2],
          recordingUrl: String(request.body.recordingUrl ?? 'mock://recording.mp3'),
        });
        await service.saveTranscript(
          segments[2],
          request.body.recordingId ? String(request.body.recordingId) : undefined,
          transcript
        );
        writeJson(res, 202, {
          requestId,
          transcript,
        });
        return;
      }

      writeJson(res, 404, {
        requestId,
        error: {
          code: 'NOT_FOUND',
          message: `No route for ${req.method ?? 'GET'} ${path}`,
        },
      });
    } catch (error) {
      handleError(res, error, requestId);
    }
  });

  return {
    server,
    service,
    telephonyProvider,
    transcriptionProvider,
    extractionProvider,
  };
}

function normalizePath(pathname: string): string {
  if (!pathname || pathname === '/') {
    return '/';
  }
  const normalized = pathname.replace(/\/+$/, '');
  return normalized.startsWith('/') ? normalized : `/${normalized}`;
}

async function readJsonBody(req: IncomingMessage): Promise<JsonRequest> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const rawBody = Buffer.concat(chunks).toString('utf8').trim();
  if (!rawBody) {
    return { rawBody: '{}', body: {} };
  }
  return {
    rawBody,
    body: JSON.parse(rawBody) as Record<string, unknown>,
  };
}

function verifyWebhookSignature(
  rawBody: string,
  signatureHeader: string | string[] | undefined,
  secret: string
): void {
  const candidate = Array.isArray(signatureHeader) ? signatureHeader[0] : signatureHeader;
  if (!candidate) {
    throw new CmsError('WEBHOOK_SIGNATURE_MISSING', 'Missing webhook signature', 401);
  }
  const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
  const actual = Buffer.from(candidate);
  const expectedBuf = Buffer.from(expected);
  if (actual.length !== expectedBuf.length || !timingSafeEqual(actual, expectedBuf)) {
    throw new CmsError('WEBHOOK_SIGNATURE_INVALID', 'Invalid webhook signature', 401);
  }
}

function setCorsHeaders(res: ServerResponse): void {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Twilio-Signature');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,OPTIONS');
}

function writeJson(res: ServerResponse, statusCode: number, payload: unknown): void {
  res.writeHead(statusCode, JSON_HEADERS);
  res.end(JSON.stringify(payload));
}

function handleError(res: ServerResponse, error: unknown, requestId: string): void {
  if (error instanceof CmsError) {
    writeJson(res, error.statusCode, {
      requestId,
      error: {
        code: error.code,
        message: error.message,
        detail: error.detail,
      },
    });
    return;
  }

  if (error instanceof SyntaxError) {
    writeJson(res, 400, {
      requestId,
      error: {
        code: 'INVALID_JSON',
        message: error.message,
      },
    });
    return;
  }

  const message = error instanceof Error ? error.message : 'Unknown error';
  writeJson(res, 500, {
    requestId,
    error: {
      code: 'INTERNAL_ERROR',
      message,
    },
  });
}
