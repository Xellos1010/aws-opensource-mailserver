# Architecture Packet — Foundry UI/UX Revamp

## Objective
Evolve the current Cursor Companion / Foundry ecosystem into an operator cockpit that is faster to navigate, easier to reason about, and safer to act from.

## Repo-grounded baseline
The repo already establishes:
- Cursor Companion as the canonical write-capable first surface.
- Foundry app and graph-viewer as projection/read surfaces.
- Operator artifacts such as workspace target, context cart, refinement session, visual artifact, planning board, provider posture, and session board.
- A graph/retrieval/pipeline architecture that already treats graph and vector systems as derived projections rather than canonical authority.
- A work-order/evidence/continuity posture where execution must respect approvals and independent verification.

## Architecture decisions summary
1. **Canonical desktop shell**
   - Cursor Companion becomes the cockpit shell for write actions.
   - Foundry app / graph-viewer remain read/projection surfaces.

2. **First-class object navigation**
   - Primary objects: workspace target, context cart, refinement session, visual artifact, plan, pipeline, compilation result, work order, run session, verifier posture, evidence bundle.
   - Navigation always follows objects and relationships, never arbitrary menu trees.

3. **Multi-view registry**
   - The same object set is rendered across peer views:
     - Map
     - Board
     - Timeline
     - Diff
     - Inspector
     - Evidence drawer
     - Chat
   - The user switches view without changing the underlying object set.

4. **Stable drill-down chain**
   - ecosystem → subsystem → module → pseudocode → diff → work order → run → evidence

5. **Shell layout**
   - Top bar: workspace, search/command palette, create feature, approvals, alerts, profile
   - Left rail: home, context, architecture, plan, runs, evidence, settings
   - Center canvas: map/board/timeline/diff peer views
   - Right inspector: selected object, state, valid actions, linked artifacts
   - Bottom utility: logs, evidence, continuity, chat, agent suggestions

6. **State authority**
   - Declared artifacts remain typed, versioned state.
   - Observed runtime state comes from existing run-control and projection services.
   - The UX must show the separation instead of hiding it.

7. **Execution safety**
   - Compile, approve, launch, pause, resume, and stop flow through policy and existing run control.
   - No freeform execution path is introduced by the UI revamp.

## Component model
- **Cockpit shell**
- **Command palette + quick actions**
- **Panel manager**
- **Graph interaction layer**
- **Inspector + drill-down tabs**
- **Plan/session convergence layer**
- **Evidence drawer**
- **Chat suggestion layer**
- **Saved layouts**
- **Mobile adaptation layer**

## Why this architecture
The repo already contains the right ingredients. The missing piece is a coherent operating model that exposes them as a single cockpit instead of a collection of adjacent utilities.
