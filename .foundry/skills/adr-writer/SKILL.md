# ADR Writer

Create Architecture Decision Records that capture the reasoning behind structural decisions.

## ADR Template

```markdown
# ADR-[NNN]: [Short Decision Title]

## Status
[proposed | accepted | deprecated | superseded by ADR-NNN]

## Date
[ISO 8601 date]

## Context
[What is the issue or situation that motivates this decision? Include relevant
constraints, requirements, and forces at play. Reference specific files,
schemas, or prior ADRs that inform this context.]

## Options Considered

### Option A: [Name]
**Description**: [How this approach works]
**Pros**:
- [advantage 1]
- [advantage 2]
**Cons**:
- [disadvantage 1]
- [disadvantage 2]

### Option B: [Name]
**Description**: [How this approach works]
**Pros**:
- [advantage 1]
- [advantage 2]
**Cons**:
- [disadvantage 1]
- [disadvantage 2]

## Decision
[What is the change we're proposing or the decision we've made? Why did we
choose this option over the others? Reference specific tradeoffs.]

## Consequences

### Positive
- [What becomes easier or better]

### Negative
- [What becomes harder or worse]

### Risks
- [What could go wrong and how we mitigate it]

## References
- [File paths, schema references, prior ADRs, external resources]
```

## Naming Convention
- Store ADRs in the project's `docs/adr/` directory
- Name files: `adr-NNN-short-kebab-title.md` (e.g., `adr-001-use-event-driven-messaging.md`)
- Number sequentially within the project

## Quality Checklist
- [ ] Context explains WHY, not just WHAT
- [ ] At least two options are considered
- [ ] Pros and cons are specific, not generic
- [ ] Decision rationale references the tradeoffs
- [ ] Consequences include both positive and negative
- [ ] All file references use actual paths that exist
- [ ] Status is set correctly (usually `proposed` for new ADRs)
