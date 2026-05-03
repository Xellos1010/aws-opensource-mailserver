# `.foundry/` -- Foundry SSOT Root

This directory is the **single source of truth** (SSOT) for Foundry-owned metadata and configuration in this repository. All environment agents (Cursor, Claude Code, Codex, future tools) inherit behavioral definitions from here.

## Authority Chain

- **ADR-011**: Established `.foundry/projects/<slug>/` as the canonical location for per-project continuity instances.
- **ADR-011a**: Established `.foundry/personas/`, `.foundry/skills/`, and `.foundry/agents/` as canonical locations for repo-wide Foundry behavioral content.
- **ADR-002**: Schema authority remains in `flagship-foundry-work/schemas/`; this directory holds runtime instances, not contract definitions.

## Directory Layout

```
.foundry/
  README.md                          # This file
  schemas/                           # Foundry-owned schemas (task-state, etc.)
    task-state.schema.json
  projects/                          # Per-project continuity instances
    <slug>/
      current-task.json              # Machine-readable continuity state
      SDLC_CHARTER.md                # Human-readable project charter
  personas/                          # Repo-wide persona packs
    <id>.json                        # Structured agent personality definitions
  skills/                            # Foundry-owned skill procedures
    <name>/
      SKILL.md                       # Canonical procedure body (env-neutral)
  agents/                            # Foundry-owned agent role definitions
    <name>.md                        # Canonical role, phase bindings, contracts
```

### Reserved (do not create until a feature needs them)
- `.foundry/cache/`
- `.foundry/templates/`
- `.foundry/projects/<slug>/persona-overrides/`

## Read Order

For agents and tooling resuming or bootstrapping:

1. `.foundry/projects/<project>/current-task.json` -- current lifecycle phase, active branch, verification commands
2. `.foundry/projects/<project>/SDLC_CHARTER.md` -- project-level SDLC constraints and guardrails
3. `.foundry/personas/*.json` -- available agent persona packs
4. `.foundry/skills/<name>/SKILL.md` -- executable skill procedures
5. `.foundry/agents/<name>.md` -- agent role definitions and output contracts
6. Project-local handoff docs under the target app's `docs/` directory

## Inheritance Model

`.foundry/` holds the **base** (canonical) definitions. Environment-specific tools use **overlay** files:

```
.foundry/agents/<name>.md            <-- BASE: full role definition (env-neutral)
.cursor/agents/<name>.md             <-- OVERLAY: Cursor frontmatter + @ import of BASE
.claude/agents/<name>.md             <-- OVERLAY: Claude Code YAML frontmatter (name, description, tools, model) + @ import
.codex/agents/<name>.toml            <-- OVERLAY: Codex custom agent TOML (name, description, developer_instructions → read BASE)

.foundry/skills/<name>/SKILL.md      <-- BASE: canonical procedure body
.cursor/skills/<name>/SKILL.md       <-- OVERLAY: Cursor YAML frontmatter + @ import of BASE
.claude/skills/<name>/SKILL.md       <-- OVERLAY: Claude YAML frontmatter (name, description) + @ import of BASE
.codex/skills/<name>/SKILL.md        <-- OVERLAY: Codex YAML (name, description, allowed-tools) + pointer to read BASE

.foundry/personas/<id>.json          <-- BASE ONLY: no overlay mechanism; consumed directly
```

**Rules:**
- Overlay files must NOT duplicate the canonical procedure body from `.foundry/`.
- Overlay files contain only: tool-specific frontmatter, a reference to the base, and environment-specific extensions.
- If you need to change Foundry behavioral content, edit the `.foundry/` file, not the overlay.

## Validation

- Persona files validate against `flagship-foundry-work/schemas/persona-pack.schema.json`.
- Continuity instances validate against `flagship-foundry-work/schemas/continuity-state.schema.json`.
- Discovery contract: glob `.foundry/personas/*.json` for all available personas; glob `.foundry/skills/*/SKILL.md` for all skills; glob `.foundry/agents/*.md` for all agents.

## Migration from `.codex/`

Per ADR-011, the runtime continuity instance moved from `.codex/projects/<slug>/` to `.foundry/projects/<slug>/`. During the 30-day dual-read window:

- `continuity.mjs` tries `.foundry/projects/<slug>/current-task.json` first.
- On miss, falls back to `.codex/projects/<slug>/current-task.json` with a WARN log.
- The fallback is removed 30 calendar days after the migration merge date.

Legacy `.codex/` paths may remain on disk for other tools; they are non-authoritative for Foundry.

## Rules

- Keep this data committed and deterministic.
- Update `current-task.json` whenever the active branch, phase, next commit, or verification commands change.
- No secrets in `.foundry/` -- charters and task JSON should be reviewable; env secrets must not appear here.
- Prefer referencing existing `.cursor/rules/` for tool-specific policies instead of duplicating policy text here.
- Use project-local `docs/` directories for human-readable runbooks, ledgers, SOPs, and diagram indexes.
