# ADR-002: Separate the view registry from runtime state

## Status
approved

## Date
2026-04-10

## Context
The repo already distinguishes declared artifacts from observed runtime state. The UI revamp needs a view system that can switch between map, board, timeline, diff, inspector, evidence, and chat without changing the source-of-truth model.

## Options considered
### Option A: Bind each view directly to its own bespoke state
**Pros**
- Fast to prototype

**Cons**
- Duplicates logic
- Encourages authority drift
- Hard to keep views consistent

### Option B: Use a view registry that maps shared objects to peer views
**Pros**
- Keeps navigation object-based
- Makes it easier to support saved layouts and drill-down
- Preserves declared-vs-observed boundaries

**Cons**
- Requires more upfront modeling

## Decision
Use a typed view registry that maps first-class objects and operator questions to peer views. Runtime projections remain separate from the registry.

## Consequences
### Positive
- Map/Board/Timeline/Diff become alternate views of shared objects
- Easier saved layouts
- Less fragmentation

### Negative
- Requires schema work
- Needs careful inspector and selection modeling

### Risks
- Poor object modeling would make the registry confusing. That is mitigated by WO-UX-002.
