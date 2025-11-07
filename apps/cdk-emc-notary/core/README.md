# EMC Notary Core Stack

Core infrastructure stack for EMC Notary mailserver. This stack contains shared resources that are deployed once and rarely changed.

## Resources

- **SES**: Domain identity with DKIM signing enabled (no Route53 hosted zone - uses domain name directly)
- **S3 Buckets**: Backup and Nextcloud buckets with encryption and versioning
- **SNS**: Alarms topic for CloudWatch notifications
- **CloudWatch**: Log group for syslog, agent configuration
- **Lambda**: SES SMTP credentials generator function
- **SSM Parameters**: Shared values exported for instance stack consumption

## SSM Parameters Created

- `/emcnotary/core/domainName` - Domain name for mail server
- `/emcnotary/core/backupBucket` - S3 Backup Bucket Name
- `/emcnotary/core/nextcloudBucket` - S3 Nextcloud Bucket Name
- `/emcnotary/core/alarmsTopicArn` - SNS Alarms Topic ARN
- `/emcnotary/core/sesIdentityArn` - SES Email Identity ARN

## Usage

### Build

```bash
pnpm nx build cdk-emcnotary-core
```

### Synthesize CloudFormation Template

```bash
CDK_DEFAULT_ACCOUNT=<account-id> CDK_DEFAULT_REGION=us-east-1 \
  pnpm nx run cdk-emcnotary-core:synth
```

### Deploy

```bash
CDK_DEFAULT_ACCOUNT=<account-id> CDK_DEFAULT_REGION=us-east-1 \
  pnpm nx run cdk-emcnotary-core:deploy
```

### Diff (Preview Changes)

```bash
CDK_DEFAULT_ACCOUNT=<account-id> CDK_DEFAULT_REGION=us-east-1 \
  pnpm nx run cdk-emcnotary-core:diff
```

### Destroy

```bash
CDK_DEFAULT_ACCOUNT=<account-id> CDK_DEFAULT_REGION=us-east-1 \
  pnpm nx run cdk-emcnotary-core:destroy
```

## Dependencies

This stack must be deployed **before** the instance stack, as the instance stack reads SSM parameters created by this stack.

## Feature Flag

This stack is controlled by `FEATURE_CDK_EMCNOTARY_STACKS_ENABLED` (default: `0`). Set to `1` to enable deployment.

