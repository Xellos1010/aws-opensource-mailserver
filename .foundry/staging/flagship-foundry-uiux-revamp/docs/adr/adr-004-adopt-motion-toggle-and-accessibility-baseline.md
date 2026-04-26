# ADR-004: Adopt a motion, toggle, and accessibility baseline

## Status
approved

## Date
2026-04-10

## Context
The UI revamp must feel intuitive and engaging without using animation or toggles in misleading ways. It also must meet current accessibility expectations.

## Options considered
### Option A: Leave motion and control semantics to individual feature implementations
**Pros**
- Faster short-term implementation

**Cons**
- Inconsistent behavior
- Accessibility drift
- Harder cross-platform adaptation

### Option B: Lock a baseline for motion, toggles, feedback states, and accessibility
**Pros**
- Predictable interaction quality
- Better platform fit
- Clear verify/release gate

**Cons**
- Requires design-system governance work

## Decision
Adopt a baseline where:
- toggles are used only for immediate binary settings,
- consequential workflow actions remain buttons or command actions,
- motion explains relationship and state change,
- reduced-motion support is required,
- accessibility is a release gate rather than a cleanup task.

## Consequences
### Positive
- Better interaction clarity
- Less accidental misuse of controls
- Easier cross-platform consistency

### Negative
- Some existing controls may need redesign

### Risks
- Incomplete adoption would create mixed interaction metaphors. This is mitigated by design-system review and verification gates.
