---
name: continuity-writer
description: >
  Updates machine-readable continuity after phase transitions, branch changes, or verification completion.
allowed-tools:
  - Read
  - Write
  - Bash
  - Grep
  - Glob
---

# Continuity writer (Codex overlay)

**Authoritative procedure:** read and follow `.foundry/skills/continuity-writer/SKILL.md` at the repository root. Prefer updating `.foundry/projects/<project>/current-task.json` with legacy `.codex/projects/...` fallback per that file. Invoke with `$continuity-writer` when enabled.
