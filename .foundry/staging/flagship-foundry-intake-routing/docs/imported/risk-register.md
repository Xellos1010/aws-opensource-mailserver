# Risk Register

| ID | Risk | Severity | Likelihood | Mitigation | Owner Phase |
|---|---|---|---|---|---|
| R1 | Composer duplicates existing Foundry orchestration instead of extending it, creating a second source of truth. | High | Medium | Reuse current work-order, lifecycle, and run-control contracts; require ADR for any new canonical artifact. | architect |
| R2 | Dashboard execution bypasses approval, guardrails, or verifier independence. | Critical | Medium | Preserve approval boundaries in the execution handoff; require explicit policy checks before launch. | architect |
| R3 | “Building block” semantics remain ambiguous, causing unstable scope and design churn. | High | High | Resolve open questions on what counts as a building block: persona, skill, agent role, runbook phase, or full work-order template. | discover |
| R4 | Composition metadata and observed runtime state become conflated, breaking traceability. | High | Medium | Separate declared composition artifacts from run state and evidence artifacts. | architect |
| R5 | Existing operator surfaces fragment, leading to duplicated UI across Cursor Companion and Foundry app. | Medium | High | Select a canonical first surface in an ADR and define any secondary surfaces as projections. | visualize/architect |
| R6 | Environment parity gaps prevent consistent reuse of repo-native skills and personas across Cursor, Codex, and Claude flows. | Medium | High | Treat parity and registry projection as part of the architecture scope; validate against existing parity gap findings. | define |
| R7 | Composed pipelines overreach into implementation detail before system boundaries and contracts are settled. | Medium | Medium | Keep this workspace pre-build only; defer contracts and work-order tree generation to Architecture Studio. | define |
| R8 | Dashboard-triggered agent execution increases security exposure if auth, RBAC, and trust boundaries are undefined. | Critical | Medium | Require trust-boundary review and approval-boundary ADR before implementation. | architect |
| R9 | Visual pipeline UX becomes too complex for operators and obscures actual work-order dependencies. | Medium | Medium | Start with minimal sequence/dependency/approval visualization before advanced graph behaviors. | visualize |
| R10 | Rollback is unsafe if composed artifacts are tightly coupled to current plan/run state. | High | Low | Feature-flag the capability and define reversible state transitions before release. | architect/release |
