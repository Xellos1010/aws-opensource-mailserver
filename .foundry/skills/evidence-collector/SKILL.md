# Evidence Collector

Gather and structure verification evidence for phase gates and release decisions.

## Evidence Bundle Structure
```markdown
# Evidence Bundle: [phase-id]

## Metadata
- Phase: [lifecycle stage]
- Project: [project name]
- Branch: [active branch]
- Collected: [ISO 8601 timestamp]
- Collector: evidence-collector

## Test Evidence
| Suite | Pass | Fail | Skip | Coverage | Path |
|-------|------|------|------|----------|------|
| [suite name] | [n] | [n] | [n] | [%] | [path to results] |

## Build Evidence
| Target | Status | Size | Output Path |
|--------|--------|------|-------------|
| [target] | PASS/FAIL | [KB] | [path] |

## Code Quality Evidence
| Check | Status | Details |
|-------|--------|---------|
| TypeCheck | PASS/FAIL | [error count] |
| Lint | PASS/FAIL | [warning count] |
| Security | PASS/FAIL | [finding count] |

## Artifact Inventory
| Artifact Type | Path | Status |
|---------------|------|--------|
| [type] | [path] | exists/missing |

## Acceptance Criteria Evidence
| Criterion | Verdict | Evidence |
|-----------|---------|----------|
| [criterion text] | PASS/FAIL/UNKNOWN | [reference to evidence above] |

## Gaps
- [evidence that should exist but doesn't]
```

## Collection Protocol
1. Run verification commands from `nextCommandSet` in continuity state
2. Capture test results: look for Jest/Vitest output, coverage reports
3. Capture build results: sizes, output paths, exit codes
4. Scan for type errors: TypeScript diagnostics
5. Check artifact existence: verify all declared artifacts exist at their paths
6. Map evidence to acceptance criteria from `doneCriteria`
7. Identify gaps: evidence expected but not found

## Evidence Locations
Common places to find evidence:
- `coverage/` — Test coverage reports
- `dist/` — Build outputs
- `test-results/` — Test result files
- `.nx/cache/` — Nx computation cache (contains prior run results)
- Project `docs/` — Documentation artifacts
