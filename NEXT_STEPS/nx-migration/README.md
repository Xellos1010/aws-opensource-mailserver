# Nx Migration - Next Steps

## Overview

This document outlines the next steps and remaining work items for the Nx migration of the AWS Open Source Mail Server repository.

## Completed Work

✅ **Nx Workspace Initialization**
- Integrated Nx workspace with pnpm package manager
- Configured TypeScript strict mode
- Set up ESLint with module boundary enforcement
- Configured Prettier for code formatting

✅ **MFA Authentication Migration**
- Ported `mfa-user.sh` to TypeScript (`libs/support-scripts/aws/authentication`)
- Created Nx target `nx run authentication:mfa`
- Added comprehensive unit tests
- Implemented feature flag `FEATURE_NX_SCRIPTS_ENABLED`

✅ **Legacy Script Archiving**
- Moved all bash scripts to `archive/` preserving directory hierarchy
- Original `mfa-user.sh` available at `archive/mfa-user.sh`

✅ **CDK App Scaffolding**
- Created `apps/cdk-ec2-stack` for future EC2 resource split
- Configured CDK synth and deploy targets

## Remaining Work Items

### 1. Node Version & Engine Policy

**Status**: ⚠️ Missing

**Action Required**:
- [ ] Add `.nvmrc` file with Node version (recommended: 20.x)
- [ ] Document Node version requirement in README
- [ ] Add engine check in CI/CD pipeline

**Example**:
```bash
echo "20.18.1" > .nvmrc
```

### 2. CI/CD Pipeline Configuration

**Status**: ⚠️ Missing

**Action Required**:
- [ ] Choose CI provider (GitHub Actions, GitLab CI, CircleCI, etc.)
- [ ] Configure pipeline to run:
  - `nx affected -t lint -t build -t test`
  - `nx format:check`
  - Coverage reporting (target: ≥80%)
- [ ] Set up remote cache (Nx Cloud or alternative)
- [ ] Configure PR checks

**Example GitHub Actions**:
```yaml
# .github/workflows/ci.yml
name: CI
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: pnpm/action-setup@v2
      - uses: actions/setup-node@v3
        with:
          node-version: '20'
          cache: 'pnpm'
      - run: pnpm install
      - run: pnpm nx affected -t lint -t build -t test
```

### 3. AWS Account for E2E Testing

**Status**: ⚠️ Missing

**Action Required**:
- [ ] Identify sandbox AWS account for MFA E2E testing
- [ ] Configure test IAM user with MFA device
- [ ] Document test account setup in `docs/testing.md`
- [ ] Add integration test suite for MFA flow

**Environment Variables for Testing**:
```bash
export MFA_DEVICE_ARN="arn:aws:iam::<TEST_ACCOUNT_ID>:mfa/test-device"
export SOURCE_PROFILE="test-admin"
export TARGET_PROFILE="test-admin-mfa"
export DURATION_SECONDS=3600
export FEATURE_NX_SCRIPTS_ENABLED=1
export DRY_RUN=1  # For initial testing
```

### 4. Additional Script Migrations

**Status**: 🔄 In Progress

**Priority Scripts to Migrate**:
1. `administration/deploy-stack.sh` → CDK deploy wrapper
2. `administration/describe-stack.sh` → CDK describe wrapper
3. `administration/restart-ec2-instance.sh` → TypeScript lib
4. `administration/check-memory-and-stop-instance.sh` → TypeScript lib

**Migration Pattern**:
```typescript
// libs/support-scripts/aws/ec2/src/lib/instance-management.ts
export async function restartInstance(instanceId: string): Promise<void> {
  // Implementation
}
```

### 5. CloudFormation to CDK Migration

**Status**: 🔄 Scaffolded

**Action Required**:
- [ ] Analyze `mailserver-infrastructure-mvp.yaml` for EC2 resources
- [ ] Implement EC2 stack in `apps/cdk-ec2-stack`
- [ ] Migrate SES resources to separate CDK stack
- [ ] Migrate S3/SNS/CloudWatch resources
- [ ] Create migration guide for existing stacks
- [ ] Test CDK stacks in sandbox before production

**Resources to Migrate**:
- EC2 Instance (Mail-in-a-Box)
- Security Groups
- Elastic IP
- IAM Roles & Policies
- CloudWatch Alarms
- SNS Topics
- S3 Buckets (backups, logs)

### 6. Documentation Updates

**Status**: ⚠️ Partial

**Action Required**:
- [ ] Update main README.md with Nx workspace instructions
- [ ] Create `docs/development.md` with local setup guide
- [ ] Document Nx targets in `docs/nx-targets.md`
- [ ] Create ADR for Nx migration decision
- [ ] Update deployment documentation

### 7. Feature Flag Rollout Plan

**Status**: ⚠️ Not Started

**Action Required**:
- [ ] Define rollout stages:
  1. Internal testing (FEATURE_NX_SCRIPTS_ENABLED=1 for devs)
  2. Pilot users (emcnotary.com domain first)
  3. General availability
