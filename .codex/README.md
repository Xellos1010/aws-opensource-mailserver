# Codex Continuity Files

This directory is the machine-readable continuity layer for Codex work in this workspace.

## Read Order

1. `.foundry/projects/<project>/current-task.json` (canonical; see `.foundry/README.md`)
2. `.codex/projects/<project>/current-task.json` (legacy continuity during dual-read window)
3. `.codex/projects/<project>/SDLC_CHARTER.md` or `.foundry/projects/<project>/SDLC_CHARTER.md`
4. Project-local handoff docs under the target app's `docs/` directory
5. Existing `.cursor/rules/**` documents referenced by the charter and handoff docs

## Codex agents

Project-scoped custom agents live as **TOML** under `.codex/agents/*.toml` (OpenAI Codex subagent format: `name`, `description`, `developer_instructions`). Each profile instructs the model to read the matching `.foundry/agents/<name>.md` contract as SSOT.

## Rules

- Keep this data committed and deterministic.
- Update `current-task.json` whenever the active branch, phase, next commit, or verification commands change.
- Prefer referencing existing `.cursor` rules instead of duplicating policy text here.
- Use project-local docs for human-readable runbooks, ledgers, SOPs, and diagram indexes.
