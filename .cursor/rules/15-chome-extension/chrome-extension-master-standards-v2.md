# Chrome Extension Engineering Standard (CEES)

Version: 2.0 (audit-based)

Purpose: a single, comprehensive ruleset for building Manifest V3 Chrome extensions to a very high standard (security, privacy, maintainability, performance, and Chrome Web Store readiness). Designed to be pasted into a GPT workspace / interview environment.

---

## 0) Non‑negotiables

### Security & privacy
- **Never ship secrets** in the extension package (API keys, usernames/passwords, private keys, tokens, test credentials, etc.).
- **Never expose sensitive files via `web_accessible_resources`**.
- **No PHI/PII in logs** (including debug logs) unless the user explicitly enables a “safe debug mode” that redacts by default.
- **No remote code execution**: do not load or execute remote JavaScript/WASM. All executable code must ship with the extension.
- **No `eval()` / `new Function()` / dynamic script strings**.

### Permissions
- Default to **minimum permissions**. Every permission must map to a user-visible feature.
- Prefer **optional permissions / optional host permissions** and request them **only at the moment a feature is enabled**.
- If a feature is not enabled, the extension must still function without crashing.

### MV3 reality
- The service worker **will be terminated frequently**. Everything must survive restarts.

### Chrome Web Store readiness
- The extension must have a **single clear purpose**.
- If user data is handled, an accurate **privacy policy** is required.
- Do not collect browsing activity unless it is strictly required for the declared purpose.

---

## 1) Platform constraints you must design around

### 1.1 MV3 service worker lifecycle constraints
- Treat the service worker as **ephemeral**:
  - No reliance on global state.
  - Persist all durable state.
  - Make every handler **idempotent**.
  - Every long-running workflow must be resumable.
- Handlers must be structured as:
  1) validate input + permissions
  2) load state (storage)
  3) perform bounded work
  4) persist state
  5) respond

### 1.2 Permission model constraints
- Script injection (`chrome.scripting`) requires **host access** (either `activeTab` or host permissions).
- Prefer a UX that requests host access **per site** and **only when needed**.
- Assume host access can be denied; every feature must have a graceful failure path.

### 1.3 Web accessible resources constraints
- `web_accessible_resources` is an allowlist of extension files that websites can fetch.
- Treat it as a **public surface area**: if it’s web accessible, assume hostile sites can read it.

### 1.4 Storage constraints
- Web Storage (`localStorage`) is not available in the service worker.
- `chrome.storage.*` is JSON-based and quota-limited; use IndexedDB for larger data.

---

## 2) Architecture standard

### 2.1 Mandatory component boundaries
- **UI surfaces** (side panel / popup / options) are “clients” and must not contain business logic.
- **Service worker** is the orchestrator, but must be thin:
  - route messages
  - enforce permissions
  - enforce security policy
  - call domain services
- **Domain services** (automation engine, storage, providers, telemetry) live in libraries and are unit-testable.
- **Content scripts** are “adapters”:
  - minimal DOM work
  - no secrets
  - no persistent state

### 2.2 Message-driven, versioned protocol
- All UI ↔ SW ↔ content-script interactions use a **single message protocol**.
- Every message uses this envelope:
  - `type`: string literal union
  - `payload`: validated at runtime
  - `correlationId`: stable identifier for request/response pairs
  - `schemaVersion`: incremented when breaking changes occur
- Reject unknown message types.

### 2.3 Trust boundaries & sender validation
- Treat all inbound message payloads as untrusted.
- For messages from content scripts, validate:
  - `sender.tab?.id` (expected tab)
  - `sender.url` (expected origin / match)
  - optional: handshake token established during injection

### 2.4 State & migrations
- Every stored object has:
  - a schema (TypeScript type + runtime validation)
  - a `schemaVersion`
  - deterministic migrations
- All migrations must be unit tested.

### 2.5 Configuration & feature flags
- Remote configuration is allowed only as **data**, never as executable code.
- Feature flags must be:
  - default-off for risky features
  - kill-switchable (disable without new release)

---

## 3) Security, privacy, and compliance

### 3.1 Data classification
Classify every field as one of:
- **Public**: safe anywhere.
- **Internal**: safe in extension storage, not in logs.
- **Sensitive**: credentials, tokens, personal identifiers.
- **Regulated**: PHI/health, financial, government IDs.

### 3.2 Storage rules
- **Credentials/tokens**
  - Prefer not storing.
  - If storing: encrypt-at-rest; keep in **session** by default; allow “remember me” only with explicit consent.
- **Regulated data**
  - Default to session-only.
  - If persistence is required: user must opt-in; encryption, retention policy, and secure-delete workflow required.

### 3.3 Cryptography standard (WebCrypto)
- Use `crypto.subtle` only (no custom crypto).
- **AES-GCM** for encryption with:
  - random 96-bit IV per encryption
  - authentication enforced (no silent decrypt failures)
- **KDF** for passphrase-derived keys:
  - PBKDF2 with a **random salt** stored alongside ciphertext
  - iteration count should be configurable and revisited periodically
- **Never** use deterministic salts based on public data (like extension IDs).
- Key management:
  - keys must be unlockable/rotatable
  - key material must not be written to disk unencrypted

### 3.4 Logging & telemetry
- Logs must be structured.
- Default logs include only:
  - event name
  - stable identifiers (non-sensitive)
  - timing
  - extension version
- Sensitive/regulated content must be:
  - removed, or
  - replaced with stable hashes, or
  - redacted.

### 3.5 Network & exfiltration controls
- All network access must be over HTTPS.
- Maintain an allowlist of domains your extension contacts.
- Never send sensitive/regulated data off-device without:
  - explicit user consent
  - documented retention
  - transport security

