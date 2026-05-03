# Flagship Foundry Orchestration Composer — Work Order Summary

## Batch metadata
- **Phase ID**: `foundry-orchestration-composer-plan-2026-03-30`
- **System ID**: `flagship-foundry-orchestration-composer`
- **Next workspace**: `Flagship Foundry — Verification, Release & Learning (04-foundry-verification-docs)`
- **Total work orders**: **15**

## Locked implementation assumptions

- New composer contracts live under apps/flagship-foundry/schemas/ to match the current canonical repo layout.
- Declared composer artifacts persist under a composer-specific subtree in apps/flagship-foundry/state/ and stay separate from plan/run state.
- Control-plane composer routes use /composer/* plus /catalogs/building-blocks following the existing route naming style.
- Cursor Companion remains the canonical write-capable surface; graph-viewer remains read-only.
- Composer launch remains feature-flagged and approval-gated by default.

## Milestone groups

### M1 — contract and registry foundation
- `WO-001A` — composer-schema-pack
- `WO-001B` — registry-projection-loader
- `WO-002A` — composition-artifact-store
- `WO-002B` — pipeline-compiler-core
- `WO-003A` — execution-policy-gateway-core

### M2 — control plane and operator surfaces
- `WO-003B` — composer-control-plane-crud-routes
- `WO-003C` — composer-control-plane-compile-launch-routes
- `WO-004A` — cursor-companion-composer-overlay
- `WO-005A` — pipeline-graph-projection-core
- `WO-005B` — graph-viewer-composer-projections
- `WO-006A` — session-projection-core
- `WO-006B` — runtime-observability-surfaces

### M3 — verification and hardening
- `WO-007A` — verification-and-hardening

### M4 — release and learning
- `WO-008A` — release-handoff-and-import-packet
- `WO-009A` — learning-capture-and-kb-promotion

## Critical path

WO-001A -> WO-001B -> WO-002A -> WO-002B -> WO-003A -> WO-003C -> WO-006A -> WO-006B -> WO-007A -> WO-008A

## Execution guidance for low-cost slices

- Keep each builder slice inside its declared file scope and context budget.
- Run the listed tests first for contract/core slices before touching UI or route wiring.
- Treat `packages/core` helpers as the SSOT for projection and session shaping; UI layers should consume them, not reimplement them.
- Do not enable composer execution by default until `WO-007A` records a pass-equivalent verification result.

## Work order table

| ID | Stage | Model tier | Depends on | Primary file scope |
|---|---|---|---|---|
| `WO-001A` | `implement` | `low_cost_executor` | — | apps/flagship-foundry/schemas/building-block-library-index.schema.json, apps/flagship-foundry/schemas/composed-agent-configuration.schema.json |
| `WO-001B` | `implement` | `low_cost_executor` | WO-001A | apps/flagship-foundry/packages/core/src/composer-registry.mjs, apps/flagship-foundry/tests/composer-registry.test.mjs |
| `WO-002A` | `implement` | `low_cost_executor` | WO-001A, WO-001B | apps/flagship-foundry/packages/core/src/composer-artifacts.mjs, apps/flagship-foundry/tests/composer-artifacts.test.mjs |
| `WO-002B` | `implement` | `low_cost_executor` | WO-001A, WO-002A | apps/flagship-foundry/packages/core/src/pipeline-compiler.mjs, apps/flagship-foundry/tests/pipeline-compiler.test.mjs |
| `WO-003A` | `implement` | `low_cost_executor` | WO-002B | apps/flagship-foundry/packages/core/src/execution-policy-gateway.mjs, apps/flagship-foundry/tests/execution-policy-gateway.test.mjs |
| `WO-003B` | `implement` | `low_cost_executor` | WO-001B, WO-002A | apps/flagship-foundry/apps/control-plane/src/server.mjs, apps/flagship-foundry/tests/composer-control-plane-crud.test.mjs |
| `WO-003C` | `implement` | `low_cost_executor` | WO-002B, WO-003A, WO-003B | apps/flagship-foundry/apps/control-plane/src/server.mjs, apps/flagship-foundry/tests/composer-control-plane-compile-launch.test.mjs |
| `WO-004A` | `implement` | `low_cost_executor` | WO-003B, WO-003C | apps/flagship-foundry/apps/cursor-companion/composer-client.js, apps/flagship-foundry/apps/cursor-companion/composer-panel.js |
| `WO-005A` | `implement` | `low_cost_executor` | WO-002B | apps/flagship-foundry/packages/core/src/pipeline-graph-projection.mjs, apps/flagship-foundry/tests/pipeline-graph-projection.test.mjs |
| `WO-005B` | `implement` | `low_cost_executor` | WO-005A, WO-003C | apps/flagship-foundry/apps/graph-viewer/src/views/PipelineTopologyView.tsx, apps/flagship-foundry/apps/graph-viewer/src/views/SessionProjectionView.tsx |
| `WO-006A` | `implement` | `low_cost_executor` | WO-003A, WO-003C | apps/flagship-foundry/packages/core/src/session-projection.mjs, apps/flagship-foundry/tests/session-projection.test.mjs |
| `WO-006B` | `implement` | `low_cost_executor` | WO-004A, WO-005B, WO-006A | apps/flagship-foundry/apps/cursor-companion/session-panel.js, apps/flagship-foundry/apps/cursor-companion/extension.js |
| `WO-007A` | `verify` | `balanced_reasoner` | WO-004A, WO-005B, WO-006B | apps/flagship-foundry/tests/composer-integration.test.mjs, apps/flagship-foundry/tests/composer-feature-flag-regression.test.mjs |
| `WO-008A` | `release` | `low_cost_executor` | WO-007A | apps/flagship-foundry/docs/release/composer-rollout-and-rollback.md, apps/flagship-foundry/docs/handoffs/handoff-composer-release.md |
| `WO-009A` | `improve` | `balanced_reasoner` | WO-007A, WO-008A | apps/flagship-foundry/docs/learning/composer-learning-record.md, apps/flagship-foundry/docs/learning/composer-kb-promotion-candidates.md |

## Import guidance for the next workspace

1. Import `work-order-batch.json` as the primary executable plan artifact.
2. Import `dependency-graph.mmd` and `verification-plan.md` as supporting authority for sequencing and gates.
3. Consume the uploaded architecture packet artifacts directly rather than reconstructing design intent from memory.