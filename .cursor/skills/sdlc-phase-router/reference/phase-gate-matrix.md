# Phase Gate Matrix — Flagship Foundry 11-Phase Lifecycle

| Phase | Entry Criteria (DoR) | Primary Agent | Required Outputs | Exit Criteria (DoD) |
|-------|---------------------|---------------|-----------------|---------------------|
| **discover** | Problem statement exists | context-curator | Stakeholder map, constraint list, risk register | Problem is bounded, stakeholders identified, risks cataloged |
| **define** | Discovery complete | systems-architect | Acceptance criteria, non-goals, scope boundary, glossary | Acceptance criteria testable, scope approved by human |
| **visualize** | Scope defined | systems-architect | C4 system context diagram, container diagram | Diagrams reviewed, trust boundaries marked |
| **architect** | Visualization complete | systems-architect | ADRs, contracts, schemas, decomposition plan | Architecture approved, contracts machine-readable |
| **plan** | Architecture approved | orchestrator | Task tree, implementation slices, rollout path | Tasks bounded, each slice independently verifiable |
| **implement** | Plan approved, DoR met per slice | builder | Code, config, tests, build passing | All acceptance criteria met, tests passing, scope respected |
| **verify** | Implementation claims complete | verifier | Verification report, evidence bundle | PASS verdict or actionable FAIL with evidence |
| **release** | Verification PASS | docs-release-agent | Release notes, handoff doc, deployment guide | Artifacts packaged, rollback rehearsed, release gate green |
| **operate** | Released to production | performance-reviewer | Baseline metrics, monitoring confirmation | Telemetry flowing, alerts configured, runbooks current |
| **diagnose** | Incident or anomaly detected | verifier + security-reviewer | Root cause analysis, evidence timeline | Root cause identified, remediation plan proposed |
| **improve** | Diagnosis complete or sprint end | docs-release-agent | Learning record, continuity patch, standard updates | Learnings recorded, standards updated, continuity current |
