---
name: agent-team-launcher
description: >
  Select, start, or resume a Claude Code agent team initiative from this repo's .foundry/staging/
  directory. Scans for configured initiatives and pipelines, shows status, lets the user pick one,
  then generates the exact terminal command and lead prompt to launch the team with
  CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS enabled. Supports both single-team initiatives and
  multi-team pipeline initiatives (where teams run sequentially by stage). Use this skill whenever
  the user wants to start or resume an agent team, wants to see what team initiatives exist, asks
  "which teams are configured", wants to pick up where a team left off, says "launch the team",
  "start the next stage", or "resume the initiative". Invoke even when the user just says
  "let's start the team" without specifying which one — this skill handles discovery and selection.
---

# Agent Team Launcher

Select and launch or resume a configured agent team initiative from `.foundry/staging/`.

Agent teams require `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`. Each teammate is a fully independent Claude Code session. This skill generates the exact invocation — you run the command, not this skill.

Supports two initiative types:
- **Single-team**: one `team-config.json` at the initiative root
- **Pipeline**: a `pipeline.json` at the initiative root with multiple stage team-configs under `pipeline/NN-<stage>/`

---

## Step 1 — Discover Initiatives

Scan `.foundry/staging/` for subdirectories. For each subdirectory:
- If it contains `pipeline.json` → **pipeline initiative** (read pipeline.json for stages)
- If it contains `team-config.json` → **single-team initiative**

For pipeline initiatives, read `pipeline.json` and show stage-level status. For each stage, check the stage's `team-config.json` for:
- `initiative.name` — human-readable title
- `initiative.slug` — path identifier
- `initiative.startingPhase` — SDLC phase
- `initiative.status` — `ready | active | paused | complete`
- `initiative.createdAt` — creation timestamp
- `team.teammates` — count and names
- `continuityPath` — path to `.foundry/projects/<slug>/current-task.json`

Also check `continuityPath` for each initiative. If the file exists, read:
- `currentPhase.status` — to detect active/blocked/done state
- `currentPhase.id` — current phase slug
- `sdlcPhase` — current lifecycle stage
- `blockedBy` — any blocking issues

If `.foundry/staging/` is empty or no `team-config.json` files exist, tell the user to run `/agent-team-builder` first.

---

## Step 2 — Present the Initiative List

**For single-team initiatives**, display:
```
Available Agent Team Initiatives
─────────────────────────────────────────────────────────────────────────
  #  Initiative                   Phase        Status      Teammates
─────────────────────────────────────────────────────────────────────────
  1  Flagship Foundry UI Revamp   visualize    ready       3 (architect, builder, reviewer)
─────────────────────────────────────────────────────────────────────────
```

**For pipeline initiatives**, display the pipeline view:
```
Pipeline Initiative: TypeScript → Rust Migration (6 stages)
─────────────────────────────────────────────────────────────────────────────────
  Stage  Name                      Teammates  Status     Next Action
─────────────────────────────────────────────────────────────────────────────────
    1    Source Analysis            7          ✅ done    —
    2    Port TUI Layer             4          ▶ ready    LAUNCH NOW
    3    Port CLI Layer             2          ▶ ready    can launch concurrent with 2
    4    Port Core Runtime          4          ▶ ready    can launch concurrent with 2-3
    5    Port Extension Layer       3          ▶ ready    can launch concurrent with 2-4
    6    Behavioral Verification    6          ⏸ pending  requires stages 2-5 complete
─────────────────────────────────────────────────────────────────────────────────
Active stage: 1 complete → stages 2-5 can now launch concurrently
```

Status icons: `✅ done` | `▶ ready` | `🔄 active` | `⏸ pending` | `🚫 blocked`

If only one initiative exists, skip the selection prompt and confirm it directly. For pipelines, ask which stage(s) to launch.

---

## Step 3 — User Selects

Ask: "Which initiative? (#)" or let them type the name. Accept number, slug, or partial name match.

