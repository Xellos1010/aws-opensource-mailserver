# Role Catalog — Available Agent Roles

Map initiative work streams to one of these subagent types. If none fits, leave `subagentType: null` and provide detailed spawn instructions in the lead prompt instead.

## Project-Specific Roles (this monorepo)

| Role Label | subagentType | Model | Best For |
|---|---|---|---|
| `analyzer` | `ts-react-rust-analyzer` | sonnet | Per-file TS/TSX/Ink analysis, migration risk, IO contracts, subsystem classification |
| `porter` | `rust-porter` | sonnet | Porting a bounded TS/React/Ink slice to idiomatic Rust |
| `migration-verifier` | `rust-migration-verifier` | sonnet | Behavioral parity verification of ported Rust modules |

## Flagship Foundry SDLC Roles

| Role Label | subagentType | Model | Best For |
|---|---|---|---|
| `orchestrator` | `orchestrator` | inherit | Phase routing, work assignment, DoR/DoD enforcement |
| `architect` | `systems-architect` | opus | C4 diagrams, contracts, ADRs, structural decisions |
| `builder` | `builder` | sonnet | Bounded implementation within approved work orders |
| `verifier` | `verifier` | inherit | Independent test and evidence validation |
| `security` | `security-reviewer` | inherit | Secrets, trust boundaries, permissions audit |
| `performance` | `performance-reviewer` | inherit | Profiling, hot paths, capacity analysis |
| `docs` | `docs-release-agent` | sonnet | Handoffs, release notes, runbooks, continuity docs |
| `context-curator` | `context-curator` | haiku | Source packet assembly for other agents |

## Model Guidance

| Task Class | Suggested Model |
|---|---|
| Strategic reasoning, ADRs, architecture | opus |
| Code generation, porting, building | sonnet |
| Classification, analysis, light research | sonnet |
| Reference gathering, file reading | haiku |
| Test validation, evidence gathering | sonnet |
