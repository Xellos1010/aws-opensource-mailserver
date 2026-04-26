# Program Plan — Foundry UI/UX Revamp

## Strategy
Use a reusable UI/UX agent pipeline to derive a repo-grounded plan, then execute the revamp as bounded work orders that extend the current operator surface rather than replace it.

## Program milestones

### M0 — Grounding and intent
- Build the operator task corpus.
- Extract first-class objects and state-authority boundaries.
- Lock quick-action priorities and drill-down needs.
- Approve the bounded intent and non-goals.

### M1 — Architecture and ADR lock
- Approve the cockpit shell as the canonical desktop experience.
- Approve the view registry and state-authority separation.
- Approve the drill-down chain from ecosystem to evidence.
- Approve the motion/toggle/accessibility baseline.

### M2 — Contract and shell foundation
- Add view-registry, saved-layout, inspector-selection, quick-action, and chat-command session schemas.
- Re-compose the shell around a stable layout: top bar, left rail, center canvas, right inspector, bottom utility.
- Preserve current plan/import/run capabilities while improving discoverability.

### M3 — Visualization and workflow depth
- Upgrade graph interaction: focus path, compare, minimap, zoom/pan reset, overlays.
- Add inspector-driven drill-down to pseudocode, diff, work orders, run sessions, and evidence.
- Converge plan board and session board around shared object paths.

### M4 — Interaction quality and platform adaptation
- Add command palette, quick-action strips, and safe chat suggestions.
- Apply motion, loading, and feedback rules across the cockpit.
- Produce a mobile adaptation plan for iOS/Android triage surfaces.

### M5 — Verification, evidence, and learning
- Run scenario-based UX verification.
- Run accessibility and performance review.
- Bind telemetry, evidence, and learning records to the new surfaces.

## Reusable UI/UX pipeline
1. Intent analysis
2. Object-model extraction
3. View selection
4. Shell composition
5. Interaction and motion specification
6. Platform adaptation
7. Verification and evidence capture
8. Handoff and learning

## Key design postures
- Navigate by first-class objects, not menu taxonomy.
- Show declared state and observed state separately, but let operators move between them instantly.
- Use graph as overview/navigation, not as the only control surface.
- Keep quick actions visible and context-sensitive.
- Let the operator choose layouts without losing continuity.
- Treat evidence and verifier posture as first-class UX objects.
