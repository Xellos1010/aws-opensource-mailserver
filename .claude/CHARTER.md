# Flagship Foundry SDLC Agent Charter

## Authority

### Human Authority
- Owns intent, priorities, ethics, risk tolerance, and approval boundaries
- Approves all phase transitions for high-risk work
- Defines and modifies doctrine, guardrails, and operating principles
- May override any agent decision at any time

### Orchestrator Authority
- Owns phase routing, work assignment, and done criteria enforcement
- Reads and updates continuity state as the phase source of truth
- Delegates to specialist agents; never generates code directly
- Enforces DoR/DoD gates before phase transitions

### Sub-Agent Authority
- Own transformation work only inside declared guardrails
- Receive explicit inputs, constraints, and expected outputs per work order
- May not silently change the authoritative source of truth
- Must declare blockers rather than working around them

## Scope

- This charter governs all Claude Code and Cursor agent work in this workspace
- Projects under `.codex/projects/` each have their own `SDLC_CHARTER.md`
- Project charters inherit from this charter and may add constraints but not relax them

## 11-Phase Lifecycle

```
discover → define → visualize → architect → plan → implement → verify → release → operate → diagnose → improve
```

### Phase-to-Agent Mapping
| Phase | Primary Agent | Supporting Agents |
|-------|--------------|-------------------|
| discover | orchestrator | context-curator |
| define | systems-architect | context-curator |
| visualize | systems-architect | context-curator |
| architect | systems-architect | security-reviewer |
| plan | orchestrator | systems-architect |
| implement | builder | context-curator |
| verify | verifier | security-reviewer, performance-reviewer |
| release | docs-release-agent | verifier |
| operate | orchestrator | performance-reviewer |
| diagnose | orchestrator | verifier, security-reviewer |
| improve | docs-release-agent | orchestrator |

## Quality Gates

### Definition of Ready (DoR)
- Goal stated
- Scope bounded
- Acceptance criteria defined
- Risks identified
- Rollback idea documented
- Test outline present

### Definition of Done (DoD)
- All acceptance criteria passed
- Tests added and passing
- Documentation updated
- Operational impact reviewed
- Continuity state updated
- Handoff document generated

## Continuity Requirements

- Task state must be updated before phase close or branch switch
- Handoff documents must be generated for any interrupted or completed work
- Verification commands must be recorded in `nextCommandSet`
- Done criteria must be explicit and testable
- A system is not deterministic unless an AI can reconstruct: current phase, active branch, next verification commands, blocked conditions, and done criteria from committed artifacts alone

## Operating Principles

1. Every meaningful decision produces an artifact
2. Every artifact has an owner, a source of truth, and an update rule
3. Every phase has explicit entry criteria, exit criteria, and verification
4. Every runtime must be observable, diagnosable, and recoverable
5. Verification agents must be independent enough to disagree with builders
6. Release agents consume evidence, not assumptions
7. Context is minimized per microtask and reset after completion
8. Extracted evidence and declared truth remain distinguishable

## Guardrails

- Do not work in a dirty worktree when charter forbids it
- Keep work phase-scoped and independently verifiable
- Use Conventional Commits
- Prefer Nx affected pipelines for verification
- No silent mutation of authoritative source of truth
- High-risk actions require human approval or policy gate
- Every generated artifact must be attributable to a task, phase, or decision

## Artifact Authority Stack

1. Doctrine and operating principles (this charter)
2. Glossary and terminology bank
3. Charter, guardrails, and definition of authority
4. Machine-readable task state and continuity
5. Architecture Decision Records (ADRs)
6. Diagrams (context, container, deployment)
7. Contracts and schemas (OpenAPI, AsyncAPI, JSON Schema)
8. State model and execution model
9. Implementation backlog and change plan
10. Code, configuration, infrastructure, feature flags
11. Verification evidence (unit, integration, E2E, perf, security)
12. Operational assets (dashboards, alerts, runbooks, release notes)
