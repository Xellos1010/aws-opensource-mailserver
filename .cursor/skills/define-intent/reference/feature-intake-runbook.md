# Feature Intake Reference
Source: flagship-foundry/runbooks/feature-intake.md

## Purpose
Turn intended capability into typed work orders without skipping contracts, risks, or acceptance criteria.

## Steps
1. **Restate outcome** — One sentence: what changes for the user or system when this ships?
2. **Enumerate impacted systems and contracts** — Which systems, components, schemas, and APIs are touched? What contracts change?
3. **Attach principle cards and guardrail packs** — Which principles apply? Which guardrail packs constrain the work?
4. **Define acceptance criteria and rollback** — What must be true for this to be considered done? How do we undo it?
5. **Create ecosystem and system planning work orders** — High-level decomposition with explicit agent roles and bounded scope
6. **Decompose into repo and verifier work orders** — File-scoped implementation tasks plus independent verification tasks
7. **Publish handoff envelope** — Continuity state, evidence references, open questions

## Gate: Definition of Ready
Before proceeding to plan/implement, confirm:
- [ ] Outcome stated in one sentence
- [ ] Impacted systems and contracts enumerated
- [ ] Principle cards and guardrail packs identified
- [ ] Acceptance criteria defined and testable
- [ ] Rollback plan documented
- [ ] Test outline present
