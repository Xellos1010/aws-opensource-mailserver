# Open Questions

The following missing fields block a deterministic implementation-ready artifact:

1. **Canonical operator surface**
   - Should the dashboard live in `apps/cursor-companion`, inside the Foundry app, in the graph viewer, or as a split-surface model?

2. **Building-block definition**
   - What exact repo artifacts count as reusable building blocks: personas, skills, agent roles, runbook phases, work-order templates, or all of the above?

3. **Composition persistence model**
   - Where should a composed agent configuration be stored and governed: state artifact, schema-backed document, runbook extension, or another contract type?

4. **Execution boundary**
   - Does “execute the work order agents” mean launch existing approved work orders only, generate new work orders from a composed pipeline, or both?

5. **Approval model**
   - Which actions require explicit human approval from the dashboard: save composition, approve pipeline, start run, resume run, stop run, re-run failed slice?

6. **Runtime scope**
   - Should the first release support simulation only, local execution only, existing adapters only, or a specific runtime adapter set?

7. **Identity and access**
   - Is this capability single-operator/local-only for the first slice, or must it support authentication / team access controls from day one?

8. **Observability scope**
   - What minimum run telemetry must the dashboard show beyond status: logs, evidence bundle links, blast radius, approvals, verifier status, cost/model usage?

9. **Reuse constraints**
   - Are operators allowed to alter existing repo-native personas/skills in-place from the dashboard, or only reference them when composing new configurations?

10. **Success boundary for v1**
    - Is the first deliverable a composition library only, a visual pipeline editor only, or a full compose-and-execute dashboard?
