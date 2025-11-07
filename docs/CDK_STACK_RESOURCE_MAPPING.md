# CDK Stack Resource Mapping

This document maps resources from the monolithic CloudFormation template (`mailserver-infrastructure-mvp.yaml`) to the new two-stack CDK architecture.

## Core Stack (`cdk-emcnotary-core`)

### Resources Deployed

| CloudFormation Resource | CDK Resource | Notes |
|------------------------|--------------|-------|
| `SESEmailIdentity` | `ses.EmailIdentity` | Domain identity with DKIM, no Route53 hosted zone |
| `BackupBucket` | `s3.Bucket` | `{domain}-backup` with encryption & versioning |
| `NextcloudBucket` | `s3.Bucket` | `{domain}-nextcloud` with encryption & versioning |
| `AlertTopic` | `sns.Topic` | SNS topic for CloudWatch alarms |
| `SyslogGroup` | `logs.LogGroup` | CloudWatch log group for syslog |
| `CWAgentConfigParam` | `ssm.StringParameter` | CloudWatch Agent configuration |
| `SmtpLambdaFunction` | `lambda.Function` | Generates SES SMTP credentials |
| `SmtpLambdaExecutionRole` | `iam.Role` | Lambda execution role |
| `SmtpUser` | ❌ Not in core | Will be added when SES relay is fully implemented |
| `SmtpUserGroup` | ❌ Not in core | Will be added when SES relay is fully implemented |
| `SmtpUserAccessKey` | ❌ Not in core | Will be added when SES relay is fully implemented |
| `SmtpPassword` (Custom) | ❌ Not in core | Will be added when SES relay is fully implemented |
| `SmtpUsername` (Custom) | ❌ Not in core | Will be added when SES relay is fully implemented |

### SSM Parameters Created

- `/emcnotary/core/domainName` - Domain name
- `/emcnotary/core/backupBucket` - Backup bucket name
- `/emcnotary/core/nextcloudBucket` - Nextcloud bucket name
- `/emcnotary/core/alarmsTopicArn` - SNS alarms topic ARN
- `/emcnotary/core/sesIdentityArn` - SES identity ARN

### CloudFormation Parameters

- `DomainName` - Domain name (default: `emcnotary.com`)

## Instance Stack (`cdk-emcnotary-instance`)

### Resources Deployed

| CloudFormation Resource | CDK Resource | Notes |
|------------------------|--------------|-------|
| `EC2Instance` | `ec2.Instance` | Ubuntu AMI from SSM parameter, t2.micro default |
| `ElasticIP` | `ec2.CfnEIP` | VPC domain, tagged with MAILSERVER |
| `InstanceEIPAssociation` | `ec2.CfnEIPAssociation` | Associates EIP with instance |
| `NewKeyPair` | `ec2.CfnKeyPair` | `{domain}-keypair` |
| `InstanceSecurityGroup` | `ec2.SecurityGroup` | All mail server ports (22, 25, 53, 80, 443, 143, 993, 465, 587, 4190) |
| `InstanceRole` | `iam.Role` | EC2 instance role with S3 and SSM permissions |
| `InstanceProfile` | `iam.CfnInstanceProfile` | Instance profile for EC2 |

### SSM Parameters Consumed (from Core Stack)

- `/emcnotary/core/domainName`
- `/emcnotary/core/backupBucket`
- `/emcnotary/core/nextcloudBucket`
- `/emcnotary/core/alarmsTopicArn`

### CloudFormation Parameters

- `InstanceType` - EC2 instance type (default: `t2.micro`)
- `InstanceDns` - DNS name within domain (default: `box`)

### IAM Policies (Matching CloudFormation)

- **BackupS3BucketAccessMIAB**: Full S3 access to backup bucket
- **NextCloudS3Policy**: Full S3 access to Nextcloud bucket
- **SsmParameterAccessSmtpCredentials**: Read SMTP credentials from SSM
- **SsmParameterAccessCore**: Read core stack SSM parameters

## Resources Not Yet Migrated

These CloudFormation resources are not yet implemented in CDK stacks but are planned:

### Core Stack (Future)

- `SmtpUser` / `SmtpUserGroup` / `SmtpUserAccessKey` - SES SMTP user for relay
- `SmtpPassword` / `SmtpUsername` Custom Resources - SMTP credential generation
- CloudWatch Alarms (`MemHighAlarm`, `SwapHighAlarm`, `OOMKillAlarm`) - Will be added when instance stack deploys
- `CWAgentAssociation` - SSM association for CloudWatch agent (instance-specific)

### Instance Stack (Future)

- `NightlyRebootLambdaFunction` - Lambda for scheduled reboots
- `NightlyRebootEventRule` - EventBridge rule for reboot schedule
- `NightlyRebootLambdaRole` - Lambda execution role
- `MailInABoxAdminPasswordSsmParameter` - Admin password storage
- User Data script - Full Mail-in-a-Box installation and configuration

## Deployment Order

1. **Deploy Core Stack First**
   ```bash
   CDK_DEFAULT_ACCOUNT=<account> CDK_DEFAULT_REGION=us-east-1 \
     pnpm nx run cdk-emcnotary-core:deploy
   ```

2. **Deploy Instance Stack Second** (reads SSM params from core)
   ```bash
   CDK_DEFAULT_ACCOUNT=<account> CDK_DEFAULT_REGION=us-east-1 \
     pnpm nx run cdk-emcnotary-instance:deploy
   ```

## Migration Notes

- **No Route53 Hosted Zone**: The CDK stacks do not create a Route53 hosted zone. SES uses domain name directly for verification.
- **SES Verification**: DNS records for SES verification must be added manually to your existing DNS provider.
- **Stack Isolation**: Instance stack can be destroyed/recreated independently without affecting core stack.
- **SSM Parameter Dependency**: Instance stack will fail to synth if core stack SSM parameters don't exist (expected behavior).

