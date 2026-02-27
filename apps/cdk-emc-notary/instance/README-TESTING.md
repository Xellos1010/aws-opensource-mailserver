# CDK Instance Stack Testing Guide

## Scope

The instance app now owns **launch-time infrastructure only**:
- EC2 instance, security group, IAM profile/role, key pair, EIP association
- bootstrap/user-data placeholders
- SSM metadata publication for downstream stacks

Observability and maintenance automation (nightly reboot, recovery lambdas, EventBridge schedules, emergency alarms) is owned by:
- `apps/cdk-emc-notary/observability-maintenance`

## Test Structure

### Unit (`src/__tests__/`)
- `main.spec.ts`
- `stacks/instance-stack.spec.ts`

### Integration (`src/__it__/`)
- `ssm-parameter-resolution.integration.spec.ts`
- `resource-integration.integration.spec.ts`
- `instance-observability-handoff.integration.spec.ts`

### E2E (`tests/e2e/`)
- `build-validation.e2e.test.ts`
- `cdk-validation.e2e.test.ts`
- `deploy-validation.e2e.test.ts`
- `deploy-schedule-validation.e2e.test.ts` (boundary test: verifies no schedule/lambda in instance stack)
- `destroy-validation.e2e.test.ts`
- `deployment-smoke.e2e.test.ts`
- `bootstrap.e2e.test.ts`

## Run Commands

```bash
pnpm nx test cdk-emcnotary-instance
pnpm nx run cdk-emcnotary-instance:test:unit
pnpm nx run cdk-emcnotary-instance:test:integration
pnpm nx run cdk-emcnotary-instance:test:e2e
pnpm nx run cdk-emcnotary-instance:test:no-deploy
pnpm nx run cdk-emcnotary-instance:test:bootstrap
```

## Observability Tests

For reboot/recovery/manual observability checks, use the observability app:

```bash
pnpm nx test cdk-emcnotary-observability-maintenance
```

Manual reboot diagnostics:
- `apps/cdk-emc-notary/observability-maintenance/tests/e2e/README-LAMBDA-TEST.md`
- `apps/cdk-emc-notary/observability-maintenance/tests/e2e/test-lambda-reboot.sh`
