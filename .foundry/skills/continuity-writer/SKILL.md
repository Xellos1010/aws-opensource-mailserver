# Continuity Writer

Update `.foundry/projects/<project>/current-task.json` (**ADR-011**; legacy fallback: `.codex/projects/<project>/current-task.json`) to maintain deterministic resumability.

## When to Update
- Phase transition (entering or completing a phase)
- Branch switch (new feature branch, merge to base)
- Verification completion (test results change state)
- Blocker discovered or resolved
- Work interrupted (generate handoff before stopping)

## Update Protocol

### Step 1: Read Current State
```bash
cat .foundry/projects/<project>/current-task.json
```

### Step 2: Determine Changes
Compare current state against what just happened:
- Did the phase status change? (`pending` → `in_progress` → `verified` → `done`)
- Did the active branch change?
- Did verification commands change?
- Were new artifacts produced?
- Were blockers added or resolved?
- Were done criteria satisfied?

### Step 3: Apply Updates
Update only the fields that changed. Preserve all other fields exactly.

**Fields to update:**

| Field | When to Update |
|---|---|
| `currentPhase.status` | Phase status changed |
| `currentPhase.updatedAt` | Any phase update (use ISO 8601) |
| `currentPhase.notes` | Add notes about what happened |
| `activeBranch` | Branch switched |
| `nextCommit.branch` | Next commit target changed |
| `nextCommit.message` | Next expected commit message |
| `nextCommandSet` | Verification commands changed |
| `blockedBy` | Blockers added or resolved |
| `artifacts` | New artifacts produced |
| `doneCriteria` | Criteria added, modified, or satisfied |
| `lifecycleStage` | 11-phase enum value (when using Flagship schema) |

### Step 4: Validate the Continuity Invariant
> An AI system must be able to determine from committed artifacts alone: current phase, active branch, next verification commands, blocked conditions, and done criteria.

If any of these cannot be determined from the updated state, the update is incomplete.

## Flagship Schema Fields (for enhanced continuity)
When using the Flagship `continuity-state.schema.json`, also update:
- `lifecycleStage`: The 11-phase enum value
- `phaseSequence`: Integer sequence number
- `graphRevision`: Version of the graph state
- `nextWorkOrders`: Array of pending work order references
- `verificationPlan`: Array of verification commands
- `artifactAuthorities`: Map of artifact type to authority/owner
- `evidenceBundles`: Array of evidence bundle paths
- `impactedSystems`: Array of affected system IDs

## Commit Convention
When committing continuity updates:
```
chore(codex): update <project> task state — <phase> <status>
```
