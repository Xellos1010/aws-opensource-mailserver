# Foundry Orchestration Composer — Architecture Packet

## Workspace
Flagship Foundry — Architecture Studio

## Date
2026-03-28

## Source authority
- `change-request.md`
- `intent-packet.md`
- `impacted-systems-list.md`
- `risk-register.md`
- `dor-checklist.md`
- `foundry-import-manifest.json`
- `full-repo.txt`

## Objective
Design a Foundry-native orchestration composer that lets an operator assemble reusable AI agent configurations from repo-native building blocks, define visual orchestration pipelines, and execute approved work-order agents from a dashboard without bypassing Foundry’s existing approval, continuity, evidence, and verifier-independence model.

## Impact statement
This architecture extends the existing Foundry ecosystem rather than introducing a second orchestration authority. It adds a declarative composition layer, a registry projection for repo-native building blocks, a pipeline compiler that targets approved work orders, and a dashboard control surface that launches only approved execution artifacts.

## Architecture decisions summary
1. **Canonical operator surface**: `apps/cursor-companion` is the first write-capable dashboard surface. The Foundry app and graph viewer remain projection/read surfaces for topology, review, and drill-down.
2. **Building-block model**: building blocks are a **registry projection** over repo-native personas, skills, agent roles, runbook phases, work-order templates, and model-routing policies. The composer references these blocks; it does not mutate them in place.
3. **Persistence model**: compositions and pipelines are stored as schema-backed declarative artifacts under the Foundry state authority, separate from runtime session state.
4. **Execution boundary**: pipeline execution is always mediated through approved work orders or approved plans. A pipeline may compile draft work orders, but the dashboard cannot directly run arbitrary unapproved graph nodes.
5. **Approval model**: save/draft actions are low risk; launch, resume, stop, and rerun actions require explicit approval artifacts or an already-approved plan/work-order.
6. **Runtime scope for v1**: local-first and adapter-agnostic, with compatibility for existing simulation/current adapters. Team auth and multi-tenant controls are deferred behind a trust-boundary expansion ADR later.
7. **Observed vs declared truth**: composition metadata, execution state, continuity state, and evidence bundles are separate authorities with explicit references between them.

## Assumptions resolved in architecture
- The first deliverable is a **full compose-review-approve-execute dashboard**, but execution remains constrained to approved work orders and approved plans.
- Existing repo-native assets are referenced as immutable authorities; the dashboard may create derived compositions but does not edit source personas/skills in place.
- Minimum observability for the first slice includes execution state, approvals, evidence bundle target, continuity state reference, verifier status, logs pointer, and blast-radius reference.
- Identity and access are local-first / single-operator for the initial slice, with a clean trust-boundary seam for later multi-user auth.

## Proposed structure

### System roles
- **Cursor Companion Composer**: write-capable dashboard for browsing registry blocks, composing agent configurations, editing pipeline topology, compiling draft work orders, requesting approvals, and launching approved runs.
- **Composer API Surface**: control-plane extension that validates artifacts, persists them, compiles pipelines to approved-plan-compatible work-order sets, and mediates execution requests.
- **Registry Projection Service**: projects repo-native personas, skills, roles, templates, and routing metadata into a normalized building-block library index.
- **Composition Repository**: stores declared composition and pipeline artifacts.
- **Execution Policy Gateway**: enforces approval, lifecycle, trust-boundary, and runtime constraints before delegating to existing run-control flows.
- **Session Projection**: aggregates run status, approvals, continuity, verifier posture, and evidence bundle references for dashboard display.
- **Graph/Viewer Projection**: read-optimized view for topology and blast-radius visualization.

### Responsibility boundaries
- **Repo authority**: personas, skills, runbooks, templates, model-routing policy, and guardrail packs remain authoritative in repo-controlled artifacts.
- **Declared composer authority**: composed agent configurations and orchestration pipeline definitions.
- **Execution authority**: approved plan / approved work order / approved execution request.
- **Observed runtime authority**: run state, logs pointer, evidence bundle target, verifier status, and continuity state.

## Public interfaces introduced or changed
1. Building block registry projection
2. Composed agent configuration artifact
3. Orchestration pipeline definition artifact
4. Pipeline compilation result
5. Dashboard execution request
6. Dashboard execution session projection

See the `contracts/` directory for machine-readable schemas.

## Design constraints preserved
- Human approval remains authoritative.
- Existing work-order and lifecycle contracts remain primary.
- No direct execution of arbitrary pipeline steps without work-order approval.
- Composition data does not overwrite repo-native source definitions.
- Verifier independence is preserved; the composer may show verifier state but may not collapse builder and verifier roles.

## Architecture option summary

### Operator surface
- **Chosen**: Cursor Companion as canonical write surface; graph viewer and Foundry app as read/projection surfaces.
- **Rejected**: multi-master editing across surfaces. It would increase drift risk and duplicate UX responsibilities.

### Persistence model
- **Chosen**: schema-backed declarative artifacts in Foundry state authority.
- **Rejected**: storing compositions as runbook prose or mutating persona/skill source files. That would collapse design-time and source-authority responsibilities.

### Execution model
- **Chosen**: compile pipelines into work-order-compatible artifacts, then launch only approved work orders/plans.
- **Rejected**: direct free-form execution of graph nodes from the dashboard. That would bypass approval and evidence controls.

## Acceptance criteria traceability
| Intent criterion | Architecture response |
|---|---|
| Building-block library | `contracts/building-block-library-index.schema.json` |
| Compose without editing raw repo files | `contracts/composed-agent-configuration.schema.json` plus Cursor Companion write surface |
| Persisted, traceable composition | Composition repository and provenance model |
| Visible sequence/dependency/approval boundaries | `contracts/orchestration-pipeline-definition.schema.json` and diagrams |
| Execute approved work-order agents | `contracts/dashboard-execution-request.schema.json` and ADR-003 |
| Run state transitions | `contracts/dashboard-execution-session.schema.json` |
| Trace back to work order / approval / evidence target | session projection + pipeline compilation result |
| Preserve Foundry doctrine | trust-boundary, ADRs, and explicit separation of authorities |
| Separate declared composition from observed runtime state | state model and trust-boundary diagram |
| Rollback-safe disable path | feature-flag and non-destructive artifact model |

## State model

### Declared state
- Building block registry index
- Composed agent configuration
- Orchestration pipeline definition
- Pipeline compilation result

### Approval state
- Plan approval artifact
- Work-order approval artifact
- Execution approval reference

### Observed state
- Dashboard execution session
- Continuity state reference
- Evidence bundle target
- Verifier status
- Run timeline / logs pointer

## Rollback posture
- Gate the composer surface and compile/launch APIs behind a feature flag.
- Preserve existing Foundry planning/run paths when the feature is disabled.
- Keep compositions as non-destructive state artifacts so disabling the feature does not mutate current plan/run history.
- Ensure pipeline compilation is idempotent and produces traceable outputs that can be archived without replay.

## Verification outline for later phases
- JSON Schema validation for each contract in `contracts/`.
- API/contract tests for registry projection, composition save/load, compile, and execution request validation.
- UI workflow tests for compose → compile → approve → launch → monitor.
- Security review for approval checks and local-first trust boundaries.
- Performance review for graph rendering, projection refresh, and session polling.
- Regression tests confirming current Foundry run-control still operates when the composer feature is disabled.

## Decomposition summary
See `decomposition-plan.md` and `work-order-tree.json` for the recommended implementation slicing and phase ordering.

## Import guidance
This packet is ready for import as **design authority**. It is not implementation approval. The next workspace should consume these artifacts directly and generate bounded work orders from them.
