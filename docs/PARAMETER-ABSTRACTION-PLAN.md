# Parameter Abstraction Plan

## Executive Summary

This document outlines a comprehensive plan to abstract hardcoded values across the mailserver infrastructure codebase, enabling true multi-tenancy and graceful parameter propagation between stacks and applications.

## Problem Statement

The current codebase has several hardcoded values that prevent proper multi-tenant deployment:

1. **SSM Parameter Paths** - Hardcoded to `/emcnotary/core/*` in `@mm/infra-core-params`
2. **Default Domain Names** - Hardcoded in CDK stacks (`emcnotary.com`, `k3frame.com`)
3. **AWS Profile/Region** - Hardcoded defaults throughout admin libraries
4. **AWS Account ID** - Hardcoded in archive/example files

This causes deployment failures when the CloudFormation early validation hook (`AWS::EarlyValidation::ResourceExistenceCheck`) detects resource name conflicts.

---

## Audit Results

### Category 1: SSM Parameter Paths (CRITICAL)

**Source File:** `libs/infra/core-params/src/lib/core-params.ts`

```typescript
// CURRENT (BROKEN)
export const CORE_PARAM_PREFIX = '/emcnotary/core';
export const P_DOMAIN_NAME = `${CORE_PARAM_PREFIX}/domainName`;
// ... etc
```

**Affected Files:**
| File | Usage |
|------|-------|
| `apps/cdk-k3frame/core/src/stacks/core-stack.ts` | Imports P_* constants |
| `apps/cdk-emc-notary/core/src/stacks/core-stack.ts` | Imports P_* constants |
| `apps/cdk-emc-notary/instance/src/stacks/instance-stack.ts` | Hardcoded `/emcnotary/core` |
| `libs/support-scripts/aws/instance-bootstrap/src/lib/bootstrap.ts` | Uses CORE_PARAM_PREFIX |
| `libs/infra/config-loader/bin/cdk-synth.ts` | References constants |
| 7+ test files | Hardcoded assertions |

**Solution:** The `@mm/infra-naming` library already has a dynamic function:
```typescript
// libs/infra/naming/src/index.ts
export function coreParamPrefix(domain: string): string {
  const domainPart = domain.split('.')[0];
  return `/${domainPart}/core`;
}
// coreParamPrefix('k3frame.com') => '/k3frame/core'
```

### Category 2: Default Domain Names (HIGH)

**Affected Files:**
| File | Hardcoded Value |
|------|-----------------|
| `apps/cdk-k3frame/core/src/stacks/core-stack.ts:38` | `default: 'k3frame.com'` |
| `apps/cdk-emc-notary/core/src/stacks/core-stack.ts:38` | `default: 'emcnotary.com'` |
| `apps/cdk-emc-notary/instance/src/stacks/instance-stack.ts:384` | `coreParamPrefix: '/emcnotary/core'` |

### Category 3: AWS Profile Defaults (MEDIUM)

**Hardcoded in 38+ files:**
- Default profile: `hepe-admin-mfa`
- Default region: `us-east-1`

**Examples:**
```typescript
// libs/infra/config-loader/src/lib/config.ts:21-28
const DEFAULT_CONFIG: DeploymentConfig = {
  aws: {
    profile: 'hepe-admin-mfa',  // Should be environment-specific
    region: 'us-east-1',
  },
  // ...
};
```

### Category 4: MFA Device ARN (LOW)

**Hardcoded in:**
- `libs/support-scripts/aws/authentication/src/lib/mfa-user.ts:57`
- `.env.example`

```typescript
'arn:aws:iam::413988044972:mfa/Evans-Phone'
```

---

## Proposed Architecture

### Phase 1: Domain-Aware Core Parameters

**Goal:** Make `@mm/infra-core-params` generate domain-specific parameter paths.

#### Option A: Function-Based API (Recommended)

