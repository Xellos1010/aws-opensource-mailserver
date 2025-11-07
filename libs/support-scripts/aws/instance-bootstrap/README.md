# Instance Bootstrap Library

Generalized instance bootstrap pipeline for Mail-in-a-Box (MIAB) setup via SSM RunCommand.

## Overview

This library provides a reusable, idempotent way to bootstrap Mail-in-a-Box instances on EC2. It:

- Discovers instances via CloudFormation stack outputs
- Reads configuration from core SSM parameters
- Ships and executes MIAB setup script via SSM RunCommand
- Supports dry-run mode for validation
- Logs to CloudWatch for observability
- Is safe to re-run (idempotent)

## Architecture

```
┌─────────────────┐
│  CLI Runner     │
│  (tools/)       │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Bootstrap Lib  │
│  (this lib)     │
└────────┬────────┘
         │
         ├──► CloudFormation (DescribeStacks)
         ├──► SSM Parameter Store (GetParameters)
         └──► SSM RunCommand (SendCommand)
                  │
                  ▼
         ┌─────────────────┐
         │  EC2 Instance   │
         │  (MIAB Setup)    │
         └─────────────────┘
```

## Usage

### Via Nx Task (Recommended)

```bash
# Bootstrap default domain (emcnotary.com)
FEATURE_INSTANCE_BOOTSTRAP_ENABLED=1 DOMAIN=emcnotary.com \
  pnpm nx run ops-runner:instance:bootstrap

# Dry run
FEATURE_INSTANCE_BOOTSTRAP_ENABLED=1 DOMAIN=emcnotary.com DRY_RUN=1 \
  pnpm nx run ops-runner:instance:bootstrap

# Different domain
FEATURE_INSTANCE_BOOTSTRAP_ENABLED=1 DOMAIN=askdaokapra.com \
  pnpm nx run ops-runner:instance:bootstrap
```

### Programmatic API

```typescript
import { bootstrapInstance } from '@mm/support-scripts-aws-instance-bootstrap';

await bootstrapInstance({
  domain: 'emcnotary.com',
  region: 'us-east-1',
  profile: 'hepe-admin-mfa',
  dryRun: false,
  restorePrefix: 'i-1234567890abcdef0',
  rebootAfterSetup: false,
});
```

## Configuration

### BootstrapOptions

```typescript
interface BootstrapOptions {
  domain?: string;           // Domain name (e.g., "emcnotary.com")
  stackName?: string;        // Explicit stack name (overrides domain-derived)
  region?: string;           // AWS region (default: "us-east-1")
  profile?: string;          // AWS profile for credentials
  dryRun?: boolean;          // Show what would be done without executing
  restorePrefix?: string;    // S3 prefix for backup restoration
  rebootAfterSetup?: boolean; // Reboot after setup (default: false)
  featureFlagEnv?: string;   // Feature flag env var name
}
```

### Stack Name Resolution

If `stackName` is not provided, it's derived from `domain`:
- `emcnotary.com` → `emcnotary-com-mailserver-instance`
- `askdaokapra.com` → `askdaokapra-com-mailserver-instance`

### Required Stack Outputs

The instance stack must provide these CloudFormation outputs:
- `InstanceId` - EC2 instance ID
- `InstanceDnsName` or `InstanceDns` - Instance DNS name
- `DomainName` - Domain name
- `KeyPairId` - EC2 Key Pair ID (optional)

### Required SSM Parameters

The core stack must provide these SSM parameters under `/emcnotary/core/`:
- `domainName` - Domain name
- `backupBucket` - S3 backup bucket name
- `nextcloudBucket` - S3 Nextcloud bucket name
- `alarmsTopicArn` - SNS alarms topic ARN
- `sesIdentityArn` - SES identity ARN (optional)
- `eipAllocationId` - Elastic IP allocation ID (optional)

## MIAB Setup Script

The bootstrap script (`assets/miab-setup.sh`) performs:

1. **System Updates** - Package updates and prerequisites
2. **Swap Configuration** - Creates swap file if needed
3. **Service Limits** - Configures memory limits for MIAB services
4. **Admin Password** - Generates and stores in SSM
5. **MIAB Installation** - Clones and checks out Mail-in-a-Box
6. **Backup Restore** - Optional restore from S3 backup
7. **SES Relay** - Configures Postfix for SES SMTP relay
8. **DNS Resolver** - Configures localhost DNS resolver
9. **Duplicity** - Installs via snap for backups
10. **Cleanup** - Removes sensitive cloud-init files

All steps are **idempotent** - safe to re-run.

## Error Handling

The library implements:
- **Retry Logic** - Exponential backoff for AWS API calls (3 attempts)
- **Status Polling** - Polls SSM command status until completion
- **Timeout Protection** - 1 hour max wait time
- **Clear Error Messages** - Actionable error messages with context

## Observability

- **CloudWatch Logs** - SSM command output goes to `/aws/ssm/miab-bootstrap`
- **Local Logging** - Script logs to `/var/log/mailinabox_setup.log` on instance
- **Status Updates** - Real-time status updates during execution

## Feature Flag

Bootstrap is controlled by `FEATURE_INSTANCE_BOOTSTRAP_ENABLED`:
- **Unset or "1"** - Enabled (default)
- **"0"** - Disabled

## Security

- **No Secrets Logged** - SSM parameter names only, never values
- **Server-Side Secrets** - Secrets fetched on instance, not in CLI
- **IAM Permissions** - Instance role must allow SSM parameter access
- **CloudWatch Logs** - Sensitive data redacted in dry-run mode

## Testing

```bash
# Build the library
pnpm nx build support-scripts-aws-instance-bootstrap

# Dry run (no actual execution)
FEATURE_INSTANCE_BOOTSTRAP_ENABLED=1 DOMAIN=emcnotary.com DRY_RUN=1 \
  pnpm nx run ops-runner:instance:bootstrap
```

## Related Documentation

- [Local Operations Guide](../../../../../docs/LOCAL-OPS.md)
- [CDK Stacks Summary](../../../../../docs/CDK_STACKS_SUMMARY.md)
- [Instance Stack README](../../../../../apps/cdk-emcnotary-instance/README.md)
