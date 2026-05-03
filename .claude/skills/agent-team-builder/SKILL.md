---
name: agent-team-builder
description: >
  Design and configure a Claude Code agent team for any SDLC initiative in this repo. Runs an interactive
  interview to gather initiative scope, work streams, teammate roles, and acceptance criteria, then
  produces a complete team config, work orders, and a ready-to-use lead prompt saved to
  .foundry/staging/<slug>/. Use this skill whenever you are starting a new agent team initiative,
  want to parallelize SDLC work across independent streams, need to create work orders for a
  multi-teammate migration or feature build, or want to design a team before launching it with
  /agent-team-launcher. Invoke even when the user just says "set up an agent team for X" — this
  skill always comes first.
---

# Agent Team Builder

Design a Claude Code agent team for a specific initiative. Gather all inputs via interview, then generate team config, work orders, and launch artifacts saved to `.foundry/staging/<slug>/`.

Agent teams require `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` in the environment. Each teammate is an independent Claude Code session. The lead coordinates via a shared task list and direct messaging. See `references/agent-teams-primer.md` for architecture details.

## Interview Protocol

Run all five phases in order. Ask only what you don't already know from context — if the user described the initiative before invoking this skill, extract answers from that description.

---

### Phase 1 — Initiative Definition

Gather:
1. **Name** — short human-readable title (e.g. "TypeScript → Rust Migration")
2. **Slug** — kebab-case identifier used for file paths (e.g. `ts-react-rust-migration`)
3. **Objective** — one or two sentences: what will be materially different when this initiative is done?
4. **Scope** — which files, modules, apps, or systems are in play? Be specific (e.g. `apps/night-agent-runner/src/`)

If the user hasn't named it, suggest a slug based on what they described.

---

### Phase 2 — SDLC Placement

Determine where in the lifecycle this initiative starts. Default to the `.foundry` cycle used in this repo:

```
discover → define → visualize → architect → plan → implement → verify → release → operate → diagnose → improve
```

Ask: "Which phase are we starting at?" If unclear, suggest based on the objective:
- New idea with no design: `discover`
- Design exists, building now: `implement`
- Code exists, validating: `verify`
- Migration or porting work: `implement` (with analysis as first task)

Check `.foundry/projects/<slug>/current-task.json` — if it exists, we may be **resuming**, not starting fresh. If resuming, read the current phase from `currentPhase.id` and `sdlcPhase` and confirm with the user.

See `references/sdlc-phases.md` for phase entry/exit criteria.

---

### Phase 2.5 — Single Team vs Pipeline

Before designing work streams, decide the initiative shape:

**Use a single team** when:
- Total work fits in 3–6 independent streams
- All streams can start simultaneously or have simple dependencies

**Use a pipeline** (multiple teams in sequence) when:
- More than ~6 independent streams needed
- Work naturally divides into phases where one phase produces artifacts the next consumes
- File count is large enough that one analyzer or porter per-subsystem is insufficient (500+ files is a clear signal)

If pipeline: design each team stage independently, with each stage producing a concrete output artifact the next stage depends on. Save to `pipeline/NN-<stage>/team-config.json`. Create a `pipeline.json` at the initiative root to track stage order and status.

