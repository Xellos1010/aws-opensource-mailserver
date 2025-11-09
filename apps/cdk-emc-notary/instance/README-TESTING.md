# CDK Instance Stack Testing Guide

## Test Structure

This project follows the comprehensive testing strategy with three layers:

### Unit Tests (`src/__tests__/`)
- **main.spec.ts**: Tests entry point domain/context resolution, instance config, stack name derivation
- **stacks/instance-stack.spec.ts**: Tests individual CDK construct resources and properties
- Validates CloudFormation template generation
- Tests resource configurations (EC2, Security Group, IAM, Lambda, EventBridge, etc.)

### Integration Tests (`src/__it__/`)
- **ssm-parameter-resolution.integration.spec.ts**: Tests SSM parameter dependencies from core stack
- **resource-integration.integration.spec.ts**: Tests cross-resource dependencies
- **nightly-reboot-integration.integration.spec.ts**: Tests reboot system integration
- Validates resource relationships and references

### E2E Tests (`tests/e2e/`)
- **build-validation.e2e.test.ts**: Tests build operation
- **cdk-validation.e2e.test.ts**: Tests actual CDK synthesis
- **deploy-validation.e2e.test.ts**: Tests deploy readiness (requires core stack deployed)
- **destroy-validation.e2e.test.ts**: Tests destroy operation
- **deployment-smoke.e2e.test.ts**: Tests template validation
- **bootstrap.e2e.test.ts**: Tests SSM bootstrap (requires deployed stack)
- **reboot-event.e2e.test.ts**: Tests EventBridge reboot (requires deployed stack)

## Running Tests

### Run All Tests
```bash
pnpm nx test cdk-emcnotary-instance
```

### Run Unit Tests Only
```bash
pnpm nx run cdk-emcnotary-instance:test:unit
```

### Run Integration Tests Only
```bash
pnpm nx run cdk-emcnotary-instance:test:integration
```

### Run E2E Tests (No Deploy Required)
```bash
pnpm nx run cdk-emcnotary-instance:test:no-deploy
```

### Run All E2E Tests
```bash
pnpm nx run cdk-emcnotary-instance:test:e2e
```

### Run Bootstrap E2E Tests (Requires Deployed Stack)
```bash
pnpm nx run cdk-emcnotary-instance:test:bootstrap
```

### Run Reboot E2E Tests (Requires Deployed Stack)
```bash
pnpm nx run cdk-emcnotary-instance:test:reboot
```

### Run with Coverage
```bash
pnpm nx test cdk-emcnotary-instance --coverage
```

## Prerequisites

### For Unit/Integration Tests
- No special requirements - tests use CDK assertions library
- Tests mock SSM parameters from core stack

### For E2E Tests (No Deploy)
- CDK stack must be built: `pnpm nx build cdk-emcnotary-instance`
- CDK synthesis must succeed: `pnpm nx run cdk-emcnotary-instance:synth`
- Feature flag must be set: `FEATURE_CDK_EMCNOTARY_STACKS_ENABLED=1`

### For E2E Tests (Requires Deploy)
- **Core stack deployed**: Required for SSM parameters
- **Instance stack deployed**: Required for bootstrap and reboot tests
- **AWS credentials**: Required for AWS API calls
- **Instance running**: Required for SSM access and reboot tests

### For CloudFormation Validation (Optional)
- AWS CLI installed and configured
- AWS credentials available
- `aws cloudformation validate-template` command available

## Test Coverage Requirements

Based on comprehensive testing strategy:
- **Unit Tests**: ≥80% coverage (construct validation, resource properties)
- **Integration Tests**: ≥75% coverage (cross-resource dependencies)
- **E2E Tests**: Key deployment validation scenarios

## Test Suites

### Unit Tests (`src/__tests__/`)
- ✅ `main.spec.ts` - Entry point domain/context resolution
- ✅ `stacks/instance-stack.spec.ts` - Stack resource validation

### Integration Tests (`src/__it__/`)
- ✅ `ssm-parameter-resolution.integration.spec.ts` - SSM parameter dependencies
- ✅ `resource-integration.integration.spec.ts` - Cross-resource dependencies
- ✅ `nightly-reboot-integration.integration.spec.ts` - Reboot system integration

### E2E Tests (`tests/e2e/`)
- ✅ `build-validation.e2e.test.ts` - Build operation validation
- ✅ `cdk-validation.e2e.test.ts` - CDK synthesis validation
- ✅ `deploy-validation.e2e.test.ts` - Deploy readiness validation
- ✅ `destroy-validation.e2e.test.ts` - Destroy operation validation
- ✅ `deployment-smoke.e2e.test.ts` - Template validation
- ⚠️ `bootstrap.e2e.test.ts` - Requires deployed stack and AWS credentials
- ⚠️ `reboot-event.e2e.test.ts` - Requires deployed stack and AWS credentials

