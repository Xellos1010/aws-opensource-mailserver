# Intent Packet

## Packet ID
ip-foundry-building-block-ai-orchestration-pipeline-2026-03-28

## Status
Draft — pre-build; Definition of Ready is not fully satisfied.

## Requested Outcome
When this capability ships, an operator can use Foundry to compose reusable AI agent configurations from repo-native personalities and skills, define orchestration pipelines visually, and execute approved work-order agents from a dashboard.

## Problem Statement
Foundry already has key orchestration primitives — lifecycle routing, work-order contracts, personas, skills, approval flows, and execution controls — but the request calls for a higher-level building-block composition layer. Today, the repo appears to provide phase-aware orchestration and a companion surface for planning and run control, but not yet a confirmed building-block composer for mix-and-match agent configurations. The gap is therefore not “create orchestration from scratch,” but “elevate existing Foundry primitives into a reusable orchestration-composer experience.”

## Repo-Grounded Baseline
- Foundry treats the graph as the reasoning substrate and uses intent packets plus work orders as the contract between intent and execution.
- The Cursor Companion is already positioned as the first operator surface and already supports plan visibility and run controls.
- The feature-delivery runbook already frames a request as scoped design followed by executable component tasks.
- The work-order contract already defines lifecycle stage, system ID, agent role, model tier, constraints, acceptance criteria, verification plan, and approval requirements.
- The current workspace import report identifies Environment Parity and Tooling as the highest current gap, which materially affects a request centered on reusing repo-native skills and personas consistently.

## Bounded Intent Statement
Design an extension to the Foundry ecosystem that introduces a reusable orchestration composition capability with these boundaries:
1. Start from the existing Foundry app and companion/editor surfaces.
2. Reuse repo-defined personas, skills, work-order concepts, and model-routing patterns.
3. Add a dashboard/composer surface for selecting, combining, and parameterizing agent building blocks.
4. Support execution of approved work-order agents from that dashboard.
5. Stop before implementation details that require unapproved architecture decisions.

## In Scope
- Define the product capability as a Foundry-native orchestration composer.
- Identify impacted systems, contracts, and likely extension points in the existing Foundry ecosystem.
- Define success criteria for visual composition, reuse of personalities/skills, and work-order execution.
- Define pre-build artifacts required before implementation begins.
- Identify risks, rollback posture, and verification outline.
- Hand off to Architecture Studio for system design, contracts, and decomposition.

## Out of Scope
- Implementing the dashboard.
- Implementing runtime adapters or agent execution changes.
- Inventing new personas or skills without reference to the repo authority model.
- Committing to a specific storage format for agent compositions without architectural review.
- Choosing a final editor surface if multiple existing surfaces are viable.
- Shipping production auth, RBAC, or multi-tenant controls without explicit requirements.

## Users and Stakeholders
- Primary operator: platform or engineering operator using Foundry to plan and execute work.
- Secondary stakeholders: systems architect, orchestrator owner, verifier/security/performance reviewers, and maintainers of repo-native personas and skills.
- Governing authority: the human operator remains authoritative for intent, approval boundaries, and phase transitions.

## Desired Capabilities
### 1. Building-block composition
- Present repo-native personalities, skills, and agent roles as selectable building blocks.
- Allow an operator to assemble new AI configurations from those blocks without redefining the underlying contracts each time.
- Preserve traceability from a composed configuration back to the source personas, skills, and work-order artifacts it uses.

### 2. Visual pipeline definition
- Allow an operator to define an orchestration sequence or graph of agent steps.
- Make stage, dependency, approval, and verification boundaries visible.
- Distinguish design-time composition from runtime execution state.

### 3. Dashboard execution
- Allow execution of approved work-order agents from a dashboard.
- Show lifecycle state for plan, approval, execution, pause/resume/stop, and evidence collection.
- Maintain parity with existing Foundry run-control concepts rather than introducing a separate execution model.

### 4. Reuse and governance
- Reuse existing Foundry work-order schema, lifecycle stages, runbooks, and model-tier routing where possible.
- Preserve guardrails, approval gates, and independent verification posture.
- Avoid silent mutation of the source of truth.

## Acceptance Criteria
1. An operator can view a library of repo-native agent building blocks derived from existing personalities, skills, roles, or runbook phases.
2. An operator can compose a new orchestration configuration from those building blocks without editing raw repo files directly.
3. A composed orchestration configuration can be persisted as a first-class Foundry artifact with traceability to its source building blocks.
4. The visual composer shows sequence, dependency, and approval boundaries clearly enough for pre-execution review.
5. The dashboard can trigger execution of approved work-order agents using the existing Foundry execution model or an approved extension of it.
6. The dashboard shows run state transitions at minimum for queued, in progress, paused, stopped, failed, and completed.
7. Every execution launched from the dashboard can be traced back to a work order, an approving artifact, and an evidence bundle target.
8. The capability preserves Foundry principles: human intent authority, evidence-backed release posture, explicit contracts, and verifier independence.
9. The architecture explicitly separates composition metadata from observed runtime state.
10. The design includes a rollback-safe path for disabling the composer/dashboard capability without corrupting existing plan/run state.

## Non-Goals
- A generic low-code AI builder outside the Foundry governance model.
- A free-form multi-agent chat canvas with no work-order or verification contract.
- Replacing the existing orchestrator, verifier, or work-order schema.
- Ad hoc execution of agents that bypass approval or evidence expectations.

## Constraints and Guardrails
- Human approval remains authoritative for high-risk transitions.
- Existing work-order and lifecycle contracts should be reused unless Architecture Studio approves changes.
- Composition artifacts must remain attributable and traceable.
- Observed runtime state must remain distinct from declared design-time configuration.
- The design must preserve independent verification and must not merge builder and verifier responsibilities.
- The first implementation target should start with the existing Foundry ecosystem rather than a separate greenfield surface.

## Required Pre-Build Artifacts
- C4 system context and container diagrams for the composer/dashboard capability.
- ADR selecting the canonical operator surface (Cursor Companion, Foundry app, graph viewer, or split-surface model).
- ADR defining the composition artifact model and source-of-truth location.
- Contract/schema for composed agent configurations.
- Contract/schema for orchestration pipeline definitions.
- Contract/schema or extension decision for dashboard-triggered work-order execution.
- Decomposition plan and work-order tree.
- Trust-boundary and approval-boundary definition for dashboard execution.

## Rollback Idea
Ship the composer/dashboard behind a feature flag or equivalent enablement boundary so Foundry can revert to current plan-and-run flows without deleting composition artifacts or mutating existing run history.

## Test Outline
- Contract tests for composed-configuration and pipeline-definition schemas.
- UI workflow tests for selecting building blocks, composing a pipeline, saving it, and launching an approved execution.
- Integration tests for dashboard-to-control-plane execution handoff.
- Verification-path tests confirming work-order approvals and evidence bundle targets are enforced.
- Regression tests ensuring current Foundry plan/run flows still work when the composer is disabled.
- Security review of dashboard-triggered execution boundaries.
- Performance review for visual pipeline rendering and run-state refresh behavior.

## Current Phase Recommendation
Remain in discover/define until the open questions are answered and architecture artifacts are produced. After that, hand off to Architecture Studio for visualize/architect outputs.
