# Archive hepefoundation Audit and CDK Stack-Pipeline Propagation Plan for cdk-emc-notary

## Overview

- Goal: Inventory every new/unique capability in `Archive/hepefoundation`, port the reusable improvements into the CDK “stack pipeline” system, and apply them end-to-end on `apps/cdk-emc-notary` as the proving stack (deploy → modify → destroy, plus blue/green upgrade + low-downtime cutover).
- Owner: You
- Repo/Area: `Archive/hepefoundation/*`, `apps/cdk-emc-notary/*`, shared infra libs (`libs/infra/*`, `libs/support-scripts/*`), `apps/ops-runner/*`

## Context

- Current state:

- `Archive/hepefoundation` contains a complete “smart restart + mail health check + stop/start helper + emergency alarms” recovery system, including explicit wiring/permissions fixes between CloudWatch alarms and Lambda actions.
- `Archive/hepefoundation` also includes mailbox migration/restore tooling (prepare/upload/finalize scripts) that can be used as the base for a blue/green cutover workflow.
- `apps/cdk-emc-notary/instance` is already a modular CDK stack using shared constructs, with Mail-in-a-Box setup performed after launch via SSM RunCommand (not baked into UserData).
- The repo already supports “stack identity resolution” via environment variables (`APP_PATH`, `STACK_NAME`, `DOMAIN`) to map to a stack/app and domain. This is a foundational piece for a one-button stack manager.
- The repo already has an operations runner pattern (feature-flag gated) for instance bootstrap orchestration. 
- Constraints:

- Nameservers point at live websites; downtime must be minimized during instance replacement (requires blue/green + careful EIP + mail data sync).
- A “tester stack” must be the first recipient: `apps/cdk-emc-notary` (do not try to generalize everything before proving it once).
- Upgrade behavior must be driven by an **external config file** (package versions + ordered pre/post steps).
- Out of scope (for the first delivery):

- Building a full GUI. The first “intuitive management” interface will be CLI-driven (“one command”) and CI-friendly.
- Re-architecting Mail-in-a-Box storage immediately (storage extension is planned, not blocking the emcnotary migration).

## Goals & Non-Goals

- Goals:

- Deploy/modify/destroy `cdk-emc-notary` using a single command that executes all required stacks in the correct order.
- Port hepefoundation’s recovery system (health check + smart restart + stop/start + alarms + permissions) into reusable CDK constructs and apply them to emcnotary.
- Implement a blue/green workflow: create a secondary instance, run upgrades from an external config, migrate mail data, switch EIP, verify, then deprovision old resources.
- Non-goals:

- “Perfect” multi-tenant email storage/cost modeling in v1 (capture requirements and deliver a follow-on plan).
- Migrating all domains/stacks at once (emcnotary is the proving ground).

## Deliverables

- **Audit inventory** of `Archive/hepefoundation` features (grouped, with “port / replace / deprecate” decisions).
- **Reusable CDK constructs/libs** for:

- Mail health check Lambda + schedule + notifications.
- Smart restart Lambda (service restart escalation logic).
- Stop/start helper Lambda (alarm-triggered remediation) including the CloudWatch → Lambda invoke permission fix.
- Emergency alarm stack (CPU/mem/disk alarms wired to remediation).
- **Stack pipeline manager** (CLI) that can:

- List stacks, deploy (upload), update (modify), destroy (delete)
- Execute bootstrap + upgrade step sequences
- Orchestrate blue/green cutover
- **External configuration**:

- Stack configuration file(s) (domain/region/features/instance sizing)
- Upgrade “execution plan” file(s) (package versions + ordered commands)
- **Runbooks**:

- “One-button up/down”
- “Blue/green upgrade + mail migration + EIP cutover”
- “Rollback + verification”

---

## Audit Inventory of Archive/hepefoundation

### A. Resilience / Recovery System (must port first)

Source evidence (behavior + requirements):

