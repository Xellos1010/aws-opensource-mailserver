# K3 Frame Core Stack

Core infrastructure stack for K3 Frame mailserver. This stack contains shared resources that are deployed once and rarely changed.

## Stack Naming

This stack uses canonical naming via `@mm/infra-naming`:
- **Stack Name**: `k3-frame-com-mailserver-core` (format: `{domain-tld}-mailserver-core`)
- Stack name is automatically derived from the `DOMAIN` environment variable or CDK context

See [ADR-001: Infrastructure Naming Standard](../../docs/adr/001-infra-naming-standard.md) for details.

## Resources

- **SES**: Domain identity with DKIM signing enabled (no Route53 hosted zone - uses domain name directly)
- **S3 Buckets**: Backup and Nextcloud buckets with encryption and versioning
- **SNS**: Alarms topic for CloudWatch notifications
- **CloudWatch**: Log group for syslog, agent configuration
- **Lambda**: SES SMTP credentials generator function
- **SSM Parameters**: Shared values exported for instance stack consumption

## SSM Parameters Created

- `/k3-frame/core/domainName` - Domain name for mail server
- `/k3-frame/core/backupBucket` - S3 Backup Bucket Name
- `/k3-frame/core/nextcloudBucket` - S3 Nextcloud Bucket Name
- `/k3-frame/core/alarmsTopicArn` - SNS Alarms Topic ARN
- `/k3-frame/core/sesIdentityArn` - SES Email Identity ARN

## Usage

### AWS Profile

All Nx targets in this project default to `AWS_PROFILE=k3frame` for synth/diff/deploy/destroy and admin/test commands. Override by setting `AWS_PROFILE` explicitly if needed.

### Build

```bash
pnpm nx build cdk-k3frame-core
```

### Synthesize CloudFormation Template

```bash
CDK_DEFAULT_ACCOUNT=<account-id> CDK_DEFAULT_REGION=us-east-1 \
  pnpm nx run cdk-k3frame-core:synth
```

### Deploy

```bash
CDK_DEFAULT_ACCOUNT=<account-id> CDK_DEFAULT_REGION=us-east-1 \
  pnpm nx run cdk-k3frame-core:deploy
```

### Diff (Preview Changes)

```bash
CDK_DEFAULT_ACCOUNT=<account-id> CDK_DEFAULT_REGION=us-east-1 \
  pnpm nx run cdk-k3frame-core:diff
```

### Destroy

```bash
CDK_DEFAULT_ACCOUNT=<account-id> CDK_DEFAULT_REGION=us-east-1 \
  pnpm nx run cdk-k3frame-core:destroy
```

## Dependencies

This stack must be deployed **before** the instance stack, as the instance stack reads SSM parameters created by this stack.

## Feature Flag

This stack is controlled by `FEATURE_CDK_K3FRAME_STACKS_ENABLED` (default: `0`). Set to `1` to enable deployment.
