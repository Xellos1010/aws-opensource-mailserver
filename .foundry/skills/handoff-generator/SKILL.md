# Handoff Generator

Generate standardized handoff documents that enable any agent — or a new session after context collapse — to resume work with full context.

## When to Generate
- Phase completion (work is done, next phase starts)
- Work interruption (session ending, context limit approaching)
- Agent delegation (handing work from one agent to another)
- Plan completion (plan approved, implementation about to begin)

## Generation Protocol

### Step 1: Read Current State
- Read `.foundry/projects/<project>/current-task.json` (legacy: `.codex/projects/<project>/current-task.json`)
- Read recent git log: `git log --oneline -10`
- Read any open work orders or pending tasks

### Step 2: Collect Evidence References
For each claim or decision made during the work:
- What was the claim?
- What evidence supports it?
- Where is the evidence located (file path)?

### Step 3: Identify Supporting Files
List every file that a resuming agent would need to read to have full context:
- Continuity state file
- Charter and rules files
- Source files that were modified
- Test files that validate the changes
- Schema files that constrain the work

### Step 4: Fill Template
Use the template at `.foundry/skills/handoff-generator/templates/PLAN_HANDOFF_TEMPLATE.md`

### Step 5: Save
Save the handoff document to the project's `docs/` directory:
```
docs/handoffs/handoff-[phase-id]-[date].md
```

## Quality Checklist
- [ ] Summary is 1-3 sentences, not a wall of text
- [ ] Every evidence reference has a real file path
- [ ] Continuity state snapshot matches actual `current-task.json`
- [ ] Supporting files list includes only files that actually exist
- [ ] Open questions are actionable, not vague
- [ ] Rollback notes describe a concrete reversal path
- [ ] Next steps are specific and ordered