- Mail Health Check Lambda (scheduled, does port + service checks, triggers restart/escalation, SNS notify)
- Smart Restart Lambda (service restart orchestration and escalation path)
- Stop/Start Helper Lambda updates (in-progress detection, maintenance window, “no flapping”, alarm wiring)
- Alarm → Lambda invoke permission fix (critical for reliability)

**Port decision:** Port into CDK + shared libs; apply to emcnotary immediately.

### B. Mailbox Migration / Restore Scripts (must adapt for blue/green)

- Prepare / upload / finalize mailbox migration scripts exist and are a usable baseline for a repeatable cutover workflow.

**Port decision:** Convert into `ops-runner` subcommands (implemented via SSM RunCommand + rsync/dovecot tooling), keep scripts as internal assets.

### C. Stack Discovery + Ops Orchestration (foundation already exists)

- Stack identity resolution via `APP_PATH | STACK_NAME | DOMAIN`.
- `cdk-emc-notary/instance` expects MIAB configuration to be done post-launch via SSM (this aligns with upgrade/cutover workflows).

**Port decision:** Extend existing “ops runner” approach rather than creating a new parallel toolchain.

### D. “Future Thought” Items (capture now, implement after emcnotary is stable)

- Cost estimation scripts/approach and feature toggling (tie into storage extension plan).
- External monitoring and reporting automation.

---

## Implementation Plan

1. **Phase 1 — Audit → Feature Matrix → Target Architecture**
2. **Phase 2 — Port hepefoundation recovery system into reusable CDK constructs**
3. **Phase 3 — Apply recovery system to `apps/cdk-emc-notary` and add full pipeline commands**
4. **Phase 4 — Blue/Green upgrade + low-downtime EIP/mail cutover workflow**
5. **Phase 5 — Storage extension + cost toggling framework (follow-on)**

---

## Architecture / Design

### Components

- **Stack Registry**

- Uses existing “resolve stack info” behavior (`APP_PATH | STACK_NAME | DOMAIN`).
- **Stack Pipeline CLI (ops-runner extension)**

- Subcommands:

- `stacks list|up|down|diff|status`
- `instance bootstrap|upgrade`
- `migrate mail pre-sync|final-sync|cutover|verify|rollback`
- **CDK Stacks (emcnotary)**

- `core`: VPC/shared resources, SSM parameters, EIP allocation, secrets, SNS topic, etc.
- `instance-blue` and `instance-green`: EC2 instance + SG + volumes, bootstrappable via SSM RunCommand.
- `monitoring`: alarms + health check schedule + remediation lambdas.
- `traffic`: EIP association “pointer” stack (switch active instance quickly).
- **Lambda Functions (ported from hepefoundation)**

- `MailHealthCheckLambda` (EventBridge schedule)
- `SmartRestartLambda` (invoked by health check + alarms)
- `StopStartLambda` (invoked by CloudWatch alarms)
- Includes correct invoke permissions from CloudWatch alarms.

### Data model

- `configs/stacks/<domain>.yaml`:

- `domain`, `hostedZoneId`, `region`, `instanceType`, `volumeSize`, `features` (healthCheck, smartRestart, stopStart, externalMonitoring, etc)
- `deploymentSlots`: `blue`, `green`, and `activeSlot`
- `configs/upgrades/<domain>.yaml`:

- `versionSet` (named)
- `preSteps[]`, `steps[]`, `postSteps[]` (ordered commands, timeouts, retries, reboot markers)
- Runtime state (SSM Parameter Store preferred):

- `/mailserver/<domain>/activeSlot`
- `/mailserver/<domain>/maintenanceWindow`
- `/mailserver/<domain>/locks/*` (prevent concurrent remediation)
- last success markers for upgrade + migration

### Integrations

- AWS CDK/CloudFormation (stacks)
- AWS SSM RunCommand (bootstrap + upgrade + migration execution)
- CloudWatch Alarms + SNS notifications (observability + alerting)
- EventBridge schedules (health check cadence)
- EC2 EIP association (fast cutover)

---

## Process / SDLC

- Branching: `feat/<domain>-pipeline-*` → PR → `main`
- CI/CD:

