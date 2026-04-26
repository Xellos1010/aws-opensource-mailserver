# ADR-001: Select a cockpit shell as the canonical operator surface

## Status
approved

## Date
2026-04-10

## Context
The repo already treats Cursor Companion as the first write-capable surface while Foundry app and graph-viewer act as projection/read surfaces. The current operator surface also already contains typed artifacts and session/plan panels. The UI/UX problem is not missing primitives; it is missing a coherent shell that exposes them.

## Options considered
### Option A: Keep adding standalone panels to the current surface
**Pros**
- Minimal immediate change
- Low structural risk

**Cons**
- Continues menu/panel sprawl
- Makes it harder to build stable navigation and layouts

### Option B: Establish a cockpit shell around existing primitives
**Pros**
- Preserves current artifacts and flows
- Creates a stable spatial frame for navigation
- Supports peer views, inspector, evidence drawer, and saved layouts

**Cons**
- Requires a shell recomposition effort
- Exposes existing inconsistencies that must be cleaned up

## Decision
Adopt a cockpit shell as the canonical desktop operator surface in Cursor Companion. The shell uses a stable structure: top bar, left rail, center canvas, right inspector, and bottom utility drawer. Existing plan/import/run capabilities are preserved and re-composed inside this shell.

## Consequences
### Positive
- Faster orientation
- Cleaner quick-action surfacing
- Stable place for graph, plan, run, and evidence views

### Negative
- Some current panel behavior must be refactored
- More explicit state modeling is required

### Risks
- Half-adoption could produce duplicate navigation paths unless old entry points are retired carefully.
