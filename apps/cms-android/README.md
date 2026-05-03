# cms-android (Phase 2 Foundation)

This folder contains the Android-first call client skeleton for the CMS outreach platform.

## Goals

- Authenticate against `cms-api`
- Start outbound calls through Twilio Voice SDK
- Capture call lifecycle and recording metadata
- Send call events to backend for transcript/AI processing

## Current Contents

- Kotlin `MainActivity` skeleton
- API service and DTO placeholders
- Build configuration notes for Twilio token provisioning

## Next Implementation Tasks

1. Add Twilio Voice SDK dependency and token refresh flow.
2. Implement login and secure token storage (EncryptedSharedPreferences).
3. Add dialer UI and call controls.
4. Stream call events to `POST /calls/start`, webhook events via Twilio, and call summary views.
