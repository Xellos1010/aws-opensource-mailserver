# EMC Notary Instance Stack

Instance infrastructure stack for EMC Notary mailserver. This stack contains EC2 instance and related compute resources.

## Resources

- **EC2 Instance**: t3a.small instance for Mail-in-a-Box
- **Security Group**: Rules for SSH (22), SMTP (25), HTTPS (443), Submission (587)
- **Elastic IP**: Static IP address for the mail server
- **IAM Role**: Instance role with SSM access and SSM parameter read permissions
- **User Data**: Bootstrap script (placeholder for Mail-in-a-Box installation)

## Dependencies

This stack **requires** the core stack to be deployed first, as it reads SSM parameters:
- `/emcnotary/core/zoneId`
- `/emcnotary/core/zoneName`
- `/emcnotary/core/backupBucket`
- `/emcnotary/core/alarmsTopicArn`

## Usage

### Build

```bash
pnpm nx build cdk-emcnotary-instance
```

### Synthesize CloudFormation Template

```bash
CDK_DEFAULT_ACCOUNT=<account-id> CDK_DEFAULT_REGION=us-east-1 \
  pnpm nx run cdk-emcnotary-instance:synth
```

### Deploy

```bash
CDK_DEFAULT_ACCOUNT=<account-id> CDK_DEFAULT_REGION=us-east-1 \
  pnpm nx run cdk-emcnotary-instance:deploy
```

### Diff (Preview Changes)

```bash
CDK_DEFAULT_ACCOUNT=<account-id> CDK_DEFAULT_REGION=us-east-1 \
  pnpm nx run cdk-emcnotary-instance:diff
```

### Destroy

```bash
CDK_DEFAULT_ACCOUNT=<account-id> CDK_DEFAULT_REGION=us-east-1 \
  pnpm nx run cdk-emcnotary-instance:destroy
```

## Rollback

If deployment fails, you can destroy only the instance stack without affecting the core stack:

```bash
pnpm nx run cdk-emcnotary-instance:destroy
```

The core stack remains intact and can be reused for a new instance deployment.

## Feature Flag

This stack is controlled by `FEATURE_CDK_EMCNOTARY_STACKS_ENABLED` (default: `0`). Set to `1` to enable deployment.

