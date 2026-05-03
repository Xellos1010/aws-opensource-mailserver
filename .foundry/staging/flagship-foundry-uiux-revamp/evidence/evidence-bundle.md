# Evidence Bundle — Foundry UI/UX Revamp

## Metadata
- Phase: plan / architecture packet
- Date: 2026-04-10
- Scope: UI/UX revamp for Foundry / Cursor Companion
- Collector: workflow-telemetry-curator + ux-verification-judge (planned)

## Repo grounding evidence
### E-001
The current operator collections already include workspace target, context carts, refinement sessions, visual artifacts, planning board, budget snapshot, session board, graph snapshot, RAG status, and pipelines.

### E-002
The current companion flow already supports Start Plane, Import, Gap Analysis, Plan via Generate Focus Graph, Approve, Start Run, Pause / Stop, and Refresh.

### E-003
Recent operator work already delivered typed workspace targeting, context carts, requirement refinement, visual artifacts, planning board, provider posture, session board, and pop-out support.

### E-004
The architecture posture already keeps Cursor Companion as the write-capable first surface, keeps graph/viewer as projections, and keeps declared artifacts separate from observed runtime state.

### E-005
The foundational docs knowledge base already contains 1124 documents mapped to domain packs.

## Standards evidence
### E-006
Apple HIG guidance supports strong hierarchy, toolbars for frequently used actions/navigation/search, and obvious visual toggle states.

### E-007
Material 3 motion guidance supports container transform for element-to-detail transitions and quick fades for top-level destination changes.

### E-008
WCAG 2.2 is the recommended current baseline for future-facing accessibility work.

## Acceptance criteria evidence plan
| Criterion | Evidence type |
|---|---|
| Find active run quickly | timed usability scenario |
| Understand blocked reason | plan/session board walkthrough |
| Reach pseudocode diff from topology in 3 clicks | drill-down scenario |
| Recover from failed launch | failure simulation + evidence path |
| Keyboard and reduced-motion support | accessibility review |
| Graph responsiveness | performance trace |

## Gaps still requiring implementation evidence
- Actual shell interaction traces
- Measured graph performance with overlays
- Real reduced-motion validation in implemented surfaces
- Mobile adaptation prototype review
