# Define Intent — Interactive Pipeline

Transform a vague idea into a fully-defined intent packet ready for the plan and implement phases.

## When to Invoke
- User has a new feature idea or capability request
- User wants to define scope for a major change
- User says "I want to build X" or "what if we added Y"
- Resuming discovery work from interrupted session

## Output: Intent Packet
At the end of this pipeline, produce a single markdown document containing all sections below. Save to `docs/intent/intent-[slug]-[date].md`.

---

## Stage 1: Discover — Problem Statement

Ask the user to answer (or draft answers yourself from context):

1. **Problem**: What problem or gap exists today? Who experiences it?
2. **User/Stakeholder**: Who is this for? (end user, developer, operations, compliance)
3. **Outcome**: What does success look like in one sentence?
4. **Constraints**: What must NOT change? What boundaries must be respected?
5. **Risks**: What could go wrong? What is the blast radius if this fails?

**Output section**:
```markdown
## Problem Statement
- **Problem**: ...
- **Stakeholder**: ...
- **Success Outcome**: ...
- **Constraints**: ...
- **Known Risks**: ...
```

---

## Stage 2: Define — Scope and Acceptance Criteria

Based on the problem statement, define:

1. **In scope**: What will be built or changed?
2. **Out of scope / Non-goals**: What will NOT be done in this slice?
3. **Glossary**: 5-15 key terms that must be used consistently
4. **Acceptance criteria**: 3-10 testable statements in format "Given X, when Y, then Z"
5. **Rollback plan**: How to undo this if it causes issues

**Output section**:
```markdown
## Scope
- **In Scope**: ...
- **Non-Goals**: ...

## Glossary
| Term | Definition |
|------|-----------|
| ... | ... |

## Acceptance Criteria
- [ ] Given [context], when [action], then [outcome]
- [ ] ...

## Rollback Plan
...
```

---

## Stage 3: Visualize — C4 Diagrams

Use the `c4-diagram-generator` skill to produce:

1. **System Context Diagram** (C4 Level 1): What is the system, who uses it, what external systems does it interact with?
2. **Container Diagram** (C4 Level 2): What are the major runtime units (apps, services, databases, extensions)?

For each diagram, annotate:
- Trust boundaries (what crosses a security boundary?)
- Data flow direction
- External dependencies

Reference existing diagrams in `docs/diagrams/`.

**Output section**:
```markdown
## System Context Diagram
\`\`\`mermaid
C4Context
  title System Context: [System Name]
  Person(user, "User", "Description")
  System(system, "System Name", "Description")
  ...
\`\`\`

## Container Diagram
\`\`\`mermaid
C4Container
  title Container Diagram: [System Name]
  ...
\`\`\`
```

---

## Stage 4: Architect — Principles and Guardrails

Apply applicable principles and guardrail packs from the Flagship Foundry catalogs.

### Principles to Check
Reference `flagship-foundry-work/ontology/principle-catalog.json`. For each principle, determine if it applies:
- `principle:complexity-budgets` — Does this change increase data model complexity?
- `principle:contract-first` — Are we defining interfaces before implementation?
- `principle:observed-vs-declared-truth` — Are we distinguishing runtime observations from declared state?

**Output section**:
```markdown
## Applicable Principles
| Principle | Applies | How |
|-----------|---------|-----|
| complexity-budgets | yes/no | [explanation] |
| contract-first | yes/no | [explanation] |
| observed-vs-declared-truth | yes/no | [explanation] |
```

### Guardrail Packs to Attach
Reference `flagship-foundry-work/guardrails/`. Select applicable packs:
- `guardrail:typescript-core` — always for TypeScript changes
- `guardrail:chrome-extension-mv3` — for Chrome extension changes
- `guardrail:web-frontend` — for UI/React changes
- `guardrail:aws-serverless` — for cloud/serverless changes

**Output section**:
```markdown
## Guardrail Packs
- [ ] guardrail:typescript-core — [required checks from pack]
- [ ] guardrail:chrome-extension-mv3 — [required checks from pack]
```

---

## Stage 5: Handoff to Plan Phase

Once all stages are complete, produce the final summary:

```markdown
## Intent Packet Summary
- **Phase**: ready for `plan`
- **Primary Agent**: @orchestrator
- **Next Action**: invoke `scope-chunker` to decompose into work orders
- **Key Decisions Pending**: [list any open architectural questions]
- **Definition of Ready Met**: yes / no (if no, list what's missing)
```

Invoke `scope-chunker` with the complete intent packet as input.
