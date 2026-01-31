# Domain-Aware Parameters Feature Development Plan

**Status:** Planned
**Priority:** High
**Estimated Effort:** 7 days
**Created:** 2026-01-30
**Quick Fix Applied:** Yes (k3frame only)

---

## Overview

This document outlines the development plan for implementing domain-aware SSM parameter paths across all mailserver infrastructure. The quick fix has been applied to unblock k3frame deployment, but a comprehensive solution is needed to support true multi-tenancy.

## Problem Statement

The `@mm/infra-core-params` library exports hardcoded SSM parameter paths pointing to `/emcnotary/core/*`. This causes:

1. **Resource conflicts** when deploying multiple domains to the same AWS account
2. **CloudFormation early validation failures** (AWS::EarlyValidation::ResourceExistenceCheck)
3. **Tight coupling** between the shared library and a specific domain

## Quick Fix Applied

**File:** `apps/cdk-k3frame/core/src/stacks/core-stack.ts`

**Changes:**
```typescript
// BEFORE: Imported hardcoded constants
import {
  P_DOMAIN_NAME,
  P_BACKUP_BUCKET,
  // ... etc
} from '@mm/infra-core-params';

// AFTER: Generate domain-specific paths locally
import { coreParamPrefix } from '@mm/infra-naming';

const DEFAULT_DOMAIN = 'k3frame.com';

function createCoreParamPaths(domain: string) {
  const prefix = coreParamPrefix(domain);
  return {
    CORE_PARAM_PREFIX: prefix,
    P_DOMAIN_NAME: `${prefix}/domainName`,
    P_BACKUP_BUCKET: `${prefix}/backupBucket`,
    // ... etc
  };
}

// Usage: paramPaths.P_DOMAIN_NAME => '/k3frame/core/domainName'
```

**Result:** k3frame now uses `/k3frame/core/*` paths instead of `/emcnotary/core/*`

---

## Full Feature Implementation Plan

### Phase 1: Refactor `@mm/infra-core-params` Library

**Goal:** Make the library generate domain-specific parameter paths

**Ticket:** `INFRA-001`
**Effort:** 4 hours

#### Tasks

1. **Add function-based API**
   ```typescript
   // libs/infra/core-params/src/lib/core-params.ts

   import { coreParamPrefix } from '@mm/infra-naming';

   export function createCoreParams(domain: string) {
     const prefix = coreParamPrefix(domain);
     return {
       CORE_PARAM_PREFIX: prefix,
       P_DOMAIN_NAME: `${prefix}/domainName`,
       P_BACKUP_BUCKET: `${prefix}/backupBucket`,
       P_NEXTCLOUD_BUCKET: `${prefix}/nextcloudBucket`,
       P_ALARMS_TOPIC: `${prefix}/alarmsTopicArn`,
       P_SES_IDENTITY_ARN: `${prefix}/sesIdentityArn`,
       P_EIP_ALLOCATION_ID: `${prefix}/eipAllocationId`,
     } as const;
   }

   export type CoreParams = ReturnType<typeof createCoreParams>;
   ```

2. **Deprecate static constants**
   ```typescript
   /**
    * @deprecated Use createCoreParams(domain) instead
    */
   export const CORE_PARAM_PREFIX = '/emcnotary/core';
   ```

3. **Update exports in index.ts**

4. **Add unit tests for new API**

#### Acceptance Criteria
- [ ] `createCoreParams('k3frame.com')` returns paths with `/k3frame/core/` prefix
- [ ] `createCoreParams('emcnotary.com')` returns paths with `/emcnotary/core/` prefix
- [ ] Old constants still work (backwards compatibility)
- [ ] Deprecation warnings appear in IDE

---

### Phase 2: Update CDK App Stacks

**Goal:** Migrate all CDK stacks to use the new function-based API

**Ticket:** `INFRA-002`
**Effort:** 6 hours

#### Files to Update

| File | Priority | Status |
|------|----------|--------|
| `apps/cdk-k3frame/core/src/stacks/core-stack.ts` | P0 | ✅ Quick fix applied |
| `apps/cdk-emc-notary/core/src/stacks/core-stack.ts` | P1 | Pending |
| `apps/cdk-emc-notary/instance/src/stacks/instance-stack.ts` | P1 | Pending |

#### Migration Pattern

```typescript
// BEFORE
import { P_DOMAIN_NAME } from '@mm/infra-core-params';

new ssm.StringParameter(this, 'ParamDomainName', {
  parameterName: P_DOMAIN_NAME,  // Hardcoded to /emcnotary/core/domainName
  stringValue: domain,
});

// AFTER
import { createCoreParams } from '@mm/infra-core-params';

const params = createCoreParams(DEFAULT_DOMAIN);

new ssm.StringParameter(this, 'ParamDomainName', {
  parameterName: params.P_DOMAIN_NAME,  // Dynamic: /k3frame/core/domainName
  stringValue: domain,
});
```

#### Acceptance Criteria
- [ ] All CDK core stacks use `createCoreParams()`
- [ ] All CDK instance stacks use dynamic `coreParamPrefix`
- [ ] No hardcoded `/emcnotary/core` in source code
- [ ] All builds pass
- [ ] All tests pass

---

### Phase 3: Update Bootstrap & Admin Libraries

**Goal:** Ensure all support scripts use domain-aware parameter paths

**Ticket:** `INFRA-003`
**Effort:** 8 hours

#### Files to Update

| Library | File | Changes Needed |
|---------|------|----------------|
| `instance-bootstrap` | `bootstrap.ts` | Use dynamic prefix |
| `config-loader` | `cdk-synth.ts` | Reference new API |
| Various admin libs | Multiple | Remove hardcoded profiles |

