# Risk Register

| ID | Risk | Severity | Likelihood | Mitigation | Owner Phase |
|---|---|---|---|---|---|
| R1 | UI revamp creates a second source of truth separate from current work-order/evidence/continuity authority. | Critical | Medium | Keep Cursor Companion as canonical write surface and graph/viewer as read-only projections. | architect |
| R2 | Quick actions or chat suggestions bypass approvals, guardrails, or verifier independence. | Critical | Medium | Command palette and chat can prepare actions but must route through policy and run control. | architect / verify |
| R3 | Building-block semantics remain vague, so the UI cannot decide what is visualized or composed. | High | High | Lock first-class objects and view registry early. | define |
| R4 | Declared composition artifacts and observed runtime state get conflated in the same cards or panels. | High | Medium | Use a state-authority matrix and explicit labels in the shell. | architect |
| R5 | Menu sprawl is replaced by view sprawl. | High | Medium | Keep a fixed shell with peer views and saved layouts; avoid one-off surface fragments. | visualize |
| R6 | Graph UX becomes visually rich but operationally weak. | Medium | Medium | Make graph a navigation substrate with overlays, not a decorative diagram. | implement |
| R7 | Desktop and mobile are forced into false parity, reducing usability on both. | Medium | High | Use platform adaptation planning; mobile = triage/approval/monitor/search, desktop = full cockpit. | architect |
| R8 | Motion adds polish without comprehension, or violates reduced-motion expectations. | Medium | Medium | Restrict motion to explanatory transitions and ship reduced-motion behavior from the start. | architect / verify |
| R9 | Accessibility becomes a cleanup task instead of a release gate. | High | Medium | Put accessibility and scenario verification in WO-UX-014 and ADR-004. | verify |
| R10 | Existing operator-surface implementation gets rewritten instead of extended. | Medium | Medium | Re-compose current artifacts and panels first; do not discard existing plan/import/run capabilities. | implement |
