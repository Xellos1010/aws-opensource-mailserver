# CMS Outreach Platform

This implementation adds a local-first CMS outreach stack with:

- `cms-web` React app (login wall, contacts, calling, email, policy-gated SMS UI)
- `cms-api` Node API with auth/RBAC, contacts/calls/messaging/AI/admin endpoints
- `cms-worker` async job processor (email dispatch simulation, transcription, extraction, retention)
- `cms-telephony-sim` deterministic Twilio webhook replay simulator
- Local dependencies: PostgreSQL, MinIO, LocalStack (SQS/S3 emulation), MailHog

## Quick Start

1. Start infra dependencies:

```bash
cd apps/cms-platform
docker compose -f docker-compose.local.yml up -d postgres minio localstack mailhog
```

2. Start app services locally (host process mode):

```bash
export CMS_STATE_BACKEND=postgres
export CMS_DATABASE_URL=postgres://cms:cms@localhost:5432/cms
pnpm run cms:migrate
pnpm nx run cms-api:serve
pnpm nx run cms-worker:serve
pnpm nx run cms-web:serve
pnpm nx run cms-telephony-sim:serve
```

3. Open services:

- Web UI: `http://localhost:4173`
- API health: `http://localhost:4010/health`
- Telephony simulator: `http://localhost:4050/health`
- MailHog UI: `http://localhost:8025`
- MinIO console: `http://localhost:9001`

Default login credentials:

- Email: `owner@emcnotary.com`
- Password: `ChangeMe123!`

## One-Command Full Compose

To run infra and apps in Docker together:

```bash
cd apps/cms-platform
docker compose -f docker-compose.local.yml --profile apps up
```

## Backend Selection

- `CMS_STATE_BACKEND=postgres` (default for local stack now)
- `CMS_DATABASE_URL=postgres://cms:cms@localhost:5432/cms`
- `CMS_STATE_BACKEND=json` can still be used temporarily for rollback mode.

## Deterministic Call Flow Replay

1. Start a call in the web UI.
2. Replay lifecycle and recording events:

```bash
curl -X POST http://localhost:4050/replay \
  -H 'content-type: application/json' \
  -d '{"providerCallId":"TWILIO_cal_1"}'
```

3. Worker picks up transcription/extraction jobs.

## Policy Defaults

At first boot, feature flags are initialized to:

- `emailEnabled=true`
- `smsEnabled=false`
- `smsCampaignApproved=false`
- `webSoftphoneEnabled=false`

SMS sends are hard-blocked until both campaign approval and SMS enablement are true.

## Nginx Route Example (`cms.emcnotary.com`)

```nginx
server {
  listen 443 ssl;
  server_name cms.emcnotary.com;

  location / {
    root /var/www/cms-web;
    try_files $uri /index.html;
  }

  location /api/ {
    proxy_pass http://127.0.0.1:4010/;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}
```

## Local Validation Checklist

- Login succeeds with owner account.
- Create contact and add note.
- Start call and replay webhook lifecycle.
- Verify transcript exists through `GET /calls/:id/transcript`.
- Send email and verify message moves to `sent` by worker.
- Attempt SMS and confirm `POLICY_BLOCKED` response.
- Run retention via worker and verify old raw artifacts are purged.