### 3.6 CSP rules
- Keep CSP strict.
- No `unsafe-eval`.
- No inline scripts.

### 3.7 `web_accessible_resources` rules
- Only include the minimum set of static assets required.
- Never expose:
  - credential files
  - private keys
  - debug dumps
  - any file that can be used to fingerprint users or leak data
- Restrict `matches` to only origins that need access.
- Consider `use_dynamic_url` for resources that don’t need stable URLs.

### 3.8 External connectivity
- `externally_connectable` is **off by default**.
- If enabled, restrict to your owned domains and validate message origins.

---

## 4) API usage rules (high-impact)

### 4.1 `chrome.action`
- If you define `action.default_popup`, do **not** rely on `chrome.action.onClicked`.
- Treat `chrome.action.openPopup()` as best-effort (requires user gesture).

### 4.2 `chrome.permissions`
- Use optional permissions/hosts and request at point-of-use.
- Always show a human explanation in the UI before prompting.
- Store per-feature permission state so you can explain why something is disabled.

### 4.3 `chrome.scripting`
- Prefer declarative content scripts when possible.
- If you must inject dynamically:
  - require user gesture
  - ensure host access exists
  - inject only bundled files (no code strings)
  - implement an “already injected?” handshake
  - avoid injecting repeatedly without idempotency guarantees

### 4.4 Messaging (`chrome.runtime.onMessage`, ports)
- All message handlers must:
  - validate schema
  - validate sender
  - return structured errors
- For async `sendResponse`, return `true` from the listener.
- Prefer long-lived ports (`chrome.runtime.connect`) for streaming progress.

### 4.5 `chrome.storage`
- Use the smallest appropriate store:
  - `session` for ephemeral
  - `local` for durable
  - `sync` only when explicitly needed
- Do not store secrets unencrypted.
- Implement write coalescing and avoid hot loops writing storage.

### 4.6 `chrome.alarms`
- Use alarms only for coarse scheduling.
- Always persist the job queue and recreate alarms on startup.
- Never assume alarms persist across restarts.

### 4.7 Side panel
- Side panel is the preferred “always-on” UI for complex flows.
- Use it to host any long-lived UI state (e.g., unlocked session state).

### 4.8 `chrome.identity`
- Prefer OAuth via `chrome.identity` for Google integrations.
- Minimize scopes.
- Never embed client secrets.

### 4.9 `chrome.cookies`
- Requires explicit justification; only use if essential.
- Keep host permissions narrow.

### 4.10 Network interception
- Prefer `declarativeNetRequest` over `webRequest` where possible.

---

## 5) Implementation process (surgical iteration)

### 5.1 Feature slice template
For each feature, produce these artifacts:
1. **One-sentence purpose** (user-visible).
2. **Permission delta**: changes in `permissions`, `host_permissions` / `optional_host_permissions`, `web_accessible_resources`.
3. **Data delta**: what data is collected/stored, retention, redaction.
4. **Threat model**: misuse cases + mitigations.
5. **Architecture delta**: modules touched, message types added.
6. **Test plan**: unit + integration + e2e.
7. **Rollback strategy**: how to disable feature without bricking.

### 5.2 Definition of Done
- Feature works after service worker restart.
- No new required permissions without a user-facing feature.
- No secrets.
- Tests added.
- Logs are PHI-safe.

---

## 6) PR checklist

- [ ] Manifest diff reviewed (permissions, hosts, `web_accessible_resources`).
- [ ] Message schemas updated and validated.
- [ ] Sender validation exists for new message paths.
- [ ] Storage writes have schemas + migrations.
- [ ] Long workflows checkpoint/resume.
- [ ] No secrets added.
- [ ] CSP unchanged or tightened.
- [ ] E2E test updated or added.

---

## 7) Release and operational readiness

### 7.1 Build & reproducibility
- Builds must be deterministic from lockfiles.
- Bundle analysis must exist for size regressions.

### 7.2 Key management (stable IDs)
- Never commit private keys.
- If stable unpacked-extension IDs are required, use a **public key** (manifest `key`) derived from a PEM keypair, and store it safely.
- Public keys may be committed if that aligns with your distribution model; private keys never.

### 7.3 Pre-submission checklist
- Verify:
  - permissions are minimal
  - privacy policy is accurate
  - data handling disclosures match reality
  - no PHI/PII in logs
  - no remote code

---

## 8) Audit checklists

### 8.1 Security audit checklist
- [ ] No secrets in repo or build output.
- [ ] No secrets in `web_accessible_resources`.
- [ ] Host permissions minimized; optional where possible.
- [ ] Sender validation on all inbound messages.
- [ ] Encryption-at-rest for sensitive data.

### 8.2 Performance audit checklist
- [ ] No tight polling loops.
- [ ] Storage writes coalesced.
- [ ] Content scripts minimal and page-safe.

### 8.3 Reliability audit checklist
- [ ] Works after SW restart.
- [ ] Jobs resume from checkpoints.
- [ ] Alarms recreated on startup.

---

## 9) GPT workspace “system prompt” (paste into your workspace)

You are a staff-level Chrome extension engineer working in a monorepo.

Rules:
- Follow CEES strictly.
- Before writing code, produce a plan with: permission delta, message schema delta, data delta, tests.
- Implement minimal diffs.
- Never introduce secrets.
- If any change touches permissions or `web_accessible_resources`, explicitly justify it and propose a safer alternative.

Commands:
- `/spec` Produce the feature slice template.
- `/design` Produce architecture + message schemas.
- `/impl` Implement minimal diff in TypeScript.
- `/test` Produce unit/integration/e2e test plan and code.
- `/review` Run PR checklist against the diff.
