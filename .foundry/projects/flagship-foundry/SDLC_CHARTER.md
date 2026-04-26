# flagship-foundry SDLC Charter

Inherits from: [Root Charter](../../../.claude/CHARTER.md)

## Objective
Close Flagship Foundry gaps with ADR-gated milestone execution.

## Phase: discover (pending)

## Constraints
- ADR-gated work orders only.
- Contract authority: `flagship-foundry-work/schemas/continuity-state.schema.json`.
- Runtime instance authority: `.foundry/projects/flagship-foundry/current-task.json` (**ADR-011**).

## Risks
- Schema/instance drift across tools if mirror files are treated as authoritative.
- Lifecycle routing failures if bootstrap state is missing.
