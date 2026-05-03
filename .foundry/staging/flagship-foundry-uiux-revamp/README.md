# Foundry UI/UX Revamp Packet

## Bundle
- **Name**: Foundry UI/UX Revamp Packet
- **Date**: 2026-04-10
- **Phase ID**: flagship-foundry-ui-ux-revamp-plan-2026-04-10
- **Purpose**: A repo-grounded, import-friendly planning and architecture packet for turning the current Cursor Companion / Foundry surfaces into a graph-native SDLC cockpit with better navigation, drill-down, visualization, quick actions, chat orchestration, evidence visibility, and platform adaptation.

## What is inside
- Human-readable change request, intent packet, plan, architecture packet, screen map, risk register, verification plan, and evidence bundle.
- Four ADRs that lock the write-surface, view-registry, drill-down, and motion/accessibility decisions.
- Mermaid diagrams for context, container, drill-down, dependency graph, and state authority.
- Specialized UI/UX agent pack and skill pack in both human-readable and machine-readable forms.
- Knowledge-base blueprint and state authority matrix.
- Import-friendly `work-order-batch.json`, `artifact-manifest.json`, and `foundry-import-manifest.json`.
- A zipped bundle for handoff or downstream import.

## Recommended use
1. Review `intent-packet.md`, `plan.md`, and `architecture-packet.md`.
2. ADR-001 through ADR-004 are approved for implementation.
3. Import or copy the work-order batch into the next implementation workspace and start with WO-UX-006.
4. Use `verification-plan.md` and `evidence/evidence-bundle.md` as release gates.
5. Extend the machine files in `machine/` when you want to automate routing or import.

## Key repo-grounded constraints
- Cursor Companion remains the canonical write-capable first surface.
- Foundry app and graph-viewer remain read/projection surfaces.
- Declared artifacts stay separate from observed run state.
- Execution still flows through approval policy and existing run control.
- Evidence, verifier posture, continuity refs, and telemetry must be visible from the UX, not hidden in implementation details.

See `references.md` for the source set used to ground this packet.
