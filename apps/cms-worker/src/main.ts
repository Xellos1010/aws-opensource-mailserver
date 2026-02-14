import {
  CmsJob,
  CmsService,
  JsonStateStore,
  MockExtractionProvider,
  MockTranscriptionProvider,
} from '@mm/cms-core';

function env(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (!value) {
    throw new Error(`Missing required env ${name}`);
  }
  return value;
}

const config = {
  stateFilePath: env('CMS_STATE_FILE', 'tmp/cms/data/state.json'),
  jwtSecret: env('CMS_JWT_SECRET', 'cms-local-jwt-secret'),
  passwordSalt: env('CMS_PASSWORD_SALT', 'cms-local-password-salt'),
  ownerEmail: env('CMS_OWNER_EMAIL', 'owner@emcnotary.com'),
  ownerName: env('CMS_OWNER_NAME', 'Owner User'),
  ownerPassword: env('CMS_OWNER_PASSWORD', 'ChangeMe123!'),
  accessTokenTtlSeconds: Number(env('CMS_ACCESS_TOKEN_TTL_SECONDS', '1800')),
  refreshTokenTtlSeconds: Number(env('CMS_REFRESH_TOKEN_TTL_SECONDS', '604800')),
  pollIntervalMs: Number(env('CMS_WORKER_POLL_INTERVAL_MS', '3000')),
  retentionDays: Number(env('CMS_RETENTION_DAYS', '90')),
};

const store = new JsonStateStore({
  filePath: config.stateFilePath,
  passwordSalt: config.passwordSalt,
  ownerEmail: config.ownerEmail,
  ownerName: config.ownerName,
  ownerPassword: config.ownerPassword,
});

const service = new CmsService(store, {
  jwtSecret: config.jwtSecret,
  passwordSalt: config.passwordSalt,
  accessTokenTtlSeconds: config.accessTokenTtlSeconds,
  refreshTokenTtlSeconds: config.refreshTokenTtlSeconds,
});

const transcriptionProvider = new MockTranscriptionProvider();
const extractionProvider = new MockExtractionProvider();

let active = true;

process.on('SIGINT', () => {
  active = false;
});
process.on('SIGTERM', () => {
  active = false;
});

async function processJob(job: CmsJob): Promise<void> {
  if (job.type === 'email.send') {
    service.setMessageStatus(job.payload.messageId, 'sent', { provider: 'mock-mailhog' });
    return;
  }

  if (job.type === 'call.transcribe') {
    const transcript = await transcriptionProvider.transcribe({
      callId: job.payload.callId,
      recordingUrl: job.payload.recordingUrl,
    });
    service.saveTranscript(job.payload.callId, job.payload.recordingId, transcript);
    return;
  }

  if (job.type === 'call.extract') {
    const transcript = service.getTranscriptForCall(job.payload.callId);
    if (!transcript) {
      return;
    }
    const extraction = await extractionProvider.extract({
      callId: job.payload.callId,
      transcript: transcript.content,
    });
    service.saveExtraction(job.payload.callId, extraction);
    return;
  }

  if (job.type === 'retention.purge') {
    service.runRetentionPurge(job.payload.retentionDays);
  }
}

async function loop(): Promise<void> {
  service.enqueueRetentionPurgeIfMissing(config.retentionDays);

  while (active) {
    const { claimed } = service.claimDueJobs(25);
    for (const job of claimed) {
      try {
        await processJob(job);
      } catch (error) {
        service.requeueJob(job, Math.min(120, (job.attempts + 1) * 10));
        // eslint-disable-next-line no-console
        console.error('job failed', job.id, job.type, error);
      }
    }

    await new Promise((resolve) => {
      setTimeout(resolve, config.pollIntervalMs);
    });
  }
}

void loop().then(() => {
  // eslint-disable-next-line no-console
  console.log('cms-worker stopped');
});
