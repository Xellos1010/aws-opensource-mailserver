# Flagship Foundry SDLC — Claude Code Configuration

## Charter
@.claude/CHARTER.md

## Operating Principles
- Humans own intent, priorities, ethics, and approval boundaries
- AI agents own transformation work only inside declared guardrails
- Every meaningful decision produces an artifact
- Every artifact has an owner, a source of truth, and an update rule
- Every phase has explicit entry criteria, exit criteria, and verification
- Every runtime must be observable, diagnosable, and recoverable

## Lifecycle Stages
```
discover → define → visualize → architect → plan → implement → verify → release → operate → diagnose → improve
```

## Three Operating Loops
1. **Intent → Architecture**: discover, define, visualize, architect
2. **Architecture → Implementation**: plan, implement, verify, release
3. **Operate → Improve**: operate, diagnose, improve

## Continuity Pattern
- Machine-readable state: `.codex/projects/<project>/current-task.json`
- Human-readable charter: `.codex/projects/<project>/SDLC_CHARTER.md`
- Handoff docs: project-local `docs/` directory
- Verification commands: `nextCommandSet` in task state
- Flagship schema: `foundry/flagship-foundry-work/schemas/continuity-state.schema.json`

## Resume Protocol
1. Read continuity state from `.codex/projects/<project>/current-task.json`
2. Verify `activeBranch`, `currentPhase`, `nextCommit`
3. Read `SDLC_CHARTER.md` and project handoff docs
4. Run `nextCommandSet` verification commands
5. Continue only when worktree matches declared phase branch

## Agent Hierarchy
| Agent | Role | Model |
|-------|------|-------|
| @orchestrator | Phase routing, work assignment, done criteria | inherit |
| @context-curator | Source packet assembly, reference gathering | haiku |
| @systems-architect | Structure, boundaries, contracts, ADRs | opus |
| @builder | Implementation within approved scope | sonnet |
| @verifier | Independent test and evidence validation | inherit |
| @security-reviewer | Permissions, secrets, trust boundaries | inherit |
| @performance-reviewer | Profiling, hot paths, capacity | inherit |
| @docs-release-agent | Packaging, runbooks, release notes, handoffs | sonnet |

## Skills
- `/sdlc-phase-router` — Routes work to correct lifecycle stage
- `/continuity-writer` — Updates task state after phase transitions
- `/nx-verification` — Runs Nx typecheck/test/build/e2e
- `/evidence-collector` — Gathers verification evidence bundles
- `/adr-writer` — Creates Architecture Decision Records
- `/handoff-generator` — Generates plan handoff documents
- `/define-intent` — Interactive Discover→Architect pipeline (idea → diagrams → principles → DoR)
- `/scope-chunker` — Decomposes intent into typed work order tree with model routing
- `/c4-diagram-generator` — C4 Mermaid diagrams (context, container, component, sequence)
- `/model-router` — Routes task classes to correct model tier; local LLM configuration

## Artifact Authority Stack
1. Doctrine and operating principles
2. Glossary and terminology bank
3. Charter, guardrails, definition of authority
4. Machine-readable task state and continuity
5. Architecture Decision Records
6. Diagrams (context, container, deployment)
7. Contracts and schemas
8. Implementation backlog and change plan
9. Code, configuration, infrastructure
10. Verification evidence
11. Operational assets

## Workspace References
- Flagship handbook: @docs/reference/flagship_systems_sdlc_handbook.docx.md
- Codex schemas: @.codex/schemas/task-state.schema.json
- Flagship schemas: @foundry/flagship-foundry-work/schemas/continuity-state.schema.json
- Work-order schema: @foundry/flagship-foundry-work/schemas/agent-work-order.schema.json
- Cursor rules: @.cursor/rules/03-workflow/ai-sdlc-orchestrator.mdc
- Runbook: @.claude/RUNBOOK.md

## Code Standards
- Use Conventional Commits
- Prefer Nx affected pipelines for verification
- TypeScript strict mode
- Follow existing `.cursor/rules/` layer conventions
