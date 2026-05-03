# sample mailserver Core Stack

Core infrastructure stack for sample mailserver mailserver. This stack contains shared resources that are deployed once and rarely changed.

## Stack Naming

This stack uses canonical naming via `@mm/infra-naming`:
- **Stack Name**: `example-com-mailserver-core` (format: `{domain-tld}-mailserver-core`)
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

- `/example/core/domainName` - Domain name for mail server
- `/example/core/backupBucket` - S3 Backup Bucket Name
- `/example/core/nextcloudBucket` - S3 Nextcloud Bucket Name
- `/example/core/alarmsTopicArn` - SNS Alarms Topic ARN
- `/example/core/sesIdentityArn` - SES Email Identity ARN

## Usage

### Build

```bash
pnpm nx build cdk-client-example-core
```

### Synthesize CloudFormation Template

```bash
CDK_DEFAULT_ACCOUNT=<account-id> CDK_DEFAULT_REGION=us-east-1 \
  pnpm nx run cdk-client-example-core:synth
```

### Deploy

```bash
CDK_DEFAULT_ACCOUNT=<account-id> CDK_DEFAULT_REGION=us-east-1 \
  pnpm nx run cdk-client-example-core:deploy
```

### Diff (Preview Changes)

```bash
CDK_DEFAULT_ACCOUNT=<account-id> CDK_DEFAULT_REGION=us-east-1 \
  pnpm nx run cdk-client-example-core:diff
```

### Destroy

```bash
CDK_DEFAULT_ACCOUNT=<account-id> CDK_DEFAULT_REGION=us-east-1 \
  pnpm nx run cdk-client-example-core:destroy
```

## Dependencies

This stack must be deployed **before** the instance stack, as the instance stack reads SSM parameters created by this stack.

## Feature Flag

This stack is controlled by `FEATURE_CDK_EMC_NOTARY_EXAMPLE_STACKS_ENABLED` (default: `0`). Set to `1` to enable deployment.