Once selected, load the full `team-config.json` and read the `leadPromptPath` file.

---

## Step 4 — Determine Mode: Start vs Resume

**Starting fresh** when:
- `initiative.status` is `ready`
- No `current-task.json` exists at `continuityPath`
- User says "start fresh" or "reset"

**Resuming** when:
- `initiative.status` is `active` or `paused`
- `current-task.json` exists and `currentPhase.status` is not `done`
- User says "resume" or "continue"

For a **resume**, prepend to the lead prompt:
```
RESUMING initiative: <name>
Current phase: <currentPhase.id> (<sdlcPhase>)
Branch: <activeBranch>
Last status: <currentPhase.status>
Blockers: <blockedBy or "none">

Read .foundry/projects/<slug>/current-task.json for full continuity state before spawning teammates.
Run nextCommandSet verification commands before assigning new work.
```

---

## Step 5 — Check Environment

Check if `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS` is enabled by reading `~/.claude.json` or the local `settings.json`. If it is not set, show the user how to enable it.

**Three options** to enable:

**Option A — Per-session (terminal):**
```bash
CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1 claude
```

**Option B — Persistent (global settings):**
Add to `~/.claude.json`:
```json
{
  "env": {
    "CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS": "1"
  }
}
```

**Option C — Project settings:**
Add to `monorepo/.claude/settings.json` under `env`.

Ask: "Would you like me to enable it in settings.json so you don't have to set it each time?" If yes, invoke the `/update-config` skill to add it.

---

## Step 6 — Choose Display Mode

Ask: "Do you want teammates in split panes (requires tmux or iTerm2) or in-process (any terminal)?"

Default: in-process unless already in a tmux session.

For split-pane mode, verify tmux is available:
```bash
which tmux
```

If tmux is not found, offer in-process or guide them to install tmux. For iTerm2 mode, the `it2` CLI must be installed.

Show the flag to pass if overriding: `--teammate-mode in-process` or `--teammate-mode tmux`.

---

## Step 7 — Generate Launch Output

Produce a clean, copy-pasteable launch block:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  LAUNCH: <Initiative Name>
  Phase: <phase> | Teammates: <count> | Mode: <mode>
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. Open a new Claude Code session in monorepo/:

   CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1 claude [--teammate-mode <mode>]

2. Paste this prompt to the lead:

───────── COPY FROM HERE ─────────
<full contents of lead-prompt.md, with resume prefix if resuming>
───────── COPY TO HERE ─────────

3. Interact with teammates:
   - In-process: Shift+Down to cycle, type to message, Ctrl+T for task list
   - Split pane: click into a pane to message that teammate

4. When done: tell the lead "Clean up the team" to release team resources.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

---

## Step 8 — Update Initiative Status

After generating the launch output, update `team-config.json`:
- Set `initiative.status` to `"active"`
- Set `initiative.lastLaunchedAt` to current ISO timestamp

If the `current-task.json` continuity file doesn't exist yet (fresh start), create it now using the initial state from `agent-team-builder` or initialize it with:
- `sdlcPhase`: `startingPhase` from team config
- `currentPhase.status`: `"in_progress"`
- `activeBranch`: current git branch (`git branch --show-current`)

---

## Troubleshooting

**Teammates not appearing after launch:** Press Shift+Down. If still missing, the task may need to be more complex — check that the lead prompt clearly asks for a team.

**Permission prompts slowing things down:** Pre-approve common operations. Consider running with `--dangerously-skip-permissions` for trusted migration work (all teammates inherit this).

**Team stuck / teammate stopped on error:** Use Shift+Down to reach the stuck teammate and give it recovery instructions directly. Or tell the lead to spawn a replacement.

**Resume failing / lead messaging non-existent teammates:** After a session crash, lead may try to message dead teammates. Tell the lead: "The previous session crashed. Please spawn fresh teammates based on the work-orders.md and resume from where we left off."

**Task status lagging:** If a task appears stuck, tell the lead to manually mark it complete and move on.
