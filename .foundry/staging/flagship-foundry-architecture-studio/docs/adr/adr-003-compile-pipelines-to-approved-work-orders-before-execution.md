# ADR-003: Compile pipelines to approved work orders before execution

## Status
Proposed

## Date
2026-03-28

## Context
The user wants to execute work-order agents from a dashboard, but the intent packet and risk register explicitly require preservation of approval boundaries, verifier independence, and continuity/evidence posture. Direct free-form execution from a visual pipeline would bypass existing Foundry controls.

## Options considered

### Option A: Compile orchestration pipelines into draft work orders / approved plans, then launch only approved artifacts
**Pros**
- Reuses existing lifecycle, approval, continuity, and evidence controls.
- Prevents the dashboard from becoming an ungoverned runtime launcher.
- Maintains traceability from composition to execution.

**Cons**
- Adds a compile step before launch.
- Requires pipeline-to-work-order mapping rules.

### Option B: Execute pipeline nodes directly from the dashboard
**Pros**
- Fast and flexible.
- Lower initial compile overhead.

**Cons**
- Weakens approval gates.
- Risks bypassing evidence and verifier posture.
- Introduces a second execution authority.

### Option C: Support only plan creation and no execution
**Pros**
- Lowest security exposure.
- Simplifies the first slice.

**Cons**
- Does not satisfy the requested outcome.

## Decision
Choose **Option A**. The composer can generate draft work orders or draft plans from a pipeline, but execution requests are only valid against approved work orders, approved plans, or previously approved execution artifacts.

## Consequences
### Positive
- Keeps execution inside Foundry’s existing governance model.
- Preserves evidence targeting and continuity references.
- Aligns the new dashboard with existing run-control semantics.

### Negative
- More visible workflow steps for operators.
- Requires good UX to make compile/approve/launch understandable.

### Risks
- Operators may perceive extra friction. Mitigate with explicit compile previews, approval summaries, and run-state projections.

## References
- `intent-packet.md`
- `risk-register.md`
- `trust-boundary.mmd`
- `system-sequence.mmd`
