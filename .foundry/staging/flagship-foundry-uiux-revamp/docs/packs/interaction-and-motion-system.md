# Interaction and Motion System

## Interaction rules
- Use a command palette for global actions.
- Use quick-action strips for the highest-frequency local tasks.
- Use peer view switches for Map / Board / Timeline / Diff.
- Use a single inspector pattern for selected objects.
- Use dockable/hideable panels without destroying context.
- Use breadcrumbs for drill-down; avoid modal traps.

## Toggle rules
Use toggles only for immediate binary settings, such as:
- live updates,
- follow selection,
- telemetry overlay,
- compact mode.

Do not use toggles for:
- compile,
- approve,
- launch,
- pause,
- stop.

Those remain explicit commands with visible state and evidence implications.

## Motion rules
- Card → detail / node → inspector: container transform
- Peer object browsing: lateral transition
- Top-level destination change: quick fade
- Loading: skeletons over blank spinners where structure matters
- Error/recovery: highlight the failed state and next valid action
- Reduced motion: no essential meaning may rely on animation alone

## Feedback states
- empty
- loading
- partially loaded
- success
- blocked
- warning
- error
- stale data / refresh available
