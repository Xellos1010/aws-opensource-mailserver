# ADR-001: Select Cursor Companion as the canonical write-capable operator surface

## Status
Proposed

## Date
2026-03-28

## Context
The intent packet requires a dashboard/composer surface for building-block composition, pipeline design, and approved run execution. The repo baseline already positions the Cursor Companion as the first operator surface with import, plan visibility, approval, and run-control behaviors. The risk register also identifies surface fragmentation as a design risk.

## Options considered

### Option A: Use Cursor Companion as the canonical write surface
**Pros**
- Extends the repo’s existing operator cockpit rather than creating another control authority.
- Keeps composition close to current approve/start/pause/resume/stop flows.
- Minimizes UX fragmentation for the first slice.

**Cons**
- Couples initial composition UX to editor-adjacent workflows.
- Requires good projection paths for non-editor visualization surfaces.

### Option B: Make the Foundry app the only dashboard surface
**Pros**
- Keeps a web-first separation between design and editing.
- Could be easier for broader future team access.

**Cons**
- Diverges from the repo’s stated direction to start with the Cursor Companion and terminal adapters.
- Would duplicate existing run-control affordances already present in the companion.

### Option C: Multi-master split surface from day one
**Pros**
- Maximizes flexibility.
- Lets graph viewer and companion both edit the same assets.

**Cons**
- Highest drift risk.
- Increases complexity around locking, ownership, and approval UX.

## Decision
Choose **Option A**. The Cursor Companion becomes the canonical write-capable surface for composing, compiling, approving, and launching orchestration artifacts. The Foundry app and graph viewer consume the same declared state as read/projection surfaces.

## Consequences
### Positive
- Preserves a single operational cockpit.
- Aligns with current Foundry direction and operator expectations.
- Lowers first-slice UX and authority complexity.

### Negative
- Requires explicit projection APIs so the graph viewer and Foundry app can remain useful without becoming secondary editors.

### Risks
- Overloading the companion UI. Mitigate by keeping graph-heavy review in projection surfaces and write-heavy actions in the companion.

## References
- `intent-packet.md`
- `risk-register.md`
- `architecture-packet.md`