- `nx affected -t lint,test,build`
- `cdk synth` snapshot tests for each stack package
- Feature flags / rollout:

- Keep feature-gated behavior (similar to existing gating) while iterating. 
- Gradually enable:

1. deploy/destroy automation
2. health check + alarms
3. blue/green cutover

---

## Testing

- Unit:

- Config schema validation (invalid config fails fast)
- Upgrade step runner (ordering, retries, timeouts)
- Migration command composition (dry-run plan output)
- Integration (CDK synth snapshot tests):

- `monitoring` stack contains:

- EventBridge schedule → health check lambda
- alarms wired to stop/start lambda
- correct Lambda permissions for alarm invocation.
- E2E/Smoke:

- “Up” creates all stacks and instance is reachable via SSM
- “Bootstrap” succeeds idempotently on a fresh instance
- “Down” destroys stacks in reverse dependency order without orphaning
- “Cutover” moves EIP pointer and health checks confirm service availability
- Quality gates:

- required: lint + tests green
- required: `cdk synth` for emcnotary stacks

---

## Risks & Mitigations

- **Risk:** Alarm actions silently fail (missing invoke permission).

- **Mitigation:** Bake the hepefoundation alarm→lambda permission fix into the CDK construct and assert it in synth tests.
- **Risk:** Mail data inconsistency during cutover.

- **Mitigation:** Two-stage sync + maintenance window freeze + final sync, then cutover, then verification/rollback runbook (see Phase 4).
- **Risk:** Nameserver downtime if EIP switch is slow/unverified.

- **Mitigation:** “Traffic pointer” stack update + pre-cutover warmup validation + immediate rollback command.
- **Risk:** Over-generalizing before emcnotary works.

- **Mitigation:** Build constructs reusable, but only wire + document emcnotary in v1.

---

## Acceptance Criteria

- `ops stacks up --domain emcnotary.com` (or equivalent single command) deploys core+instance+monitoring and returns a final status summary.
- `ops stacks down --domain emcnotary.com` destroys all created stacks in safe order.
- `ops instance bootstrap --domain emcnotary.com --slot <blue|green>` succeeds and is idempotent (safe to re-run).
- `ops instance upgrade --domain emcnotary.com --slot green --config configs/upgrades/emcnotary.yaml` runs ordered steps and persists status.
- Recovery system parity:

- mail health check + smart restart + stop/start helper + emergency alarms behave as in hepefoundation and are managed by CDK.
- Cutover:

- Secondary instance can be stood up, data synced, EIP switched, verified, and old instance deprovisioned with minimal downtime.

---

### Notes on “What gets propagated first”

The hepefoundation recovery system (health check + smart restart + stop/start + alarms + permission wiring) is the first propagated unit because it directly improves stability and observability and is already documented as a complete integrated design.

---

## Phase-by-Phase To-dos

### Phase 1 — Audit → Feature Matrix → Target Architecture

- [ ] Parse `Archive/hepefoundation` file inventory and produce an “Audit Matrix” doc:

- [ ] Group by: monitoring/alarms, remediation, migration/backup, DNS/SES, cost tooling, cleanup/ops.
- [ ] For each group: “Port to CDK construct” vs “Replace with ops-runner command” vs “Deprecate”.
- [ ] Write `docs/architecture/emcnotary-migration.md`:

- [ ] target stacks: core, instance-blue, instance-green, monitoring, traffic-pointer
- [ ] dependency order and destroy order
- [ ] Define config schemas:

- [ ] `StackConfigSchema` for `configs/stacks/*.yaml`
- [ ] `UpgradePlanSchema` for `configs/upgrades/*.yaml`

### Phase 2 — Port hepefoundation recovery system into reusable CDK constructs

- [ ] Create a new shared lib (example): `libs/infra/mailserver-recovery/*`

- [ ] Implement `MailHealthCheckLambda` construct:

- [ ] EventBridge schedule (5 min or configurable)
- [ ] SNS notifications
- [ ] Configurable timeouts/thresholds matching hepefoundation behavior.
- [ ] Implement `SmartRestartLambda` construct:

