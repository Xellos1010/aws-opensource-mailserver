# ADR-003: Adopt an explicit operator drill-down chain

## Status
approved

## Date
2026-04-10

## Context
The user needs to move from ecosystem overview to architecture, pseudocode, diffs, work orders, sessions, and evidence quickly and predictably. Current navigation does not expose this path clearly enough.

## Options considered
### Option A: Let each feature invent its own drill-down path
**Pros**
- Local flexibility

**Cons**
- Inconsistent user experience
- Hard to document or verify

### Option B: Standardize one operator drill-down chain
**Pros**
- Predictable
- Easy to teach and verify
- Supports inspector and breadcrumb patterns

**Cons**
- Some edge cases need extensions

## Decision
Adopt the drill-down chain:
ecosystem → subsystem → module → pseudocode → diff → work order → run → evidence

## Consequences
### Positive
- Faster deep inspection
- Better state comprehension
- Lower menu hunting

### Negative
- Existing surfaces may need to expose new links and tabs

### Risks
- If metadata between steps is incomplete, the chain can break. This is mitigated by typed links and evidence refs.
