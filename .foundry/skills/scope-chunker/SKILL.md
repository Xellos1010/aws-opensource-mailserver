# Scope Chunker — Intent to Work Order Tree

Decompose a defined intent packet into executable, bounded work orders with explicit agent assignments, file scope, and verification plans.

## Prerequisites
- Intent packet from `define-intent` must be complete (DoR met)
- Acceptance criteria defined and testable
- System context and container diagrams exist
- Applicable principles and guardrail packs identified

## Decomposition Protocol

### Step 1: Extract Glossary and Domain Map
From the intent packet, extract:
- Key terms and their definitions (already in glossary)
- System and component identifiers
- Contract and schema names
- Data flow boundaries (what moves where)

### Step 2: Enumerate Impacted Nodes
Using the system context and container diagrams, list every system, component, and contract that will change. For each node:
- What changes? (new, modified, deleted)
- What contracts does it expose or consume?
- Which guardrail packs apply?

```markdown
## Impacted Node Inventory
| Node ID | Node Type | Change Type | Contracts | Guardrail Packs |
|---------|-----------|-------------|-----------|-----------------|
| ... | system/component/contract | new/modify/delete | ... | ... |
```

### Step 3: Map to Task Classes and Model Tiers
Using `flagship-foundry-work/configs/model-routing/default.json`, assign each work unit a task class:

| Task Type | Task Class | Model Tier |
|-----------|-----------|------------|
| Architecture decisions, risk analysis | `strategic_reasoning` | frontier_reasoner |
| Constraint interpretation, scope clarification | `constraint_interpretation` | frontier_reasoner |
| Code generation within bounded scope | `deterministic_transformation` | low_cost_executor |
| Schema/contract/config generation | `structured_generation` | low_cost_executor |
| Independent test validation | `verification` | balanced_reasoner |
| Root cause analysis | `diagnostics` | frontier_reasoner |
| Fix-memory and learning extraction | `learning` | balanced_reasoner |

### Step 4: Generate Work Order Tree

For each chunk, produce a work order following `flagship-foundry-work/schemas/agent-work-order.schema.json`:

```markdown
## Work Order: [work-order-id]
- **Lifecycle Stage**: [implement / verify / etc.]
- **Phase ID**: [kebab-case slug]
- **Task Class**: [from step 3]
- **Agent Role**: builder / verifier / systems-architect / etc.
- **Model Tier**: [from step 3]
- **File Scope**: [explicit list of files to create/modify]
- **Source Artifacts**: [intent packet, ADRs, schemas]
- **Constraints**: [guardrail pack rules that apply]
- **Acceptance Criteria**:
  - [ ] [criterion from intent packet]
- **Verification Plan**:
  - `pnpm exec nx run <project>:typecheck`
  - `pnpm exec nx run <project>:test`
- **Rollback Notes**: [how to undo]
- **Approval Required**: yes/no [for high-risk actions]
```

### Step 5: Attach Principle Cards

For each applicable principle from `flagship-foundry-work/ontology/principle-catalog.json`, attach to affected work orders:

**`principle:complexity-budgets`** — Apply to any work order touching data models or schemas:
- Anti-patterns to avoid: unbounded lists, deeply nested structures, implicit relationships
- Visual hints: flag data model diagrams with complexity score

**`principle:contract-first`** — Apply to any work order creating or modifying APIs/interfaces:
- Required: define interface/schema before implementation
- Anti-pattern: defining contracts after implementation

**`principle:observed-vs-declared-truth`** — Apply to any work order touching state or telemetry:
- Required: distinguish runtime observations from declared state
- Anti-pattern: treating cached/derived data as authoritative

### Step 6: Produce Chunked Task Summary

```markdown
# Scope Chunk Summary
- **Total Work Orders**: [n]
- **Estimated Phases**: [list phases in order]
- **Critical Path**: [sequence of dependent work orders]
- **Parallelizable**: [work orders that can run simultaneously]
- **Approval Gates**: [work orders requiring human approval]

## Work Order Sequence
1. [WO-001]: [title] → @[agent] ([task class]) [depends on: none]
2. [WO-002]: [title] → @[agent] ([task class]) [depends on: WO-001]
...

## First Work Order (Ready to Execute)
[Paste the first work order in full]
```

### Step 7: Update Continuity State
Use `continuity-writer` to update `current-task.json`:
- `lifecycleStage` → `plan`
- `currentPhase.status` → `done` (plan phase complete)
- `nextWorkOrders` → array of generated work order IDs
- `artifacts` → add intent packet path and work order tree path
