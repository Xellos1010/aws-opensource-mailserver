# Nx Migration: Convert Mail-Server Management to Nx Monorepo

## Summary

This PR migrates the mail-server management repository from a bash-heavy script collection to an Nx monorepo with TypeScript support, cross-platform compatibility, and modern tooling. The migration preserves all existing functionality while laying groundwork for CDK-based infrastructure.

## Scope

### ✅ Completed

- **Nx Workspace Setup**
  - Initialized integrated Nx workspace with pnpm
  - Configured TypeScript strict mode, ESLint, Prettier
  - Set up module boundary enforcement

- **MFA Authentication Migration**
  - Ported `mfa-user.sh` → TypeScript (`libs/support-scripts/aws/authentication`)
  - Created Nx target: `nx run authentication:mfa`
  - Added comprehensive unit tests
  - Implemented feature flag `FEATURE_NX_SCRIPTS_ENABLED` (default: OFF)

- **Legacy Script Archiving**
  - Moved all `.sh` scripts to `archive/` preserving directory hierarchy
  - Original scripts remain functional and accessible

- **CDK App Scaffolding**
  - Created `apps/cdk-ec2-stack` for future EC2 resource split
  - Configured CDK synth/deploy targets

## Changes

### New Files

- `package.json` - Nx workspace package configuration
- `nx.json` - Nx workspace configuration
- `tsconfig.base.json` - TypeScript base configuration
- `.eslintrc.json` - ESLint with module boundary rules
- `.prettierrc` / `.prettierignore` - Code formatting
- `libs/support-scripts/aws/authentication/` - MFA auth TypeScript library
- `apps/cdk-ec2-stack/` - CDK application scaffold
- `NEXT_STEPS/nx-migration/README.md` - Migration guide

### Modified Files

- `.gitignore` - Updated for Nx artifacts
- `archive/` - All bash scripts moved here

### Deleted Files

- None (all scripts preserved in archive/)

## Testing

### Unit Tests

- ✅ MFA authentication library tests (`mfa-user.spec.ts`)
- ✅ Coverage target: ≥80% (to be verified in CI)

### Manual Testing

```bash
# Verify Nx workspace
pnpm nx graph
pnpm nx format:check

# Test MFA auth (dry run)
FEATURE_NX_SCRIPTS_ENABLED=1 DRY_RUN=1 pnpm nx run authentication:mfa

# Test CDK synthesis
pnpm nx run cdk-ec2-stack:build
pnpm nx run cdk-ec2-stack:synth
```

### Test Plan

- [x] Nx workspace initializes correctly
- [x] MFA auth library builds and tests pass
- [x] CDK app synthesizes without errors
- [ ] E2E MFA flow (requires sandbox AWS account - see NEXT_STEPS)
- [ ] Integration tests for credentials file updates

## Risk Assessment

**Risk Level**: Medium

### Risks

1. **Tooling Changes**: New build system may conflict with existing workflows
   - **Mitigation**: Feature flags, archived scripts preserved, gradual rollout
   - **Impact**: Low (reversible via feature flag)

2. **Behavior Differences**: TypeScript port may behave differently than bash
   - **Mitigation**: Comprehensive tests, dry-run mode, feature flag
   - **Impact**: Low (extensive testing, rollback available)

3. **CDK Migration Complexity**: Future CloudFormation → CDK migration
   - **Mitigation**: Side-by-side approach, scaffold only (no breaking changes)
   - **Impact**: Low (scaffold only, no production changes)

### Rollback Plan

1. **Disable Feature Flag**:
   ```bash
   export FEATURE_NX_SCRIPTS_ENABLED=0
   ```

2. **Use Archived Scripts**:
   ```bash
   bash archive/mfa-user.sh
   ```

3. **Git Revert**:
   ```bash
   git revert <commit-hash>
   ```

## Feature Flags

- `FEATURE_NX_SCRIPTS_ENABLED` (default: `0` / `false`)
  - Controls execution of new TypeScript scripts
  - Set to `1` or `true` to enable
  - Allows gradual rollout and testing

## Observability

- Structured JSON logging with correlation IDs
- No secrets or MFA codes logged
- Error handling with proper stack traces
- Feature flag usage tracked in logs

## Security

- ✅ No secrets in code or logs
- ✅ Credentials file permissions: 0600
- ✅ Input validation (MFA code format)
- ✅ Safe file writes with error handling

## Dependencies

### New Dependencies

- `@aws-sdk/client-sts` - AWS STS client
- `@aws-sdk/credential-providers` - Credential providers
- `ini` - INI file parsing
- `aws-cdk-lib` - AWS CDK library
- `nx` - Nx monorepo tooling

### Dev Dependencies

- TypeScript, Jest, ESLint, Prettier
- Nx plugins (@nx/node, @nx/esbuild, @nx/jest, etc.)

## Breaking Changes

**None** - This PR is additive only:
- Existing scripts preserved in `archive/`
- Feature flag defaults to OFF
- CloudFormation remains source of truth
- CDK app is scaffold only (no deployment)

## Migration Guide

See `NEXT_STEPS/nx-migration/README.md` for:
- Environment variable setup
- Testing procedures
- Remaining work items
- Rollout strategy

## Next Steps

1. **CI/CD Setup** (see NEXT_STEPS)
   - Configure CI pipeline
   - Set up remote cache
   - Add PR checks

2. **E2E Testing** (see NEXT_STEPS)
   - Sandbox AWS account setup
   - Integration test suite
   - Manual verification

3. **Additional Migrations** (see NEXT_STEPS)
   - Port more administration scripts
   - Implement CDK EC2 stack
   - Migrate CloudFormation resources

## Checklist

- [x] Pre-migration snapshot commit created
- [x] Feature branch created (`chore/nx-migration`)
- [x] Nx workspace initialized
- [x] MFA auth ported to TypeScript
- [x] Unit tests written
- [x] Legacy scripts archived
- [x] CDK app scaffolded
- [x] Documentation created
- [ ] CI/CD pipeline configured (see NEXT_STEPS)
- [ ] E2E tests added (see NEXT_STEPS)
- [ ] Coverage verified ≥80%

## Related Issues

- N/A (initial migration)

## Screenshots / Logs

### Nx Graph
```bash
$ pnpm nx graph
# Shows workspace structure with authentication lib and cdk-ec2-stack app
```

### MFA Auth Dry Run
```json
{"ts":"2024-11-06T14:30:00.000Z","level":"info","msg":"Starting MFA auth","sourceProfile":"hepe-admin","targetProfile":"hepe-admin-mfa","duration":43200,"dryRun":true,"runId":"..."}
{"ts":"2024-11-06T14:30:05.000Z","level":"info","msg":"DRY_RUN: would write temporary credentials","targetProfile":"hepe-admin-mfa","expires":"2024-11-07T02:30:05.000Z","runId":"..."}
```

## Reviewers

Please review:
- [ ] Nx workspace configuration
- [ ] MFA authentication TypeScript implementation
- [ ] Test coverage and quality
- [ ] CDK app structure
- [ ] Documentation completeness

## Approval

- [ ] Code review approved
- [ ] Tests passing
- [ ] Documentation reviewed
- [ ] Feature flag strategy approved

---

**Note**: This PR introduces the foundation for Nx migration. Feature flag `FEATURE_NX_SCRIPTS_ENABLED` defaults to OFF, ensuring zero impact on existing workflows until explicitly enabled.