```typescript
// libs/infra/core-params/src/lib/core-params.ts

import { coreParamPrefix } from '@mm/infra-naming';

// Export function factory instead of constants
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

// Type export for consumers
export type CoreParams = ReturnType<typeof createCoreParams>;

// Backwards compatibility: Default to environment variable or throw
export const CORE_PARAM_PREFIX = process.env['DOMAIN']
  ? coreParamPrefix(process.env['DOMAIN'])
  : (() => { throw new Error('DOMAIN environment variable required'); })();
```

#### Option B: Class-Based API

```typescript
export class CoreParamsBuilder {
  constructor(private domain: string) {}

  get prefix() { return coreParamPrefix(this.domain); }
  get domainName() { return `${this.prefix}/domainName`; }
  // ... etc
}
```

### Phase 2: Centralized Domain Configuration

**Goal:** Single source of truth for domain configuration per CDK app.

#### New File: `libs/infra/domain-registry/src/lib/registry.ts`

```typescript
export interface DomainRegistration {
  domain: string;
  stackPrefix: string;
  coreParamPrefix: string;
  environment: 'dev' | 'staging' | 'prod';
  awsProfile?: string;
  awsRegion?: string;
}

export function registerDomain(domain: string): DomainRegistration {
  const domainPart = domain.split('.')[0];
  return {
    domain,
    stackPrefix: toKebabDomain(domain),
    coreParamPrefix: coreParamPrefix(domain),
    environment: 'dev',
  };
}
```

### Phase 3: Configuration Propagation

**Goal:** Pass domain configuration through the stack hierarchy.

#### CDK Stack Pattern:

```typescript
// apps/cdk-{domain}/core/src/stacks/core-stack.ts

export interface CoreStackProps extends StackProps {
  domainConfig: DomainRegistration;
}

export class MailserverCoreStack extends Stack {
  constructor(scope: Construct, id: string, props: CoreStackProps) {
    super(scope, id, props);

    const { domain, coreParamPrefix } = props.domainConfig;
    const params = createCoreParams(domain);

    // Use params.P_DOMAIN_NAME instead of hardcoded constant
    new ssm.StringParameter(this, 'ParamDomainName', {
      parameterName: params.P_DOMAIN_NAME,
      stringValue: domain,
    });
  }
}
```

#### main.ts Pattern:

```typescript
// apps/cdk-{domain}/core/src/main.ts

const domain = process.env['DOMAIN'] || 'default.com';
const domainConfig = registerDomain(domain);

const app = new cdk.App();
new MailserverCoreStack(app, domainConfig.stackPrefix + '-mailserver-core', {
  domainConfig,
  env: {
    account: process.env['CDK_DEFAULT_ACCOUNT'],
    region: process.env['CDK_DEFAULT_REGION'] || 'us-east-1',
  },
});
```

---

## Implementation Plan

### Epic 1: Core Parameter Abstraction

| Task | Priority | Effort | Files Changed |
|------|----------|--------|---------------|
| 1.1 Refactor `@mm/infra-core-params` to function-based API | P0 | 2h | 1 |
| 1.2 Update `cdk-k3frame` core stack | P0 | 1h | 1 |
| 1.3 Update `cdk-emc-notary` core stack | P0 | 1h | 1 |
| 1.4 Update `cdk-emc-notary` instance stack | P0 | 1h | 1 |
| 1.5 Update `instance-bootstrap` library | P1 | 2h | 1 |
| 1.6 Update test files | P1 | 3h | 7+ |

### Epic 2: Domain Registry Library

| Task | Priority | Effort | Files Changed |
|------|----------|--------|---------------|
| 2.1 Create `@mm/infra-domain-registry` library | P1 | 3h | New |
| 2.2 Define DomainRegistration interface | P1 | 1h | New |
| 2.3 Implement registry functions | P1 | 2h | New |
| 2.4 Add validation and error handling | P2 | 2h | New |

### Epic 3: Configuration Defaults Cleanup

