# Flagship Foundry Orchestration Composer — Verification Plan

## Global gates
- All new JSON artifacts validate against their schemas.
- `packages/core` helpers are verified with `node --test` before route or UI layers depend on them.
- `apps/graph-viewer` must still build successfully after composer projection views are added.
- Composer execution remains approval-gated and feature-flag default-off through verification.

## Work-order verification matrix
### WO-001A — composer-schema-pack
- **Lifecycle stage**: `implement`
- **Acceptance focus**: All six schema files exist and each validates its approved happy-path fixture.
- **Commands**:
  - `cd apps/flagship-foundry && node --test tests/composer-schema-contracts.test.mjs`

### WO-001B — registry-projection-loader
- **Lifecycle stage**: `implement`
- **Acceptance focus**: buildBuildingBlockIndex() returns schema-compliant output for a fixture workspace.
- **Commands**:
  - `cd apps/flagship-foundry && node --test tests/composer-registry.test.mjs`
  - `cd apps/flagship-foundry && node --test tests/composer-schema-contracts.test.mjs`

### WO-002A — composition-artifact-store
- **Lifecycle stage**: `implement`
- **Acceptance focus**: Configurations and pipelines persist under a composer-specific state subtree instead of the live run directories.
- **Commands**:
  - `cd apps/flagship-foundry && node --test tests/composer-artifacts.test.mjs`
  - `cd apps/flagship-foundry && node --test tests/composer-schema-contracts.test.mjs`

### WO-002B — pipeline-compiler-core
- **Lifecycle stage**: `implement`
- **Acceptance focus**: compilePipelineToDraftArtifacts() returns PipelineCompilationResult for valid pipelines and surfaces errors for invalid dependencies.
- **Commands**:
  - `cd apps/flagship-foundry && node --test tests/pipeline-compiler.test.mjs`
  - `cd apps/flagship-foundry && node --test tests/composer-schema-contracts.test.mjs`

### WO-003A — execution-policy-gateway-core
- **Lifecycle stage**: `implement`
- **Acceptance focus**: validateExecutionRequest() rejects missing approval refs for execution-affecting actions.
- **Commands**:
  - `cd apps/flagship-foundry && node --test tests/execution-policy-gateway.test.mjs`
  - `cd apps/flagship-foundry && node --test tests/auth-trust-boundary.test.mjs`

### WO-003B — composer-control-plane-crud-routes
- **Lifecycle stage**: `implement`
- **Acceptance focus**: The control plane exposes read-only building-block listing and declared composer artifact CRUD without any execution side effects.
- **Commands**:
  - `cd apps/flagship-foundry && node --test tests/composer-control-plane-crud.test.mjs`
  - `cd apps/flagship-foundry && node --test tests/composer-artifacts.test.mjs`
  - `cd apps/flagship-foundry && node --test tests/composer-registry.test.mjs`

### WO-003C — composer-control-plane-compile-launch-routes
- **Lifecycle stage**: `implement`
- **Acceptance focus**: POST /composer/compile returns PipelineCompilationResult and does not start a run.
- **Commands**:
  - `cd apps/flagship-foundry && node --test tests/composer-control-plane-compile-launch.test.mjs`
  - `cd apps/flagship-foundry && node --test tests/execution-policy-gateway.test.mjs`
  - `cd apps/flagship-foundry && node --test tests/auth-trust-boundary.test.mjs`

### WO-004A — cursor-companion-composer-overlay
- **Lifecycle stage**: `implement`
- **Acceptance focus**: The extension can render a composer overlay without requiring a second editor surface.
- **Commands**:
  - `cd apps/flagship-foundry && node --test tests/cursor-companion-composer.test.mjs`
  - `cd apps/flagship-foundry && node --test tests/composer-control-plane-crud.test.mjs`
  - `cd apps/flagship-foundry && node --test tests/composer-control-plane-compile-launch.test.mjs`

### WO-005A — pipeline-graph-projection-core
- **Lifecycle stage**: `implement`
- **Acceptance focus**: Projection output contains deterministic node ids, edge ids, stage labels, and approval boundary markers.
- **Commands**:
  - `cd apps/flagship-foundry && node --test tests/pipeline-graph-projection.test.mjs`
  - `cd apps/flagship-foundry && node --test tests/pipeline-compiler.test.mjs`

### WO-005B — graph-viewer-composer-projections
- **Lifecycle stage**: `implement`
- **Acceptance focus**: The graph viewer can render pipeline topology and session projection data without adding a second editor surface.
- **Commands**:
  - `cd apps/flagship-foundry/apps/graph-viewer && pnpm build`

### WO-006A — session-projection-core
- **Lifecycle stage**: `implement`
- **Acceptance focus**: buildDashboardExecutionSession() returns schema-compliant session objects from underlying run and metadata inputs.
- **Commands**:
  - `cd apps/flagship-foundry && node --test tests/session-projection.test.mjs`
  - `cd apps/flagship-foundry && node --test tests/runs-telemetry-correlation.test.mjs`

### WO-006B — runtime-observability-surfaces
- **Lifecycle stage**: `implement`
- **Acceptance focus**: Cursor Companion can display session state, approvals, verifier status, continuity ref, evidence target ref, and logs pointer for composer runs.
- **Commands**:
  - `cd apps/flagship-foundry && node --test tests/cursor-companion-session-panel.test.mjs`
  - `cd apps/flagship-foundry/apps/graph-viewer && pnpm build`

### WO-007A — verification-and-hardening
- **Lifecycle stage**: `verify`
- **Acceptance focus**: Integration tests prove compile does not execute and approved execute does.
- **Commands**:
  - `cd apps/flagship-foundry && node --test tests/composer-integration.test.mjs tests/composer-feature-flag-regression.test.mjs`
  - `cd apps/flagship-foundry && node --test tests/auth-trust-boundary.test.mjs`
  - `cd apps/flagship-foundry/apps/graph-viewer && pnpm build`

### WO-008A — release-handoff-and-import-packet
- **Lifecycle stage**: `release`
- **Acceptance focus**: Release docs reference verification evidence rather than assumptions.
- **Commands**:
  - `test -f apps/flagship-foundry/docs/release/composer-rollout-and-rollback.md`
  - `test -f apps/flagship-foundry/docs/handoffs/handoff-composer-release.md`
  - `test -f apps/flagship-foundry/docs/release/composer-import-packet.md`

### WO-009A — learning-capture-and-kb-promotion
- **Lifecycle stage**: `improve`
- **Acceptance focus**: The learning record distinguishes context, observation, recommendation, and applicable scope.
- **Commands**:
  - `test -f apps/flagship-foundry/docs/learning/composer-learning-record.md`
  - `test -f apps/flagship-foundry/docs/learning/composer-kb-promotion-candidates.md`

## Release blockers
- Any failing compile-vs-execute separation check blocks release.
- Any regression in legacy run-control behavior when composer flags are off blocks release.
- Missing approval enforcement or trust-boundary findings block release.