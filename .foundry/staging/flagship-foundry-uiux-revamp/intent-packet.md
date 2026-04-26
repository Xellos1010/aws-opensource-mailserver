# Intent Packet — Foundry UI/UX Revamp

## Objective
Turn the current Cursor Companion / Foundry environment into an extension-first, graph-native SDLC cockpit that lets an operator:
- orient quickly,
- move between ecosystem, plan, run, and evidence views without menu hunting,
- compose or invoke pipelines from context,
- inspect architecture, pseudocode, diffs, work orders, and evidence along a stable drill-down chain,
- and adapt the same object model to web/desktop plus mobile triage surfaces.

## Bounded intent
This packet is not a greenfield product shell. It extends the current Foundry operator surfaces, current work-order/evidence/continuity model, and current graph/viewer capability into a more coherent UI/UX system.

## In scope
- Specialized UI/UX agent personalities and skills.
- Knowledge-base blueprint for UI/UX diagnosis and design.
- Architecture packet and ADR set.
- Screen map, navigation contract, drill-down contract, motion/accessibility baseline.
- Machine-readable work-order batch and evidence bundle model.
- Import-friendly manifest and artifact inventory.

## Out of scope
- Replacing the existing run-control authority.
- Making graph-viewer a second write-capable editor.
- Shipping multi-tenant auth, collaboration, or billing-grade analytics in this packet.
- Editing canonical personas, skills, or runbooks inline.
- Mobile-first parity with the full desktop cockpit.

## Users and stakeholders
- Primary operator: platform / engineering operator working inside Cursor Companion and Foundry.
- Secondary stakeholders: systems architect, verifier, security reviewer, performance reviewer, docs/release owner.
- Governing authority: the human operator remains authoritative for intent, approvals, and phase transitions.

## Desired capability outcomes
1. **Orientation** — an operator immediately sees workspace, current state, alerts, quick actions, and active work.
2. **Navigation** — an operator can move from ecosystem to code/evidence in a stable, predictable path.
3. **Execution clarity** — an operator can see what is declared, what is approved, what is running, what is blocked, and what proof exists.
4. **Interaction quality** — motion, toggles, loading states, and transitions improve comprehension instead of adding noise.
5. **Platform fit** — desktop is the full cockpit; mobile is triage, approval, monitoring, and search.
6. **Evidence discipline** — every major UX claim can be backed by repo grounding, standard guidance, or release verification.

## Success metrics
- Time to active run: < 10 seconds from opening the cockpit.
- Time from graph node to relevant diff or evidence: ≤ 3 interactions.
- Visibility of blockers, approvals, and current execution state on one path.
- Zero authority drift between declared artifacts and observed runtime state.
- Desktop/mobile capability split is explicit and enforced.