- [ ] Encapsulate restart escalation behavior
- [ ] Guardrails: maintenance window awareness, in-progress lock, throttling (avoid flapping)
- [ ] Implement `StopStartHelperLambda` construct:

- [ ] Accept alarm actions from CloudWatch
- [ ] Add required lambda permissions for CloudWatch alarm invocation (assert in tests).
- [ ] Implement `EmergencyAlarms` construct:

- [ ] CPU, memory, disk thresholds (configurable)
- [ ] Wire to stop/start helper
- [ ] Add structured logging + correlation IDs for each remediation run.
- [ ] Add synth snapshot tests for the new constructs.

### Phase 3 — Apply improvements to `apps/cdk-emc-notary` (tester stack)

- [ ] Add `monitoring` stack package for emcnotary (or integrate into existing structure):

- [ ] Wire instance ID discovery (stack outputs or SSM param)
- [ ] Deploy health check + alarms + remediation lambdas
- [ ] Ensure `cdk-emc-notary/instance` exports enough identifiers for monitoring and traffic switching.
- [ ] Add or update feature flags/config toggles so monitoring can be enabled/disabled per environment.
- [ ] Confirm instance remains “SSM-first” for configuration and upgrades (aligns with existing design).

### Phase 4 — One-button stack pipeline (deploy/modify/destroy)

- [ ] Extend `apps/ops-runner` to support:

- [ ] `stacks list` (shows known stack apps/domains via registry resolution).
- [ ] `stacks up --domain emcnotary.com`:

- [ ] deploy core
- [ ] deploy instance (slot default `blue`)
- [ ] deploy monitoring
- [ ] optional: bootstrap (flag)
- [ ] `stacks down --domain emcnotary.com`:

- [ ] destroy monitoring
- [ ] destroy instance(s)
- [ ] destroy core (optionally retain persistent buckets/params)
- [ ] `stacks modify` as “deploy with updated config”
- [ ] Implement a “plan view”:

- [ ] print ordered steps before executing
- [ ] `--dry-run` mode

### Phase 5 — Blue/Green upgrade + low-downtime cutover

- [ ] Add deployment slot support:

- [ ] `instance-blue` and `instance-green` stacks can coexist (unique names, tags, outputs).
- [ ] Add “traffic pointer”:

- [ ] A small stack controlling the EIP association to the currently active instance.
- [ ] Implement upgrade execution from external config:

- [ ] `ops instance upgrade --domain emcnotary.com --slot green --config configs/upgrades/emcnotary.yaml`
- [ ] Ordered pre/steps/post with explicit reboot handling.
- [ ] Implement mail data migration commands (SSM-based):

- [ ] `migrate mail pre-sync` (initial rsync/transfer while prod runs)
- [ ] `migrate mail final-sync` (freeze window, final delta sync)
- [ ] `migrate mail cutover` (switch EIP pointer)
- [ ] `migrate mail verify` (service/port/email send+receive tests)
- [ ] `migrate mail rollback` (switch pointer back if verification fails)
- Base the workflow on the existing archive mailbox migration logic.
- [ ] Add “between-migration email” verification:

- [ ] capture queue state before freeze
- [ ] verify queue drained / retried after cutover
- [ ] Add “deprovision old” step:

- [ ] terminate old instance stack only after verification passes and backups confirmed

### Phase 6 — Storage extension + cost toggling (follow-on)

- [ ] Produce a design doc comparing:

- [ ] Larger gp3 EBS volumes + snapshots (lowest complexity)
- [ ] EFS (shared storage, higher cost)
- [ ] S3 + Glacier “archive tier” approach (best for cold storage, not live maildirs)
- [ ] Add feature toggles in `StackConfig`:

- [ ] `enableArchiveTier`, `enableExtraVolume`, `enableEfs`
- [ ] Implement a cost estimator:

- [ ] Use a static regional pricing table initially (documented assumptions)
- [ ] Provide `ops cost estimate --domain ... --features ...` producing monthly estimate bands