#### Acceptance Criteria
- [ ] `instance-bootstrap` derives prefix from domain
- [ ] No hardcoded `/emcnotary/core` in libs/
- [ ] All admin commands work with any domain

---

### Phase 4: Update Test Files

**Goal:** Update test assertions to use dynamic paths

**Ticket:** `INFRA-004`
**Effort:** 4 hours

#### Files to Update

```
apps/cdk-emc-notary/core/src/__tests__/stacks/core-stack.spec.ts
apps/cdk-emc-notary/core/src/__it__/resource-integration.spec.ts
apps/cdk-emc-notary/instance/tests/e2e/deploy-validation.e2e.test.ts
apps/cdk-emc-notary/instance/tests/e2e/bootstrap.e2e.test.ts
apps/cdk-emc-notary/instance/src/__tests__/main.spec.ts
apps/cdk-emc-notary/instance/src/__it__/ssm-parameter-resolution.integration.spec.ts
```

#### Test Update Pattern

```typescript
// BEFORE
expect(resource['Properties']?.['Name']).toBe('/emcnotary/core/domainName');

// AFTER
const params = createCoreParams('emcnotary.com');
expect(resource['Properties']?.['Name']).toBe(params.P_DOMAIN_NAME);
```

---

### Phase 5: Documentation & Cleanup

**Goal:** Update documentation and remove deprecated code

**Ticket:** `INFRA-005`
**Effort:** 4 hours

#### Tasks

1. Update `libs/infra/core-params/README.md`
2. Update `docs/CDK_EMCNOTARY_STACKS.md`
3. Update `docs/TASKS-DOMAIN-CONFIG.md`
4. Remove quick fix code from k3frame (use library instead)
5. Add migration guide

---

## Execution Pathway

```
┌─────────────────────────────────────────────────────────────────┐
│                      Current State                               │
│  k3frame: Quick fix applied (local createCoreParamPaths)        │
│  emcnotary: Uses hardcoded constants from @mm/infra-core-params │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  Phase 1: Refactor @mm/infra-core-params                        │
│  - Add createCoreParams(domain) function                        │
│  - Deprecate static constants                                   │
│  - Maintain backwards compatibility                             │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  Phase 2: Update CDK Stacks                                     │
│  - Update emcnotary core stack                                  │
│  - Update emcnotary instance stack                              │
│  - Update k3frame to use library (remove local function)        │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  Phase 3: Update Support Libraries                              │
│  - instance-bootstrap                                           │
│  - config-loader                                                │
│  - admin libraries                                              │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  Phase 4: Update Tests                                          │
│  - Unit tests                                                   │
│  - Integration tests                                            │
│  - E2E tests                                                    │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  Phase 5: Documentation & Cleanup                               │
│  - Update READMEs                                               │
│  - Remove deprecated constants                                  │
│  - Create migration guide                                       │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Target State                                │
│  All domains use dynamic, domain-specific SSM parameter paths   │
│  True multi-tenancy supported                                   │
│  No hardcoded domain references in shared libraries             │
└─────────────────────────────────────────────────────────────────┘
```

---

## Commands to Execute

### Phase 1 Commands
```bash
# Edit the core-params library
code libs/infra/core-params/src/lib/core-params.ts

# Build and test
pnpm nx run infra-core-params:build
pnpm nx run infra-core-params:test
```

### Phase 2 Commands
```bash
# Update emcnotary stacks
pnpm nx run cdk-emc-notary-core:build
pnpm nx run cdk-emc-notary-core:test
pnpm nx run cdk-emc-notary-instance:build
pnpm nx run cdk-emc-notary-instance:test

# Remove quick fix from k3frame and use library
pnpm nx run cdk-k3frame-core:build
pnpm nx run cdk-k3frame-core:test
```

### Phase 3 Commands
```bash
# Update and test support libraries
pnpm nx run instance-bootstrap:build
pnpm nx run instance-bootstrap:test
pnpm nx run infra-config-loader:build
pnpm nx run infra-config-loader:test
```

### Validation Commands
```bash
# Run all affected tests
pnpm nx affected:test

# Synth all CDK apps
pnpm nx run cdk-k3frame-core:synth
pnpm nx run cdk-emc-notary-core:synth

# Deploy (after testing)
pnpm nx run cdk-k3frame-core:deploy
pnpm nx run cdk-emc-notary-core:deploy
```

---

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| Breaking emcnotary deployment | Maintain backwards compatibility with deprecated constants |
| Test failures | Update tests in same PR as code changes |
| Admin script failures | Test all admin commands after changes |
| SSM parameter mismatch | Verify parameter paths match between core and instance stacks |

---

## Success Criteria

1. ✅ k3frame core deploys without conflicts (Quick fix)
2. ⬜ emcnotary core deploys without changes to existing parameters
3. ⬜ Multiple domains can coexist in same AWS account
4. ⬜ All tests pass
5. ⬜ No hardcoded `/emcnotary/core` in source code (excluding docs/archives)
6. ⬜ Documentation updated

---

## Related Documents

- [PARAMETER-ABSTRACTION-PLAN.md](../PARAMETER-ABSTRACTION-PLAN.md) - Full audit and architecture
- [CDK_EMCNOTARY_STACKS.md](../CDK_EMCNOTARY_STACKS.md) - CDK stack documentation
- [TASKS-DOMAIN-CONFIG.md](../TASKS-DOMAIN-CONFIG.md) - Domain configuration tasks

---

## Changelog

| Date | Change |
|------|--------|
| 2026-01-30 | Initial plan created |
| 2026-01-30 | Quick fix applied to k3frame core-stack.ts |
