# CMS API Reference

Base URL (local): `http://localhost:4010`

Backend env:

- `CMS_STATE_BACKEND=postgres|json`
- `CMS_DATABASE_URL` required when backend is `postgres`

## Authentication

- `POST /auth/login`
- `POST /auth/refresh`
- `GET /auth/me`

## CRM

- `GET /contacts`
- `POST /contacts`
- `GET /contacts/:id`
- `PATCH /contacts/:id`
- `POST /contacts/:id/notes`
- `POST /contacts/:id/follow-ups`
- `POST /contacts/:id/stage-transition`
- `GET /accounts`
- `GET /pipeline/stages`

## Calling

- `POST /calls/start`
- `POST /calls/:id/end`
- `GET /calls/:id`
- `GET /calls/:id/transcript`
- `POST /webhooks/telephony/twilio`

## Messaging

- `POST /messages/email/send`
- `POST /messages/sms/send`
- `GET /messages/:id/status`

## AI

- `POST /ai/calls/:id/extract`
- `GET /ai/calls/:id/summary`
- `POST /ai/calls/:id/approve-summary`

## Admin

- `GET /admin/feature-flags`
- `PATCH /admin/feature-flags`
- `POST /admin/campaign-approval`
- `GET /admin/audit-logs`

## Local Testing Helpers

- `POST /debug/calls/:id/mock-transcript`

## Policy Behavior

`POST /messages/sms/send` returns `403` with `POLICY_BLOCKED` unless:

- `smsEnabled=true`
- `smsCampaignApproved=true`

When Postgres is unavailable, API returns `503` with `DB_UNAVAILABLE`.
