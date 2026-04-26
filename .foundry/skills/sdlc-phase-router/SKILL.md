# SDLC Phase Router

Route work to the correct lifecycle stage by reading continuity state and matching user intent to the 11-phase lifecycle.

## Routing Protocol

### Step 1: Read Continuity State
```bash
cat .foundry/projects/<project>/current-task.json
```
If missing, try legacy `cat .codex/projects/<project>/current-task.json`.
Extract `sdlcPhase` (legacy 7-phase) or `lifecycleStage` (Flagship 11-phase).

### Step 2: Map Intent to Phase
| User Intent Pattern | Target Phase | Primary Agent |
|---|---|---|
| "I have an idea", "new feature", "what if we..." | discover | @context-curator → @systems-architect |
| "define scope", "acceptance criteria", "requirements" | define | @systems-architect |
| "show me the architecture", "diagram", "visualize" | visualize | @systems-architect |
| "design the system", "ADR", "contracts", "schema" | architect | @systems-architect |
| "break it down", "task list", "implementation plan" | plan | @orchestrator (self) |
| "build it", "implement", "code this" | implement | @builder |
| "test it", "verify", "does it work", "review" | verify | @verifier |
| "ship it", "release", "deploy" | release | @docs-release-agent |
| "monitor", "how is it running", "production" | operate | @performance-reviewer |
| "it's broken", "bug", "incident", "why did this fail" | diagnose | @verifier + @security-reviewer |
| "what did we learn", "improve", "retrospective" | improve | @docs-release-agent |

### Step 3: Check Definition of Ready (DoR)
Before entering the target phase, verify:
- [ ] Goal is stated
- [ ] Scope is bounded
- [ ] Acceptance criteria defined
- [ ] Risks identified
- [ ] Rollback idea documented
- [ ] Test outline present

If DoR is not met, the orchestrator must fill gaps before delegation.

### Step 4: Generate Work Order Summary
Produce a work order with:
- `lifecycleStage`: the target phase
- `phaseId`: a kebab-case identifier (e.g., `feature-auth-login-implement`)
- `agentRole`: which agent to delegate to
- `fileScope`: files the agent may touch
- `acceptanceCriteria`: how to know it's done
- `verificationPlan`: commands to run after completion

### Step 5: Delegate
Hand the work order to the appropriate agent and monitor for completion.

## Legacy Phase Mapping
When reading Codex `sdlcPhase` (7 values), map to Flagship lifecycle:
| Codex Phase | Flagship Stage(s) |
|---|---|
| plan | discover + define + plan |
| design | visualize + architect |
| implement | implement |
| verify | verify |
| document | improve |
| release | release |
| operate | operate + diagnose |
