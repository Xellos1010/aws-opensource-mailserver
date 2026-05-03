# Decomposition Plan

## Goal
Translate the architecture packet into bounded work orders for the next workspace without introducing implementation authority drift.

## Recommended delivery milestones

### M1 — Contract and registry foundation
- Introduce the building-block registry projection contract.
- Introduce composed agent configuration and pipeline definition contracts.
- Add compilation-result and execution-session projection contracts.
- Validate artifact storage and feature-flag boundaries.

### M2 — Canonical write surface
- Extend Cursor Companion with browse / compose / compile / launch flows.
- Add read-only graph/viewer projections for pipeline topology and blast radius.

### M3 — Control-plane composition APIs
- Add save/load/validate/compile endpoints.
- Add execution-policy mediation for start/pause/resume/stop.
- Add session projection endpoints for approvals, continuity, verifier posture, and evidence targets.

### M4 — Security, verification, and performance hardening
- Security review of approval boundaries and local-first trust boundaries.
- Verifier and evidence bundle projection integration.
- Performance review of graph rendering and session refresh behavior.

## Work-order slicing principles
- Keep compile logic separate from execution logic.
- Keep declared artifact management separate from observed session projection.
- Treat repo-native personas/skills/templates as read-only inputs.
- Preserve existing run-control as the sole execution authority.

## Proposed work-order sequence
1. **WO-001 — registry-projection-contracts**
   - Lifecycle stage: plan/implement
   - Goal: add library index, composition, pipeline, compilation, and session schemas plus registry projection rules.
   - Depends on: none
2. **WO-002 — cursor-companion-composer-surface**
   - Lifecycle stage: implement
   - Goal: add browse, compose, compile, approve, and execute UX to the canonical write surface.
   - Depends on: WO-001
3. **WO-003 — composer-control-plane-apis**
   - Lifecycle stage: implement
   - Goal: add save/load/validate/compile/execute request endpoints and state authority wiring.
   - Depends on: WO-001
4. **WO-004 — execution-policy-gateway**
   - Lifecycle stage: implement
   - Goal: enforce approvals, lifecycle-stage legality, runtime-mode restrictions, and delegation to existing run control.
   - Depends on: WO-003
5. **WO-005 — graph-viewer-projections**
   - Lifecycle stage: implement
   - Goal: expose pipeline topology, approval boundaries, and blast-radius projections without creating a second editor.
   - Depends on: WO-001, WO-003
6. **WO-006 — continuity-evidence-session-projection**
   - Lifecycle stage: implement
   - Goal: surface continuity refs, evidence bundle targets, verifier status, and logs pointers to the dashboard.
   - Depends on: WO-003, WO-004
7. **WO-007 — verification-and-hardening**
   - Lifecycle stage: verify
   - Goal: add schema validation, API contract tests, UI workflow tests, security review checks, and performance baselines.
   - Depends on: WO-002, WO-004, WO-005, WO-006

## Critical path
WO-001 → WO-003 → WO-004 → WO-006 → WO-007

## Parallelizable slices
- WO-002 and WO-005 can proceed in parallel once WO-001 exists.
- Security and performance preparation can start during WO-003/WO-004 but final verdicts wait for WO-007.

## Approval gates
- Human approval required before any execution-affecting endpoint is enabled.
- Human approval required before feature-flag default changes from off to on.
- Security review required before any non-local identity/access expansion.
