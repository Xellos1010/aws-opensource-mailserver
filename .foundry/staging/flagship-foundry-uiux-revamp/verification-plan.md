# Verification Plan

## Batch-level verification themes
1. **Orientation**
   - Can the operator identify workspace target, active run, blockers, and top quick actions immediately?

2. **Navigation**
   - Can the operator move from ecosystem view to module internals and evidence in a predictable path?

3. **Execution safety**
   - Can the user act without bypassing approvals or misreading runtime state?

4. **Interaction quality**
   - Do motion, feedback, and toggles clarify intent rather than obscure it?

5. **Accessibility**
   - Are keyboard, focus, reduced motion, and target-size requirements satisfied?

6. **Performance**
   - Does graph interaction remain responsive with overlays and compare mode enabled?

## Scenario tests
- Find the active run in under 10 seconds.
- Explain why a work order is blocked.
- Move from a graph node to pseudocode diff in 3 clicks.
- Start from an alert and reach the evidence bundle in 2 steps.
- Change layouts without losing selected context.
- Recover from a failed launch without losing plan/evidence context.

## Command-oriented verification
- `pnpm exec nx run cursor-companion:typecheck`
- `pnpm exec nx run cursor-companion:test`
- `pnpm exec nx run graph-viewer:build`
- `pnpm exec nx run flagship-foundry:typecheck`
- Manual keyboard navigation walkthrough
- Manual reduced-motion walkthrough
- Manual graph performance trace with overlays enabled
