import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { createCmsApiServer } from './server';

function env(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (!value) {
    throw new Error(`Missing required env: ${name}`);
  }
  return value;
}

const config = {
  port: Number(env('CMS_API_PORT', '4010')),
  stateFilePath: env('CMS_STATE_FILE', 'tmp/cms/data/state.json'),
  jwtSecret: env('CMS_JWT_SECRET', 'cms-local-jwt-secret'),
  passwordSalt: env('CMS_PASSWORD_SALT', 'cms-local-password-salt'),
  ownerEmail: env('CMS_OWNER_EMAIL', 'owner@emcnotary.com'),
  ownerName: env('CMS_OWNER_NAME', 'Owner User'),
  ownerPassword: env('CMS_OWNER_PASSWORD', 'ChangeMe123!'),
  twilioWebhookSecret: env('TWILIO_WEBHOOK_SECRET', 'local-twilio-secret'),
  accessTokenTtlSeconds: Number(env('CMS_ACCESS_TOKEN_TTL_SECONDS', '1800')),
  refreshTokenTtlSeconds: Number(env('CMS_REFRESH_TOKEN_TTL_SECONDS', '604800')),
};

mkdirSync(dirname(config.stateFilePath), { recursive: true });

const { server } = createCmsApiServer(config);
server.listen(config.port, '0.0.0.0', () => {
  // eslint-disable-next-line no-console
  console.log(`cms-api listening on http://0.0.0.0:${config.port}`);
});
