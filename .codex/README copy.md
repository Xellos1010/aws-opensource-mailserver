# Codex Continuity Files

This directory is the machine-readable continuity layer for Codex work in this workspace.

## Read Order

1. `.codex/projects/<project>/current-task.json`
2. `.codex/projects/<project>/SDLC_CHARTER.md`
3. Project-local handoff docs under the target app's `docs/` directory
4. Existing `.cursor/rules/**` documents referenced by the charter and handoff docs

## Rules

- Keep this data committed and deterministic.
- Update `current-task.json` whenever the active branch, phase, next commit, or verification commands change.
- Prefer referencing existing `.cursor` rules instead of duplicating policy text here.
- Use project-local docs for human-readable runbooks, ledgers, SOPs, and diagram indexes.
