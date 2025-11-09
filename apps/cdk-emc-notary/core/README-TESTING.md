# CDK Core Stack Testing Guide

## Test Structure

This project follows the comprehensive testing strategy with three layers:

### Unit Tests (`src/__tests__/`)
- **core-stack.spec.ts**: Tests individual CDK construct resources and properties
- Validates CloudFormation template generation
- Tests resource configurations (SES, S3, Lambda, SSM, etc.)

### Integration Tests (`src/__it__/`)
- **resource-integration.spec.ts**: Tests cross-resource dependencies
- **parameter-resolution.spec.ts**: Tests domain parameter handling
- Validates resource relationships and references

### E2E Tests (`tests/e2e/`)
- **cdk-validation.e2e.test.ts**: Tests actual CDK synthesis
- **deployment-smoke.e2e.test.ts**: Tests deployment validation
- Requires CDK to be built and synthesized

## Running Tests

### Run All Tests
```bash
pnpm nx test cdk-emcnotary-core
```

### Run Unit Tests Only
```bash
pnpm nx test cdk-emcnotary-core --testPathPattern=__tests__
```

### Run Integration Tests Only
```bash
pnpm nx test cdk-emcnotary-core --testPathPattern=__it__
```

### Run E2E Tests Only
```bash
pnpm nx test cdk-emcnotary-core --testPathPattern=e2e
```

### Run with Coverage
```bash
pnpm nx test cdk-emcnotary-core --coverage
```

## Prerequisites

### For Unit/Integration Tests
- No special requirements - tests use CDK assertions library

### For E2E Tests
- CDK stack must be built: `pnpm nx build cdk-emcnotary-core`
- CDK synthesis must succeed: `pnpm nx run cdk-emcnotary-core:synth`
- Feature flag must be set: `FEATURE_CDK_EMCNOTARY_STACKS_ENABLED=1`

### For CloudFormation Validation (Optional)
- AWS CLI installed and configured
- AWS credentials available
- `aws cloudformation validate-template` command available

## Test Coverage Requirements

Based on comprehensive testing strategy:
- **Unit Tests**: ≥80% coverage (construct validation, resource properties)
- **Integration Tests**: ≥75% coverage (cross-resource dependencies)
- **E2E Tests**: Key deployment validation scenarios

## Known Issues

### Babel Core Dependency (pnpm/Jest Compatibility)
If you encounter `Cannot find module '@babel/core'` errors:

**Root Cause**: Jest's `jest-snapshot` module requires `@babel/core` at module load time, but pnpm's strict dependency isolation prevents it from being resolved even with hoisting.

**Current Configuration**:
- ✅ `@babel/core` is installed in `package.json` (^7.28.5)
- ✅ `.npmrc` configured with `shamefully-hoist=true` and hoisting patterns
- ✅ Jest config disables snapshot serializers

**Resolution Steps**:

1. **Ensure pnpm install completed**:
   ```bash
   pnpm install
   # Confirm when prompted to recreate modules directory
   ```

2. **Verify babel is accessible**:
   ```bash
   ls -la node_modules/@babel/core
   node -e "require('@babel/core'); console.log('OK')"
   ```

3. **If still failing, try manual hoisting**:
   ```bash
   # Remove node_modules and reinstall
   rm -rf node_modules
   pnpm install
   ```

4. **Alternative: Use Vitest** (like `libs/infra/naming`):
   - Vitest doesn't require babel
   - Already installed in workspace
   - Better ESM support
   - Would require migrating test files from Jest to Vitest

**Note**: This is a known pnpm/Jest compatibility issue. The test files are correct; this is purely an environment configuration problem.

## Test Organization

```
apps/cdk-emc-notary/core/
├── src/
│   ├── __tests__/              # Unit tests
│   │   └── stacks/
│   │       └── core-stack.spec.ts
│   ├── __it__/                 # Integration tests
│   │   ├── resource-integration.spec.ts
│   │   └── parameter-resolution.spec.ts
│   └── stacks/
│       └── core-stack.ts
├── tests/
│   └── e2e/                    # End-to-end tests
│       ├── cdk-validation.e2e.test.ts
│       └── deployment-smoke.e2e.test.ts
├── jest.config.ts
└── tsconfig.spec.json
```

## What Tests Validate

### Unit Tests
- ✅ SES email identity creation with DKIM
- ✅ S3 bucket encryption and versioning
- ✅ Lambda function configurations
- ✅ IAM role permissions
- ✅ SSM parameter creation
- ✅ CloudWatch log group setup
- ✅ Stack outputs

### Integration Tests
- ✅ Cross-resource references (EIP → reverse DNS)
- ✅ Lambda environment variables
- ✅ SSM parameter value sources
- ✅ Output value references
- ✅ Custom resource dependencies

### E2E Tests
- ✅ CloudFormation template generation
- ✅ Template structure validation
- ✅ Required outputs presence
- ✅ Resource count validation
- ✅ Parameter validation
- ✅ CDK diff execution

## CI/CD Integration

Tests should run in CI pipeline:

```yaml
- name: Test CDK Core Stack
  run: |
    pnpm nx test cdk-emcnotary-core
    pnpm nx run cdk-emcnotary-core:synth
```

## Troubleshooting

### Tests fail with "Cannot find module"
- Ensure dependencies are installed: `pnpm install`
- Check that `@babel/core` is in `package.json`
- Verify `.npmrc` has hoisting configuration

### E2E tests fail
- Ensure CDK stack is built: `pnpm nx build cdk-emcnotary-core`
- Run synthesis manually: `pnpm nx run cdk-emcnotary-core:synth`
- Check that `FEATURE_CDK_EMCNOTARY_STACKS_ENABLED=1` is set

### Template validation fails
- Check AWS credentials are configured
- Verify AWS CLI is installed: `aws --version`
- Ensure CloudFormation service is accessible

