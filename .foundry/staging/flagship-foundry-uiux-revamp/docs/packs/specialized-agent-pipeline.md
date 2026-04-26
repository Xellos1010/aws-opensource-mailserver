# Specialized UI/UX Agent Pipeline

## Purpose
This pipeline diagnoses and designs UI/UX requirements for:
- a brand-new system setup,
- a new feature request,
- or an existing system that needs a UI/UX upgrade.

## Pipeline stages
1. **Intent analysis**
   - What is the operator trying to accomplish?
   - What decisions must they make quickly?
   - What is the failure cost if they miss state or context?

2. **Object-model extraction**
   - What are the first-class nouns?
   - Which are declared artifacts and which are observed runtime state?

3. **View selection**
   - Which questions need map, board, timeline, diff, inspector, evidence, or chat?

4. **Shell composition**
   - Which actions belong in top bar, rail, canvas, inspector, and utility drawer?

5. **Interaction and motion**
   - What should be a toggle vs button vs command?
   - Which transitions clarify structure and state?

6. **Platform adaptation**
   - What remains desktop-only?
   - What is safe and useful on iOS/Android?

7. **Verification and evidence**
   - Can the operator reach the right object, understand state, act safely, and recover?

8. **Learning loop**
   - What telemetry, evidence, and fix-memory should be captured for future iterations?

## Agent lineup
- UX Orchestrator
- UI Intent Analyst
- Information Architecture Architect
- Visualization Systems Architect
- Interaction & Motion Designer
- Design System Governor
- Accessibility & Platform Reviewer
- Mobile Surface Adapter
- Workflow Telemetry Curator
- UX Verification Judge

See `machine/agent-pack.json` and `machine/skill-pack.json` for machine-readable versions.