## Test Execution Order

### Recommended Test Flow

1. **Unit Tests** (no dependencies)
   ```bash
   pnpm nx run cdk-emcnotary-instance:test:unit
   ```

2. **Integration Tests** (no dependencies, mocks SSM parameters)
   ```bash
   pnpm nx run cdk-emcnotary-instance:test:integration
   ```

3. **E2E Tests (No Deploy)** (requires build/synth)
   ```bash
   pnpm nx run cdk-emcnotary-instance:test:no-deploy
   ```

4. **Deploy Stack** (manual step)
   ```bash
   # Ensure core stack is deployed first
   pnpm nx run cdk-emcnotary-core:deploy
   
   # Deploy instance stack
   pnpm nx run cdk-emcnotary-instance:deploy
   ```

5. **E2E Tests (Requires Deploy)** (after deployment)
   ```bash
   # Bootstrap tests
   pnpm nx run cdk-emcnotary-instance:test:bootstrap
   
   # Reboot tests
   pnpm nx run cdk-emcnotary-instance:test:reboot
   ```

## What Tests Validate

### Unit Tests
- ✅ EC2 Instance properties (AMI, instance type, VPC, subnet, security group, IAM role, key pair, block devices, tags)
- ✅ Security Group rules (all mail server ports: SSH 22, DNS 53, HTTP 80, HTTPS 443, SMTP 25, IMAP 143/993, SMTPS 465, Submission 587, Sieve 4190)
- ✅ IAM Role permissions (SSM, S3, SSM parameter read)
- ✅ Key Pair creation with correct name and tags
- ✅ EIP Association with correct allocation ID
- ✅ UserData content validation
- ✅ Nightly Reboot Lambda function (runtime, permissions, environment variables)
- ✅ Nightly Reboot EventBridge rule (schedule, enabled, target)
- ✅ CloudFormation Parameters (InstanceType, InstanceDns)
- ✅ CloudFormation Outputs (all 10 outputs)

### Integration Tests
- ✅ SSM parameter resolution from core stack (domainName, backupBucket, nextcloudBucket, alarmsTopicArn, eipAllocationId)
- ✅ Multi-domain support via coreParamPrefix
- ✅ EIP Association references EIP allocation ID from SSM parameter
- ✅ EC2 Instance uses security group from shared construct
- ✅ EC2 Instance uses IAM role from shared construct
- ✅ IAM role has correct S3 bucket permissions
- ✅ IAM role has correct SSM parameter read permissions
- ✅ Nightly Reboot Lambda references correct instance ID
- ✅ Nightly Reboot EventBridge rule targets Lambda function
- ✅ All outputs reference correct resource attributes

### E2E Tests
- ✅ CloudFormation template generation
- ✅ Template structure validation
- ✅ Required outputs presence (10 outputs)
- ✅ Resource count validation (>10 resources)
- ✅ Parameter validation (InstanceType, InstanceDns)
- ✅ CDK diff execution
- ✅ Deploy command structure validation
- ✅ Destroy command structure validation
- ✅ Core stack SSM parameter prerequisite check
- ⚠️ Bootstrap command execution (requires deployed stack)
- ⚠️ Reboot Lambda execution (requires deployed stack)

## Core Stack Dependencies

The instance stack **requires** the core stack to be deployed first, as it reads SSM parameters:

- `/emcnotary/core/domainName`
- `/emcnotary/core/backupBucket`
- `/emcnotary/core/nextcloudBucket`
- `/emcnotary/core/alarmsTopicArn`
- `/emcnotary/core/eipAllocationId`

### Testing Core Stack Dependencies

Integration tests mock these SSM parameters, but E2E tests (`deploy-validation.e2e.test.ts`) verify they exist before deployment.

## Bootstrap E2E Tests

Bootstrap tests validate the SSM-based Mail-in-a-Box setup process:

1. **Instance SSM Access**: Verifies instance is running and accessible via SSM
2. **Bootstrap Command Discovery**: Verifies bootstrap discovers instance via CloudFormation outputs
3. **Core SSM Parameters**: Verifies bootstrap reads core SSM parameters correctly
4. **Bootstrap Execution**: Verifies bootstrap sends SSM RunCommand successfully
5. **Bootstrap Logs**: Verifies bootstrap logs appear in CloudWatch
6. **Instance Readiness**: Verifies instance is ready for MIAB setup after bootstrap
7. **Idempotency**: Verifies bootstrap is safe to re-run

**Note**: Bootstrap tests require a deployed instance stack and can take 30-60 minutes to complete.

## Reboot E2E Tests

Reboot tests validate the EventBridge-triggered nightly reboot system:

