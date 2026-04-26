# SDLC Phase Reference

Lifecycle: `discover → define → visualize → architect → plan → implement → verify → release → operate → diagnose → improve`

## Phase Entry/Exit Criteria

| Phase | Enter When | Exit When |
|-------|-----------|-----------|
| `discover` | New idea, no prior work | Problem statement + constraints documented |
| `define` | Problem defined | Intent packet with acceptance criteria complete (DoR met) |
| `visualize` | Intent defined | C4 context + container diagrams exist |
| `architect` | Diagrams exist | ADRs written, contracts defined |
| `plan` | Architecture done | Work order tree chunked, agents assigned |
| `implement` | Work orders approved | All work orders coded and committed |
| `verify` | Implementation done | All verification commands pass |
| `release` | Verified | Release artifacts published, handoff docs complete |
| `operate` | Released | Running in target environment |
| `diagnose` | Incident or anomaly | Root cause identified |
| `improve` | Diagnosis done | Learning promoted, backlog updated |

## Agent Team Use Cases by Phase

| Phase | Parallelization Value | Suggested Streams |
|-------|----------------------|-------------------|
| `discover` | Medium | Research streams per domain/stakeholder |
| `define` | Low | Usually sequential |
| `visualize` | Low | Usually one architect |
| `architect` | Medium | ADR research in parallel |
| `plan` | Low | Usually sequential |
| `implement` | **High** | One porter/builder per bounded module |
| `verify` | **High** | One verifier per module; security + perf in parallel |
| `release` | Medium | Docs + changelog in parallel |
| `diagnose` | **High** | Competing hypotheses model (best use case for teams) |
| `improve` | Medium | Independent improvement streams |

## `.foundry` State Mapping

Continuity lives at `.foundry/projects/<slug>/current-task.json`.

Key fields:
- `sdlcPhase` — current phase enum value
- `currentPhase.status` — `pending | in_progress | blocked | verified | done`
- `doneCriteria` — array of acceptance criteria strings
- `nextCommandSet` — commands to run to verify current state
- `activeBranch` — git branch for this phase
