# EMC Notary CDK Stacks - Feature Flag Documentation

## Overview

The EMC Notary mailserver infrastructure has been split into two CDK stacks for better separation of concerns and lifecycle management:

- **Core Stack**: SES, S3, SNS, CloudWatch, Lambda, SSM Parameters (deployed once, rarely changed)
- **Instance Stack**: EC2, Security Groups, EIP, Key Pair, IAM (frequent lifecycle operations)

## Feature Flag

**Flag Name**: `FEATURE_CDK_EMCNOTARY_STACKS_ENABLED`

**Default Value**: `0` (disabled)

**Purpose**: Controls whether the new CDK stack-based deployment is enabled. When disabled, the archived bash scripts remain the primary deployment method.

## Enabling the Feature

Set the environment variable before running CDK commands:

```bash
export FEATURE_CDK_EMCNOTARY_STACKS_ENABLED=1
```

Or inline:

```bash
FEATURE_CDK_EMCNOTARY_STACKS_ENABLED=1 pnpm nx run cdk-emcnotary-core:deploy
```

## Deployment Workflow

### Prerequisites

1. AWS credentials configured (via MFA flow or AWS CLI)
2. CDK bootstrap completed for the target account/region
3. Feature flag enabled (`FEATURE_CDK_EMCNOTARY_STACKS_ENABLED=1`)

### Step 1: Deploy Core Stack

```bash
CDK_DEFAULT_ACCOUNT=<account-id> \
CDK_DEFAULT_REGION=us-east-1 \
FEATURE_CDK_EMCNOTARY_STACKS_ENABLED=1 \
pnpm nx run cdk-emcnotary-core:deploy
```

This creates:
- SES domain identity with DKIM (no Route53 hosted zone - uses domain name directly)
- S3 buckets (backup and nextcloud)
- SNS alarms topic
- CloudWatch log group and agent configuration
- SES SMTP credentials Lambda function
- SSM parameters for instance stack consumption

### Step 2: Deploy Instance Stack

```bash
CDK_DEFAULT_ACCOUNT=<account-id> \
CDK_DEFAULT_REGION=us-east-1 \
FEATURE_CDK_EMCNOTARY_STACKS_ENABLED=1 \
pnpm nx run cdk-emcnotary-instance:deploy
```

This creates:
- EC2 instance (t3a.small)
- Security groups
- Elastic IP
- IAM role/profile
- User data (placeholder for Mail-in-a-Box)

## Rollback Procedure

If instance stack deployment fails:

1. **Destroy instance stack only** (core remains intact):
   ```bash
   pnpm nx run cdk-emcnotary-instance:destroy
   ```

2. **Fix issues and redeploy**:
   ```bash
   pnpm nx run cdk-emcnotary-instance:deploy
   ```

3. **If core stack needs rollback**:
   ```bash
   pnpm nx run cdk-emcnotary-core:destroy
   ```
   ⚠️ **Warning**: This will delete Route53 zone, SES identity, and S3 buckets (if not protected by retention policies).

## Migration from Archive Scripts

The archived scripts in `archive/` remain functional and are the primary deployment method until feature parity is achieved.

### Script Mapping

| Archive Script | CDK/Nx Equivalent |
|----------------|-------------------|
| `deploy-stack.sh` | `nx run cdk-emcnotary-core:deploy` + `nx run cdk-emcnotary-instance:deploy` |
| `describe-stack.sh` | `nx run ops-runner:cfn:outputs -- <stack-name>` |
| `delete-stack.sh` | `nx run cdk-emcnotary-*:destroy` |

## SSM Parameters

The core stack creates these SSM parameters consumed by the instance stack:

- `/emcnotary/core/domainName` - Domain name for mail server
- `/emcnotary/core/backupBucket` - S3 Backup Bucket Name
- `/emcnotary/core/nextcloudBucket` - S3 Nextcloud Bucket Name
- `/emcnotary/core/alarmsTopicArn` - SNS Alarms Topic ARN
- `/emcnotary/core/sesIdentityArn` - SES Email Identity ARN

## Local-Only Workflow

This feature is **local-only** - no GitHub Actions integration. All deployment operations are performed locally via Nx tasks.

## Next Steps (Post-Initial Deploy)

- [ ] Add EC2 userData/MiaB bootstrap script
- [ ] Set reverse DNS for EIP (instance-scope)
- [ ] SES DNS record printers as ops-runner commands
- [ ] Optional Route53 automation in core
- [ ] More granular IAM policies
- [ ] Replace default VPC with dedicated VPC if needed