| Task | Priority | Effort | Files Changed |
|------|----------|--------|---------------|
| 3.1 Remove hardcoded profile from config-loader | P2 | 1h | 1 |
| 3.2 Update admin libraries to use config-loader | P2 | 4h | 38 |
| 3.3 Remove MFA device ARN hardcoding | P3 | 30m | 2 |
| 3.4 Update project.json files | P3 | 2h | 30+ |

### Epic 4: Documentation & Migration

| Task | Priority | Effort | Files Changed |
|------|----------|--------|---------------|
| 4.1 Update library READMEs | P2 | 2h | 10+ |
| 4.2 Create migration guide | P2 | 2h | 1 |
| 4.3 Update CDK stack documentation | P2 | 1h | 4 |

---

## New Features Required

### Feature 1: Domain Registry Library (`@mm/infra-domain-registry`)

**Purpose:** Centralized domain configuration management

**API:**
```typescript
// Register a new domain
const config = registerDomain('k3frame.com');

// Get all registered domains
const domains = listDomains();

// Validate domain configuration
validateDomainConfig(config);
```

### Feature 2: Enhanced Config Loader

**Purpose:** Support per-app configuration with domain awareness

**New capabilities:**
- Load domain from `app.json` or environment
- Validate AWS credentials before deployment
- Auto-detect available profiles

### Feature 3: CDK Context Provider for Domain Config

**Purpose:** Pass domain configuration through CDK context

**Usage:**
```bash
cdk deploy --context domain=k3frame.com
```

**CDK Code:**
```typescript
const domain = this.node.tryGetContext('domain') || process.env['DOMAIN'];
```

---

## Migration Strategy

### Step 1: Non-Breaking Changes First

1. Add new function-based API to `@mm/infra-core-params`
2. Keep existing constants for backwards compatibility
3. Add deprecation warnings

### Step 2: Update Consumers Incrementally

1. Update k3frame stacks first (currently broken)
2. Update emcnotary stacks
3. Update admin libraries
4. Update tests

### Step 3: Remove Deprecated APIs

1. Remove constant exports from `@mm/infra-core-params`
2. Remove hardcoded defaults from config-loader
3. Require explicit domain configuration

---

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| Breaking existing emcnotary deployment | High | Maintain backwards compatibility |
| Test failures from updated assertions | Medium | Update tests in same PR |
| Admin scripts break | Medium | Update scripts incrementally |
| Documentation lag | Low | Update docs in same PR |

---

## Success Criteria

1. `nx run cdk-k3frame-core:deploy` succeeds without conflicts
2. Multiple domains can be deployed to same AWS account
3. No hardcoded `/emcnotary/core` paths in source code
4. All tests pass with domain-aware parameters
5. Documentation reflects new architecture

---

## Timeline

| Phase | Duration | Deliverable |
|-------|----------|-------------|
| Phase 1 (Critical Fix) | 1 day | k3frame deploys successfully |
| Phase 2 (Library) | 2 days | Domain registry library |
| Phase 3 (Cleanup) | 3 days | All hardcoded values removed |
| Phase 4 (Docs) | 1 day | Updated documentation |

**Total Estimated Effort:** 7 days

---

## Appendix: Full Audit Results

### Files with `/emcnotary` References (Source Code Only)

```
libs/infra/core-params/src/lib/core-params.ts:6
libs/infra/instance-constructs/src/lib/domain-config.ts:9
libs/infra/naming/src/index.ts:86,89,93
libs/infra/naming/src/index.spec.ts:80
libs/support-scripts/aws/instance-bootstrap/src/lib/bootstrap.ts:299
apps/cdk-emc-notary/core/src/stacks/core-stack.ts (via import)
apps/cdk-emc-notary/instance/src/stacks/instance-stack.ts:384
apps/cdk-k3frame/core/src/stacks/core-stack.ts (via import)
```

### Files with Hardcoded AWS Profile (38 files)

See `libs/admin/*/project.json` for complete list.

### Files with Hardcoded Region Defaults

See `libs/*/src/**/*.ts` files using `'us-east-1'` as fallback.
