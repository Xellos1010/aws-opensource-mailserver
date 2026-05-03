# Impacted Systems List

## Primary System
### 1. `apps/flagship-foundry`
Canonical Foundry application root and primary ecosystem to improve. This is the most likely home for any new orchestration-composer contracts, state, runbook links, and dashboard integration points.

## Operator Surfaces
### 2. `apps/cursor-companion`
Existing VS Code-compatible companion already supports importing a workspace, gap analysis, planning, blast-radius drilldown, approval, and run controls. It is the strongest current candidate for the first dashboard surface.

### 3. Graph / visualization surface
The request explicitly asks for a visual pipeline. Existing graph and focus-view concepts imply impact to current visualization components, whether inside Foundry, inside the companion, or in a shared surface.

## Execution and Orchestration Core
### 4. Control plane / orchestration APIs
Dashboard-triggered execution will require a defined handoff into the existing control-plane and run-control model.

### 5. Orchestrator lifecycle routing
Any composition layer must still resolve to lifecycle-aware work orders and phase gates.

### 6. Work-order execution path
The request explicitly requires the dashboard to execute work-order agents, so the work-order launch path, approval expectations, and execution-state reporting are directly impacted.

## Contracts and Definitions
### 7. Work-order schema authority
Existing work-order contracts should remain authoritative unless extended by ADR.

### 8. Continuity and evidence contracts
Any new execution path must still preserve continuity state, evidence bundling expectations, and handoff generation.

### 9. Persona / skill / model-routing definitions
The requested building blocks are expected to come from repo-native personalities, skills, and model-routing patterns, making these registries or source files directly relevant.

## Supporting Governance Assets
### 10. Runbooks and guardrail packs
Feature-delivery, environment parity, verification, and governance runbooks will need alignment once architecture is defined.

### 11. State storage for plans, runs, approvals, and compositions
If composition becomes a first-class artifact, state layout and authority rules will be affected.

## Likely New Artifact Types
- composed-agent-configuration
- orchestration-pipeline-definition
- building-block-library index or registry projection
- dashboard execution session record
