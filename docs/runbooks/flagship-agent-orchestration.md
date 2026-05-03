# Flagship Foundry Agent Orchestration Runbook

## Quick Start

1. **Open Claude Code** in the workspace root — `CLAUDE.md` loads automatically with doctrine, agent references, and skills
2. **Start new work**: Describe your intent. The orchestrator routes it through the lifecycle.
3. **Resume interrupted work**: Say `resume <project-name>`. The orchestrator reads continuity state and picks up where you left off.

---

## Agent Invocation Patterns

### Starting a New Feature

```
User → describes intent
  ↓
@orchestrator → reads continuity, identifies lifecycle stage
  ↓
@context-curator → assembles source packet (files, rules, schemas, constraints)
  ↓
@systems-architect → clarifies scope, produces ADRs, diagrams, contracts
  ↓
Human → reviews and approves architecture
  ↓
@orchestrator → generates implementation work orders (bounded slices)
  ↓
@builder → implements each slice within declared file scope
  ↓
@verifier → independently validates against acceptance criteria
  ↓
@docs-release-agent → packages handoff, release notes, updates continuity
```

### Resuming Interrupted Work

```
User → "resume remote-notary" (or any project name)
  ↓
@orchestrator → reads .codex/projects/<project>/current-task.json
  ↓
@orchestrator → verifies activeBranch matches worktree
  ↓
@orchestrator → checks currentPhase.status
  ├── if "blocked" → surfaces blockers to human
  ├── if "in_progress" → runs nextCommandSet to verify state
  └── if "done" → proposes next phase
  ↓
@orchestrator → continues from declared phase
```

### Bug Fix / Hotfix Path

```
User → describes bug
  ↓
@orchestrator → creates minimal reproduction task
  ↓
@builder → adds failing test, implements minimal fix
  ↓
@verifier → validates fix and regression coverage
  ↓
@security-reviewer → checks for security implications (if applicable)
  ↓
@docs-release-agent → updates continuity and generates handoff
```

### Security or Performance Review

```
User → "review security" or "review performance"
  ↓
@orchestrator → delegates to @security-reviewer or @performance-reviewer
  ↓
Reviewer → produces structured report with findings and severity
  ↓
@orchestrator → routes findings to @builder for remediation (if needed)
```

---

## Agent Reference Table

| Agent | Phase Bindings | Model | Persona | Tools |
|-------|---------------|-------|---------|-------|
| @orchestrator | all phases | opus | coordinator | Read, Grep, Glob, Bash, Agent |
| @context-curator | all (utility) | haiku | — | Read, Grep, Glob, Bash |
| @systems-architect | discover, define, visualize, architect | opus | curious-architect | all |
| @builder | implement | sonnet | conservative-builder | all |
| @verifier | verify, release, operate | inherit | skeptical-verifier | Read, Grep, Glob, Bash (no Write/Edit) |
| @security-reviewer | verify, architect | inherit | paranoid-security | Read, Grep, Glob, Bash (no Write/Edit) |
| @performance-reviewer | verify, diagnose | inherit | performance-hunter | Read, Grep, Glob, Bash (no Write/Edit) |
| @docs-release-agent | document, improve, release | sonnet | sync-editor | all |

---

## Three Operating Loops

### Loop 1: Intent → Architecture
**Phases**: discover → define → visualize → architect

Human defines mission, constraints, scope, and success metrics. The systems-architect clarifies ambiguity, produces diagrams and ADRs, and the orchestrator proposes the first implementation slice.

### Loop 2: Architecture → Implementation
**Phases**: plan → implement → verify → release

The orchestrator breaks architecture into bounded work orders. The builder implements each slice. The verifier validates independently. The docs-release-agent packages the release.

### Loop 3: Operate → Improve
**Phases**: operate → diagnose → improve

Runtime telemetry or incidents trigger diagnosis. The orchestrator coordinates root cause analysis. Approved remediation produces work orders that flow back through Loop 2. The docs-release-agent captures learning records.

---

## Skills Reference

| Skill | Command | Purpose |
|-------|---------|---------|
| sdlc-phase-router | `/sdlc-phase-router` | Route work to correct lifecycle stage |
| continuity-writer | `/continuity-writer` | Update task state for resumability |
| nx-verification | `/nx-verification` | Run Nx typecheck/test/build pipelines |
| evidence-collector | `/evidence-collector` | Gather structured evidence bundles |
| adr-writer | `/adr-writer` | Create Architecture Decision Records |
| handoff-generator | `/handoff-generator` | Generate plan handoff documents |

---

## Phase Gate Quick Reference

See full matrix: `.claude/skills/sdlc-phase-router/reference/phase-gate-matrix.md`

**Definition of Ready** (before entering any phase):
- Goal stated, scope bounded, acceptance criteria defined
- Risks identified, rollback idea documented, test outline present

**Definition of Done** (before closing any phase):
- Acceptance criteria passed, tests added and passing
- Documentation updated, operational impact reviewed
- Continuity state updated, handoff document generated

---

## Continuity Files

| File | Purpose |
|------|---------|
| `.codex/projects/<project>/current-task.json` | Machine-readable phase state |
| `.codex/projects/<project>/SDLC_CHARTER.md` | Project operating rules |
| `.codex/schemas/task-state.schema.json` | Task state schema (7-phase) |
| `foundry/flagship-foundry-work/schemas/continuity-state.schema.json` | Flagship schema (11-phase) |
| `foundry/flagship-foundry-work/schemas/agent-work-order.schema.json` | Work order contract |
| `.claude/CHARTER.md` | Workspace authority and doctrine |

---

## Troubleshooting

### Agent won't start
- Check that `.claude/agents/<agent>.md` exists and has valid YAML frontmatter
- Verify the agent is referenced in `.claude/CLAUDE.md`

### Continuity state is stale
- Run `cat .codex/projects/<project>/current-task.json` to inspect
- Check `currentPhase.updatedAt` — if old, use `/continuity-writer` to refresh
- Verify `activeBranch` matches `git branch --show-current`

### Context collapse (lost session context)
- Read the most recent handoff document in `docs/handoffs/`
- Load the supporting files listed in the handoff
- Run the `nextCommandSet` from continuity state to verify current state

### Verifier disagrees with builder
- This is expected and healthy — the verifier must be independent
- Review the verifier's evidence and findings
- Route actionable findings back to the builder via the orchestrator