1. **Lambda Function**: Verifies Lambda function exists and has correct configuration
2. **EventBridge Rule**: Verifies EventBridge rule exists, is enabled, and has correct schedule
3. **Manual Trigger**: Verifies Lambda function can be manually triggered (simulates EventBridge event)
4. **Reboot Execution**: Verifies Lambda function successfully reboots instance
5. **CloudWatch Logs**: Verifies Lambda function logs reboot action to CloudWatch
6. **Instance State**: Verifies instance state changes to rebooting after Lambda execution
7. **Error Handling**: Verifies Lambda function handles missing instance gracefully

**Note**: Reboot tests require a deployed instance stack. Manual reboot tests should be run carefully to avoid disrupting the instance.

## Test Organization

```
apps/cdk-emc-notary/instance/
├── src/
│   ├── __tests__/              # Unit tests
│   │   ├── main.spec.ts
│   │   └── stacks/
│   │       └── instance-stack.spec.ts
│   ├── __it__/                 # Integration tests
│   │   ├── ssm-parameter-resolution.integration.spec.ts
│   │   ├── resource-integration.integration.spec.ts
│   │   └── nightly-reboot-integration.integration.spec.ts
│   └── stacks/
│       └── instance-stack.ts
├── tests/
│   └── e2e/                    # End-to-end tests
│       ├── build-validation.e2e.test.ts
│       ├── cdk-validation.e2e.test.ts
│       ├── deploy-validation.e2e.test.ts
│       ├── destroy-validation.e2e.test.ts
│       ├── deployment-smoke.e2e.test.ts
│       ├── bootstrap.e2e.test.ts
│       └── reboot-event.e2e.test.ts
├── jest.config.ts
└── tsconfig.spec.json
```

## CI/CD Integration

Tests should run in CI pipeline:

```yaml
- name: Test CDK Instance Stack
  run: |
    # Unit and integration tests (no dependencies)
    pnpm nx run cdk-emcnotary-instance:test:unit
    pnpm nx run cdk-emcnotary-instance:test:integration
    
    # E2E tests (no deploy required)
    pnpm nx run cdk-emcnotary-instance:test:no-deploy
    
    # CDK synthesis validation
    pnpm nx run cdk-emcnotary-instance:synth
```

**Note**: Bootstrap and reboot E2E tests should be run separately after deployment, not in CI.

## Troubleshooting

### Tests fail with "Cannot find module"
- Ensure dependencies are installed: `pnpm install`
- Check that `@babel/core` is in `package.json`
- Verify `.npmrc` has hoisting configuration

### E2E tests fail
- Ensure CDK stack is built: `pnpm nx build cdk-emcnotary-instance`
- Run synthesis manually: `pnpm nx run cdk-emcnotary-instance:synth`
- Check that `FEATURE_CDK_EMCNOTARY_STACKS_ENABLED=1` is set

### Deploy validation tests fail
- Ensure core stack is deployed: `pnpm nx run cdk-emcnotary-core:deploy`
- Verify core stack SSM parameters exist:
  ```bash
  aws ssm get-parameter --name /emcnotary/core/domainName
  aws ssm get-parameter --name /emcnotary/core/eipAllocationId
  ```

### Bootstrap tests fail
- Ensure instance stack is deployed: `pnpm nx run cdk-emcnotary-instance:deploy`
- Verify instance is running: `aws ec2 describe-instances --instance-ids <instance-id>`
- Verify SSM agent is online: `aws ssm describe-instance-information --instance-ids <instance-id>`
- Wait for instance to fully initialize (may take 5-10 minutes after launch)

### Reboot tests fail
- Ensure instance stack is deployed: `pnpm nx run cdk-emcnotary-instance:deploy`
- Verify Lambda function exists: `aws lambda get-function --function-name <function-name>`
- Verify EventBridge rule is enabled: `aws events describe-rule --name <rule-name>`

### Template validation fails
- Check AWS credentials are configured
- Verify AWS CLI is installed: `aws --version`
- Ensure CloudFormation service is accessible

## Known Issues

### Babel Core Dependency (pnpm/Jest Compatibility)
If you encounter `Cannot find module '@babel/core'` errors:

**Root Cause**: Jest's `jest-snapshot` module requires `@babel/core` at module load time, but pnpm's strict dependency isolation prevents it from being resolved even with hoisting.

**Current Configuration**:
- ✅ `@babel/core` is installed in `package.json`
- ✅ `.npmrc` configured with `shamefully-hoist=true` and hoisting patterns
- ✅ Jest config disables snapshot serializers

**Resolution Steps**:

1. **Ensure pnpm install completed**:
   ```bash
   pnpm install
   ```

2. **Verify babel is accessible**:
   ```bash
   ls -la node_modules/@babel/core
   node -e "require('@babel/core'); console.log('OK')"
   ```

3. **If still failing, try manual hoisting**:
   ```bash
   rm -rf node_modules
   pnpm install
   ```

**Note**: This is a known pnpm/Jest compatibility issue. The test files are correct; this is purely an environment configuration problem.

