# ADR-001: Infrastructure Naming Standard

## Status
Accepted

## Context

The mailserver infrastructure codebase had multiple ad-hoc implementations for generating CloudFormation stack names:

- CDK apps used inline `domain.replace(/\./g, '-')` logic
- Admin scripts had `resolveStackName` and `resolveDomain` functions with inconsistent behavior
- Support scripts duplicated naming logic
- Legacy fallbacks allowed non-TLD instance stack names (e.g., `emcnotary-mailserver-instance` vs `emcnotary-com-mailserver-instance`)

This inconsistency made it difficult to:
- Scale to multiple domains
- Maintain naming conventions
- Discover and manage stacks programmatically
- Migrate legacy stacks

## Decision

We will centralize all stack naming logic in a shared library `@mm/infra-naming` that enforces canonical naming:

- **Core stacks**: `{domain-tld}-mailserver-core` (e.g., `emcnotary-com-mailserver-core`)
- **Instance stacks**: `{domain-tld}-mailserver-instance` (e.g., `emcnotary-com-mailserver-instance`)

All CDK apps, admin scripts, and support scripts will import from this library instead of implementing naming logic inline.

Legacy stack discovery (without TLD) is gated behind `FEATURE_LEGACY_NAME_RESOLVE=1` flag with warnings, allowing read-only access during migration.

## Consequences

### Positive

- **Consistency**: Single source of truth for stack naming
- **Maintainability**: Changes to naming logic only need to happen in one place
- **Scalability**: Easy to add new domains without duplicating logic
- **Type safety**: TypeScript ensures correct usage
- **Testability**: Centralized logic is easier to test

### Negative

- **Migration effort**: Existing stacks need to be redeployed with canonical names
- **Breaking change**: Legacy stacks without TLD will not be discoverable by default
- **Temporary complexity**: Legacy flag adds conditional logic during migration period

### Risks & Mitigation

- **Risk**: Stack rename requires CloudFormation destroy/create (not in-place rename)
  - **Mitigation**: Use feature flag to gate deployments; test on non-prod domain first
- **Risk**: Admin scripts may fail to discover legacy stacks
  - **Mitigation**: Legacy flag provides read-only fallback; warnings guide migration
- **Risk**: SSM parameter paths remain stable, so consumers unaffected
  - **Mitigation**: Verified - SSM paths use domain name without TLD (e.g., `/emcnotary/core`)

## Alternatives Considered

### Option A: Keep ad-hoc naming, add validation
- **Pros**: No migration needed
- **Cons**: Technical debt remains; harder to maintain; inconsistency persists
- **Rejected**: Doesn't solve the root problem

### Option B: Centralize naming but allow legacy names indefinitely
- **Pros**: No breaking changes
- **Cons**: Perpetuates inconsistency; harder to scale
- **Rejected**: Defeats the purpose of standardization

### Option C: Centralize naming with strict enforcement (no legacy support)
- **Pros**: Cleanest solution
- **Cons**: Breaks existing workflows immediately
- **Rejected**: Too disruptive; migration period needed

## Implementation

1. Created `libs/infra/naming` library with:
   - `toKebabDomain(domain: string): string`
   - `toMailserverCoreStackName(domain: string): string`
   - `toMailserverInstanceStackName(domain: string): string`
   - `parseDomainFromMailserverStack(stackName: string): string`
   - `coreParamPrefix(domain: string): string`

2. Refactored all call sites:
   - `apps/cdk-emc-notary/core/src/main.ts`
   - `apps/cdk-emc-notary/instance/src/main.ts`
   - `libs/admin/admin-stack-info/src/lib/stack-info.ts`
   - `libs/support-scripts/aws/instance-bootstrap/src/lib/bootstrap.ts`
   - `libs/support-scripts/aws/instance/src/lib/setup.ts`

3. Added legacy fallback support:
   - Gated behind `FEATURE_LEGACY_NAME_RESOLVE=1`
   - Warnings logged when legacy stacks are discovered
   - Read-only access (no writes to legacy stacks)

4. Added comprehensive unit tests

## Migration Plan

1. **Phase 1**: Deploy new code with legacy flag OFF (default)
   - All new stacks use canonical names
   - Legacy stacks not discoverable (by design)

2. **Phase 2**: Enable legacy flag for migration period
   - Set `FEATURE_LEGACY_NAME_RESOLVE=1` in environment
   - Admin scripts can discover legacy stacks read-only
   - Warnings guide operators to migrate

3. **Phase 3**: Redeploy all stacks with canonical names
   ```bash
   export FEATURE_CDK_EMCNOTARY_STACKS_ENABLED=1
   export DOMAIN=emcnotary.com
   pnpm nx run cdk-emcnotary-core:deploy
   pnpm nx run cdk-emcnotary-instance:deploy
   ```

4. **Phase 4**: Remove legacy flag support (after all domains migrated)
   - Remove `FEATURE_LEGACY_NAME_RESOLVE` logic
   - Update documentation

## Success Criteria

- ✅ All stack names follow canonical format
- ✅ No inline naming logic in CDK apps or scripts
- ✅ Unit tests cover all naming functions
- ✅ Legacy stacks can be discovered during migration
- ✅ All domains redeployed with canonical names

## References

- [Naming Library README](../libs/infra/naming/README.md)
- [CDK Stack Documentation](./CDK_EMCNOTARY_STACKS.md)





