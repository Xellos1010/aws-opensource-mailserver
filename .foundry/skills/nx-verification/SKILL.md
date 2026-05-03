# Nx Verification

Run Nx verification pipelines and produce structured results.

## Standard Verification Pipeline

### 1. TypeScript Type Checking
```bash
npx nx typecheck <project>
```
Expected: Exit code 0, no type errors.

### 2. Unit Tests
```bash
npx nx test <project>
```
Expected: All tests pass, coverage meets threshold.

### 3. Build
```bash
npx nx build <project> --configuration=production
```
Expected: Exit code 0, no build errors, output in `dist/`.

### 4. E2E Tests (when available)
```bash
npx nx e2e <project>-e2e
```
Expected: All E2E scenarios pass.

## Affected Pipeline
When changes span multiple projects, use affected:
```bash
npx nx affected -t typecheck test build
```

## Chrome Extension Specific
For Chrome extension projects, add:
```bash
npx nx validate-dist <project>
```
Validates the built extension manifest, file sizes, and CSP compliance.

## Result Format
Produce a verification report:
```markdown
## Verification Results: <project>
- **TypeCheck**: PASS/FAIL [details]
- **Tests**: PASS/FAIL [X passed, Y failed, Z skipped]
- **Build**: PASS/FAIL [output size: X KB]
- **E2E**: PASS/FAIL/SKIPPED [details]
- **Overall**: PASS/FAIL
- **Timestamp**: [ISO 8601]
- **Branch**: [current branch]
- **Commands Run**: [list of commands executed]
```

## Error Handling
- If a command fails, capture the full error output
- Do not retry automatically — report the failure
- If a project target doesn't exist (e.g., no `e2e` target), report as SKIPPED, not FAIL
- If `node_modules` is missing, run `npm install` first, then retry
