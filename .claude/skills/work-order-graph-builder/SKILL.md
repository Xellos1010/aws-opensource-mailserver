---
name: work-order-graph-builder
description: Decomposes a migration or implementation initiative into a bounded, dependency-ordered work-order DAG and Foundry team config. Trigger on "split this initiative for agents", "generate work orders", "build team config for migration", or at the plan phase. Requires migration-map-builder and target-profile-router outputs. Produces execution/work-orders.md and execution/team-config.json.
---

# Work Order Graph Builder

One work order per bounded, independently verifiable slice. No ambiguity, no overlap.

## Mindset

Scope-chunker thinking: explicit dependency edges, explicit acceptance criteria, explicit verifier for every order.

## Output artifacts

| Artifact | Path |
|---|---|
| Work order graph | `execution/work-orders.md` |
| Team config | `execution/team-config.json` |
| Lead prompt | `execution/lead-prompt.md` |

## Work order schema (per entry in work-orders.md)

```markdown
## WO-<ID>
- **Initiative**: <name>
- **Phase**: <sdlc-phase>
- **Persona**: <persona from agent-personas>
- **Subagent type**: <skill name>
- **Model**: sonnet | opus | haiku
- **Scope**: <bounded file/module set>
- **Depends on**: <WO-IDs or "none">
- **Objective**: <single sentence — what must be true when done>
- **Acceptance criteria**:
  - [ ] <criterion 1>
  - [ ] <criterion 2>
- **Verification**: <how to check — command, artifact path, or reviewer>
- **Plan approval required**: yes | no
```

## Team config schema

Follow the Foundry `team-config.json` convention:
```json
{
  "initiative": { "name": "", "slug": "", "startingPhase": "", "status": "ready" },
  "team": {
    "teammates": [
      { "name": "", "objective": "", "subagentType": "", "model": "", "scope": [], "dependsOn": [] }
    ]
  },
  "doneCriteria": [],
  "leadPromptPath": "execution/lead-prompt.md",
  "continuityPath": ".foundry/projects/<slug>/current-task.json"
}
```

## Decomposition rules

- Slice by subsystem first, then by file cluster within a subsystem
- Maximum scope per work order: one subsystem section or 20 files, whichever is smaller
- Every rewrite work order must have a corresponding verification work order
- Parallel work orders must have zero file overlap
- Research, planning, implementation, and verification are always distinct orders

## Dependency ordering

1. Cartographer + pseudocode + contracts (parallelizable, no deps)
2. Gap matrix (depends on cartographer)
3. Target map (depends on pseudocode + contracts + gap matrix)
4. Porter work orders per subsystem (depends on target map; subsystems are parallelizable)
5. Verification (depends on all porter orders)
6. Evidence pack + handoff (depends on verification)

## Procedure

1. Read migration/target-map.json and migration/target-profile.json
2. Group entries by rustTarget crate → one porter work order per crate section
3. Assign personas per packet's agent-personas doc
4. Route model tier per packet's model routing table
5. Write work-orders.md (DAG order)
6. Write team-config.json (Foundry convention)
7. Write lead-prompt.md (references work-orders.md; includes dynamic queue if >10 orders)

## Quality gates

- [ ] Every entry in target-map.json appears in exactly one work order
- [ ] Every work order has at least one acceptance criterion
- [ ] No circular dependency edges in the DAG
- [ ] team-config.json validates against Foundry team-config schema
