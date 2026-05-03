# State Authority Matrix

| Object | Declared or Observed | Authority | Owner | Primary Surface | Notes |
|---|---|---|---|---|---|
| Workspace Target | Declared | Typed operator artifact | Cursor Companion | Cockpit shell | Must be explicit before plan/run |
| Context Cart | Declared | Typed operator artifact | Cursor Companion | Cockpit shell | Reusable bounded context |
| Requirement Refinement Session | Declared | Typed operator artifact | Cursor Companion | Cockpit shell | Tracks DoR readiness |
| Visual Artifact | Declared | Typed operator artifact | Cursor Companion | Cockpit shell / projection | Saved diagrams and explainers |
| Plan / Work Orders | Declared | Plan and work-order contracts | Control plane | Plan board | Approval posture and dependency state |
| Pipeline Definition | Declared | Pipeline schema | Control plane | Cockpit shell | Design-time orchestration |
| Compilation Result | Declared | Compiler outputs | Control plane | Cockpit shell | Traceable output, not runtime |
| Run Session | Observed | Existing run control | Run control / policy | Session board | Live execution state |
| Verifier Status | Observed | Verifier output | Verifier | Session board / evidence drawer | Independent from builder |
| Evidence Bundle | Linked observed/declared | Evidence bundle schema | Verifier / docs-release | Evidence drawer | Links proof to criteria |
| Logs / Telemetry Ref | Observed | Telemetry systems | Adapters / run control | Bottom utility | Deep detail secondary to high-signal summaries |
