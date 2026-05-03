# Platform Adaptation Plan

## Shared object model across all platforms
- Workspace target
- Plan
- Work order
- Run session
- Evidence bundle
- Alert
- Search result
- Quick action

## Desktop / Web
Use the full cockpit. Dense information, keyboard shortcuts, multi-pane layouts, graph interaction, compare mode, inspector, evidence drawer, and saved layouts all belong here.

## iOS
Prioritize:
- approval actions,
- active run monitoring,
- alerts,
- search,
- quick evidence summaries,
- lightweight artifact drill-down.

Use platform-native navigation, fewer simultaneous panels, and direct actions with clear feedback.

## Android
Same object model, Material navigation and motion patterns, and strong triage-first flows. Keep topology and evidence review readable, but avoid full graph-authoring ambition in v1.

## Non-goal
Do not build a shrunk-down desktop cockpit for mobile.
