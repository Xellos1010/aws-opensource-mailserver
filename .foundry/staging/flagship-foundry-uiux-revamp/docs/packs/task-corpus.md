# Task Corpus — Operator Decisions and Quick-Action Inventory

## Purpose
Ground WO-UX-001 with a repo-aware operator task corpus for the current Cursor Companion / Foundry ecosystem. This corpus is intentionally extension-first and assumes the revamp extends existing operator surfaces rather than replacing them.

## Source grounding
- Existing operator primitives already present: workspace target, context carts, refinement sessions, visual artifacts, planning board, budget snapshot, session board, graph snapshot, RAG status, and pipelines.
- Existing bootstrap flow already present: Start Plane, Import, Gap Analysis, Plan, Generate Focus Graph, Approve, Start Run, Pause, Stop, Refresh.
- Current UX problems called out by the request: menu hunting, weak graph navigation, weak quick-action surfacing, limited panel control, weak drill-down, and weak chat-driven orchestration.
- Governing constraints: Cursor Companion remains the canonical write-capable surface; graph/viewer surfaces remain projections; approvals, run control, and verifier posture stay authoritative.

## Top operator jobs to be done
1. When I open the cockpit, I want to see workspace target, active run, blockers, approvals, and alerts immediately so I can orient before acting.
2. When a workflow is blocked, I want to understand why it is blocked and what artifact or approval is missing so I can resolve the blockage quickly.
3. When I inspect the ecosystem, I want to move from graph overview to subsystem, module, pseudocode, diff, work order, run, and evidence without losing context.
4. When I need to act quickly, I want the highest-value safe actions surfaced in place so I do not hunt through menus.
5. When I am planning or coordinating work, I want plan state and session state to be linked by shared object paths so execution and intent stay aligned.
6. When I am deciding whether to launch, approve, pause, or stop work, I want declared state and observed runtime state shown separately so I do not act on the wrong signal.
7. When I use chat or command entry, I want suggestions that accelerate safe work without bypassing approvals, run control, or verifier independence.
8. When I switch between architect, planner, operator, and investigator modes, I want saved layouts that preserve my selected object and current continuity.
9. When I review a claim, I want evidence, logs, and continuity references to be first-class objects instead of hidden implementation details.
10. When I am away from the desktop cockpit, I want mobile triage for alerts, approvals, active run status, search, and lightweight evidence review without false desktop parity.

## Top operator decisions
| Rank | Decision | Urgency | Frequency | Failure cost if wrong | Primary surfaces |
|---|---|---|---|---|---|
| 1 | Is there an active run I need to pay attention to right now? | High | High | Missed incident or stalled execution | Top bar, runs view, utility logs |
| 2 | What is blocked, and what specific approval, dependency, or artifact is missing? | High | High | Work stalls and operator trust drops | Inspector, plan view, evidence |
| 3 | Is this action safe to execute under current approvals and policy? | High | High | Approval bypass or authority drift | Inspector, command palette, chat |
| 4 | Which work order or object should I focus on next? | High | High | Wrong prioritization and rework | Board, map, inspector |
| 5 | Which subsystem or module explains the current issue or task? | High | Medium | Slow diagnosis and context switching | Map, inspector, drill-down tabs |
| 6 | What changed between planned intent, pseudocode, diff, and runtime evidence? | High | Medium | Incorrect launch or misleading review | Diff, inspector, evidence |
| 7 | Should I approve, pause, stop, or refresh the current run? | High | Medium | Unsafe execution or avoidable downtime | Top bar, runs view, utility drawer |
| 8 | Which quick action will get me from current context to the next safe step fastest? | Medium | High | Menu sprawl and slower execution | Top bar, rail, inspector |
| 9 | Which layout best matches the task I am doing right now? | Medium | Medium | Context loss and operator fatigue | Saved layouts, shell manager |
| 10 | Is this a desktop-only action or safe for mobile triage? | Medium | Medium | False parity and weak mobile UX | Platform adaptation, approvals, alerts |

## Quick-action inventory
| Rank | Quick action | Urgency | Frequency | Approval-sensitive | Preferred placement |
|---|---|---|---|---|---|
| 1 | Open command palette / search | High | High | No | Top bar |
| 2 | Jump to active run | High | High | No | Top bar, runs rail item |
| 3 | Open blocker reason | High | High | No | Inspector |
| 4 | Review pending approvals | High | High | Yes | Top bar |
| 5 | Start run from approved plan | High | Medium | Yes | Inspector, command palette |
| 6 | Pause / stop / refresh run | High | Medium | Yes | Utility drawer, runs view |
| 7 | Generate or focus graph view | Medium | Medium | No | Canvas controls |
| 8 | Jump from node to pseudocode / diff | Medium | Medium | No | Inspector drill-down tabs |
| 9 | Open evidence bundle for current object | Medium | Medium | No | Utility drawer, inspector |
| 10 | Create feature / agent / pipeline from context | Medium | Medium | Yes | Command palette, chat |

## High-frequency triage tasks
- Confirm workspace target, active run, blockers, alerts, and approvals in under 10 seconds.
- Jump directly to the object that is failing or blocked.
- Refresh state without losing selected context.
- Pause, stop, or approve a run safely.
- Open the current evidence trail or logs for the selected object.
- Search for a work order, run, module, or evidence artifact.

## Deep architecture and workflow tasks
- Traverse the graph from ecosystem to subsystem and module internals.
- Compare planned architecture against pseudocode, diffs, and observed runtime state.
- Compose a feature, agent pipeline, or implementation track from the current context.
- Reframe the shell into architect, planner, operator, or investigator layouts.
- Review continuity, evidence, and telemetry as linked artifacts across the workflow.

## Canonical drill-down chain
Ecosystem -> subsystem -> module -> pseudocode -> diff -> work order -> run -> evidence

## Quick-action and shell implications
- Top bar should prioritize command entry, approvals, alerts, workspace target, and active-run access.
- Left rail should remain object-oriented: Home, Context, Architecture, Plan, Runs, Evidence, Settings.
- Right inspector should expose selection summary, current state, valid actions, linked artifacts, and drill-down tabs.
- Bottom utility drawer should keep logs, evidence, continuity, chat, and agent suggestions one step away.
- Saved layouts must preserve selected object and current continuity when switching roles.

## Acceptance check against WO-UX-001
- Top operator goals are documented as jobs to be done.
- Quick actions are ranked by urgency and frequency.
- The drill-down path from ecosystem to evidence is explicit.
