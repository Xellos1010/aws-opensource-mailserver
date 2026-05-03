# C4 Diagram Generator

Generate C4 architecture diagrams using Mermaid syntax. Reference diagrams are in the project's `docs/diagrams/` directory.

## C4 Level 1 — System Context

Shows the system and its relationships to users and external systems.

```mermaid
C4Context
  title System Context: [System Name]

  Person(userAlias, "User Role", "Description of user")
  System(systemAlias, "System Name", "What it does")
  System_Ext(extAlias, "External System", "What it does")

  Rel(userAlias, systemAlias, "Uses", "HTTPS")
  Rel(systemAlias, extAlias, "Calls", "REST/JSON")

  UpdateLayoutConfig($c4ShapeInRow="3", $c4BoundaryInRow="1")
```

**Required annotations:**
- Every `Person` entry = a real human stakeholder
- Every `System_Ext` = an external dependency (3rd party, platform API)
- `Rel` labels must include protocol where known

---

## C4 Level 2 — Container Diagram

Shows the major runtime units inside the system boundary.

```mermaid
C4Container
  title Container: [System Name]

  Person(userAlias, "User Role", "")

  System_Boundary(sysBoundary, "System Name") {
    Container(app, "App Name", "Technology", "What it does")
    Container(worker, "Background Worker", "Service Worker", "What it does")
    ContainerDb(store, "Storage", "chrome.storage / IndexedDB", "Persisted state")
  }

  System_Ext(extAlias, "External API", "")

  Rel(userAlias, app, "Uses", "UI interaction")
  Rel(app, worker, "Sends messages", "chrome.runtime")
  Rel(worker, store, "Reads/writes", "")
  Rel(worker, extAlias, "Calls", "HTTPS/REST")
```

**Required annotations:**
- Technology stack in each container
- Communication protocols on every `Rel`
- Storage type and what data category (public/internal/sensitive/regulated)

---

## C4 Level 3 — Component Diagram

Shows modules within a single container.

```mermaid
C4Component
  title Components: [Container Name]

  Container_Boundary(containerBoundary, "Container Name") {
    Component(comp1, "Component 1", "Module", "Responsibility")
    Component(comp2, "Component 2", "Module", "Responsibility")
    Component(comp3, "Component 3", "Module", "Responsibility")
  }

  Rel(comp1, comp2, "Calls", "")
  Rel(comp2, comp3, "Emits events to", "")
```

---

## C4 Level 4 — Dynamic / Sequence Diagram

Shows execution flow for a specific scenario.

```mermaid
sequenceDiagram
  participant Human
  participant Orchestrator
  participant Builder
  participant Verifier

  Human->>Orchestrator: Describes intent
  Orchestrator->>Builder: Work order (bounded scope)
  Builder->>Builder: Implements changes
  Builder->>Orchestrator: Reports completion
  Orchestrator->>Verifier: Validate independently
  Verifier->>Orchestrator: PASS / FAIL with evidence
  Orchestrator->>Human: Phase complete / blockers
```

---

## Trust Boundary Annotations

Add trust boundary overlays to container and context diagrams:

```mermaid
C4Container
  title Container with Trust Boundaries

  Boundary(b1, "Browser Sandbox (Extension Origin)") {
    Container(popup, "Popup UI", "React/MV3", "")
    Container(sidepanel, "Side Panel", "React/MV3", "")
  }

  Boundary(b2, "Service Worker Context") {
    Container(sw, "Service Worker", "MV3", "")
  }

  Boundary(b3, "External Network") {
    System_Ext(api, "Platform API", "")
  }

  Rel(popup, sw, "Messages", "chrome.runtime — validated")
  Rel(sw, api, "Fetches", "HTTPS — auth required")
```

**Trust boundary rules:**
- Every cross-boundary `Rel` must label auth/validation mechanism
- Boundaries must align with Chrome extension privilege scopes where applicable

---

## Diagram Storage
Save diagrams to: `docs/diagrams/[system]-[level]-[date].mmd`

---

## Output Section for Intent Packet

When producing diagrams as part of `define-intent`, format output as:

```markdown
## Architecture Diagrams

### System Context (C4 L1)
\`\`\`mermaid
[diagram here]
\`\`\`
**Saved**: `docs/diagrams/[system]-context-[date].mmd`

### Container Diagram (C4 L2)
\`\`\`mermaid
[diagram here]
\`\`\`
**Saved**: `docs/diagrams/[system]-containers-[date].mmd`
```
