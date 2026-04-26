# ADR-002: Store compositions and pipelines as schema-backed declarative artifacts

## Status
Proposed

## Date
2026-03-28

## Context
The request requires new orchestration configurations to be persisted as first-class Foundry artifacts with traceability to repo-native source building blocks. The design must preserve explicit contracts, source-of-truth discipline, and separation between declared state and observed runtime state.

## Options considered

### Option A: Schema-backed declarative artifacts in Foundry state authority
**Pros**
- Clear machine-readable contracts.
- Strong traceability and validation.
- Clean separation from runtime and repo-native source assets.

**Cons**
- Requires new artifact schemas and repository conventions.

### Option B: Store compositions inside runbooks or markdown documents
**Pros**
- Human-readable.
- Low initial tooling overhead.

**Cons**
- Weak validation and interoperability.
- Harder compile path and provenance enforcement.

### Option C: Mutate personas/skills/templates directly in repo source files
**Pros**
- No new artifact type.

**Cons**
- Violates source-authority separation.
- Blurs reusable source assets with operator-specific derived configurations.

## Decision
Choose **Option A**. Introduce schema-backed artifacts for the building-block library projection, composed agent configurations, orchestration pipeline definitions, compilation results, and execution session projections.

## Consequences
### Positive
- Contract-first and machine-readable.
- Enables compile, approval, audit, and rollback flows.
- Preserves repo-native personas and skills as immutable authorities.

### Negative
- Adds artifact management overhead.
- Requires a projection model for surfacing these artifacts in multiple UI surfaces.

### Risks
- Artifact sprawl. Mitigate by keeping a narrow set of artifact types and explicit lifecycle ownership.

## References
- `intent-packet.md`
- `architecture-packet.md`
- `contracts/*.schema.json`