- [ ] Create monitoring dashboard for script usage
- [ ] Document rollback procedure
- [ ] Set timeline for flag removal

### 8. Testing Coverage

**Status**: ⚠️ Partial

**Current Coverage**: Unit tests for MFA auth library

**Action Required**:
- [ ] Add integration tests for credentials file updates
- [ ] Add E2E tests for MFA flow (sandbox account)
- [ ] Add tests for CDK stack synthesis
- [ ] Achieve ≥80% coverage for all new TypeScript libs
- [ ] Set up coverage reporting in CI

### 9. Dependency Updates

**Status**: ⚠️ Warnings Present

**Action Required**:
- [ ] Update `eslint-config-prettier` to v10 (peer dependency warning)
- [ ] Update `@swc/core` to resolve peer dependency warning
- [ ] Review and update deprecated packages
- [ ] Add Dependabot/Renovate for automated updates

### 10. Security Hardening

**Status**: ⚠️ Not Started

**Action Required**:
- [ ] Add secret scanning (GitHub Secret Scanning, GitGuardian)
- [ ] Configure Dependabot security alerts
- [ ] Review IAM policies in CDK stacks
- [ ] Add security linting (eslint-plugin-security)
- [ ] Document secrets management best practices

## Verification Commands

After completing setup, verify with:

```bash
# Check Nx workspace health
pnpm nx graph
pnpm nx format:check

# Run affected checks
pnpm nx affected -t lint -t build -t test

# Test MFA auth (dry run)
FEATURE_NX_SCRIPTS_ENABLED=1 DRY_RUN=1 pnpm nx run authentication:mfa

# Test CDK synthesis
pnpm nx run cdk-ec2-stack:build
pnpm nx run cdk-ec2-stack:synth
```

## Environment Variables Reference

### MFA Authentication

| Variable | Description | Required | Default |
|----------|-------------|----------|---------|
| `MFA_DEVICE_ARN` | AWS MFA device ARN | No | `arn:aws:iam::413988044972:mfa/Evans-Phone` |
| `SOURCE_PROFILE` | AWS CLI profile with long-term credentials | No | `hepe-admin` |
| `TARGET_PROFILE` | AWS CLI profile for temporary credentials | No | `hepe-admin-mfa` |
| `DURATION_SECONDS` | Session duration in seconds | No | `43200` (12 hours) |
| `DRY_RUN` | Skip writing credentials file | No | `0` |
| `FEATURE_NX_SCRIPTS_ENABLED` | Enable Nx script execution | No | `0` (disabled) |
| `AWS_REGION` | AWS region for STS calls | No | `us-east-1` |

### CDK

| Variable | Description | Required | Default |
|----------|-------------|----------|---------|
| `CDK_DEFAULT_ACCOUNT` | AWS account ID | Yes | - |
| `CDK_DEFAULT_REGION` | AWS region | No | `us-east-1` |

## Risk & Rollback Plan

### Risks Identified

1. **Tooling Drift**: New Nx tooling may conflict with existing workflows
   - **Mitigation**: Feature flags, archived scripts preserved
   - **Rollback**: Use archived scripts, disable feature flag

2. **Breaking Changes**: TypeScript port may behave differently than bash
   - **Mitigation**: Comprehensive tests, dry-run mode, gradual rollout
   - **Rollback**: Revert to archived `mfa-user.sh`

3. **CDK Migration Complexity**: CloudFormation to CDK migration is non-trivial
   - **Mitigation**: Side-by-side approach, test in sandbox first
   - **Rollback**: Keep CloudFormation as source of truth until CDK proven

### Rollback Procedures

1. **Disable Nx Scripts**:
   ```bash
   export FEATURE_NX_SCRIPTS_ENABLED=0
   ```

2. **Use Archived Scripts**:
   ```bash
   bash archive/mfa-user.sh
   ```

3. **Revert Git Changes**:
   ```bash
   git revert <commit-hash>
   ```

## Success Metrics

- [ ] All Nx targets pass: `lint`, `build`, `test`
- [ ] Test coverage ≥80% for new TypeScript libs
- [ ] MFA auth works identically to bash version
- [ ] CDK stack synthesizes without errors
- [ ] CI/CD pipeline green
- [ ] Zero production incidents during rollout

## Timeline Estimate

- **Week 1**: CI/CD setup, testing infrastructure
- **Week 2**: Additional script migrations, CDK EC2 stack implementation
- **Week 3**: Testing, documentation, pilot rollout
- **Week 4**: General availability, monitoring, optimization

## Questions & Decisions Needed

1. **CI Provider**: Which CI/CD platform should we use?
2. **Test Account**: Do we have a sandbox AWS account for E2E testing?
3. **Rollout Strategy**: What's the timeline for enabling `FEATURE_NX_SCRIPTS_ENABLED`?
4. **CDK Migration**: Should we migrate all CloudFormation resources or keep hybrid approach?
5. **Documentation**: Where should developer documentation live? (docs/, wiki, etc.)

## Contact & Support

For questions or issues:
- Create an issue in the repository
- Review ADRs in `docs/adr/`
- Check Nx documentation: https://nx.dev