Stages 2–5 can be offered to run concurrently if they share only the stage-1 output (not each other's output).

---

### Phase 3 — Work Stream Design

Work streams become teammates. Each stream must be:
- **Independent** — can make progress without waiting on other streams
- **Bounded** — owns a specific set of files or concerns
- **Deliverable** — produces a clear artifact or state change

For each stream, collect:
| Field | What to ask |
|-------|-------------|
| `name` | Short role label (e.g. `analyzer`, `porter-tui`, `verifier`) |
| `objective` | One sentence: what does this teammate accomplish? |
| `scope` | File paths, glob patterns, or system names this teammate owns |
| `subagentType` | Which subagent definition to use (see `references/role-catalog.md`) |
| `model` | `haiku`, `sonnet`, or `opus` — suggest based on task class |
| `planApprovalRequired` | true/false — require plan review before implementation? |
| `dependsOn` | Names of other streams that must complete first (empty if independent) |

**Suggest streams** based on the initiative type. For TS→Rust migrations specifically, suggest:
1. `analyzer` — ts-react-rust-analyzer, runs first on all source, broadcasts findings
2. `porter-<subsystem>` (one per subsystem) — rust-porter, ports a bounded file set
3. `verifier` — rust-migration-verifier, verifies each ported slice after porter completes

Keep the team to 3–6 teammates. More than 6 creates coordination overhead that outweighs parallel benefit. If the scope is larger, structure work so each teammate has 4–6 tasks rather than spawning more teammates.

---

### Phase 4 — Acceptance Criteria

Gather 3–7 specific, testable done criteria. Each should be verifiable by running a command or checking a file. Examples:
- "All Nx typecheck, test, and build targets pass for apps/agent-runner-rust"
- "rust-migration-verifier reports PASS for all ported modules"
- "No TS source files remain unanalyzed in scope"

These become the `doneCriteria` array in continuity state and the final task in the team's work order list.

---

### Phase 5 — Generate Artifacts

Once all inputs are gathered, produce four files in `.foundry/staging/<slug>/`:

#### 5.1 — `team-config.json`

```json
{
  "initiative": {
    "name": "<human-readable name>",
    "slug": "<slug>",
    "objective": "<objective>",
    "sdlcCycle": "monorepo/.foundry",
    "startingPhase": "<phase>",
    "createdAt": "<ISO timestamp>",
    "status": "ready"
  },
  "team": {
    "planApprovalRequired": <bool>,
    "teammates": [
      {
        "name": "<name>",
        "objective": "<objective>",
        "subagentType": "<subagent-type-or-null>",
        "model": "<haiku|sonnet|opus>",
        "scope": ["<path-or-glob>"],
        "dependsOn": ["<teammate-name>"],
        "planApprovalRequired": <bool>
      }
    ]
  },
  "doneCriteria": ["<criterion>"],
  "workOrdersPath": ".foundry/staging/<slug>/work-orders.md",
  "leadPromptPath": ".foundry/staging/<slug>/lead-prompt.md",
  "continuityPath": ".foundry/projects/<slug>/current-task.json"
}
```

#### 5.2 — `work-orders.md`

One work order per teammate stream, following the scope-chunker format:

```markdown
## Work Order: WO-<SLUG>-<NN>
- **Initiative**: <name>
- **Lifecycle Stage**: <phase>
- **Agent Role**: <name>
- **Subagent Type**: <type>
- **Model**: <tier>
- **Scope**: <file list or globs>
- **Depends On**: <teammate names or "none">
- **Objective**: <one sentence>
- **Acceptance Criteria**:
  - [ ] <criterion>
- **Verification**:
  - `<command>`
- **Plan Approval Required**: yes/no
```

Add a final work order `WO-<SLUG>-DONE` assigned to the lead for final acceptance criteria check.

#### 5.3 — `lead-prompt.md`

The exact prompt to paste to Claude when starting or resuming the team. It must contain:

1. The `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` reminder
2. The initiative objective
3. The SDLC cycle reference (`.foundry` path)
4. Each teammate's name, subagent type, scope, model, and dependency order
5. Plan approval instructions (if required)
6. Coordination rules:
   - Which teammate runs first
   - How they share findings (broadcast vs direct message)
   - When verifiers engage
   - How to update continuity state after each phase transition
   - Cleanup instructions when done
7. Reference to `work-orders.md` path

Format:
```markdown
# Team Lead Prompt — <Initiative Name>

## Environment
Ensure `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` is set before launching.

## Objective
<objective>

## SDLC Context
Cycle: `.foundry` (discover → define → visualize → architect → plan → implement → verify → release → operate → diagnose → improve)
Current phase: <phase>
Continuity state: `.foundry/projects/<slug>/current-task.json`

## Team Structure
Spawn the following teammates:

### 1. <name> (subagent: <type>, model: <model>)
**Scope**: <scope>
**Objective**: <objective>
**Depends on**: <deps or "none — starts immediately">
**Instructions**: <specific spawn instructions>

...

## Coordination Rules
<rules>

## Acceptance Gate
Before marking the initiative complete, verify:
<done criteria>

## Work Orders
Full work order tree: `.foundry/staging/<slug>/work-orders.md`
```

#### 5.4 — Initial `current-task.json`

Create `.foundry/projects/<slug>/current-task.json` (or update if resuming) using the schema at `.foundry/schemas/task-state.schema.json`. Set:
- `sdlcPhase`: starting phase
- `currentPhase.status`: `"in_progress"`
- `doneCriteria`: the criteria from Phase 4
- `nextCommandSet`: first verification step or "Launch team with lead-prompt.md"

---

## After Generation

Tell the user:
1. Where the artifacts were saved
2. To invoke `/agent-team-launcher` to select and start the team
3. That `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` must be set (show how)

If the team is for a **TS→Rust migration** specifically, also remind them to run `/ts-react-rust-analyzer` on the scope first if an `analyzer` teammate isn't included — analysis before porting is non-negotiable.
