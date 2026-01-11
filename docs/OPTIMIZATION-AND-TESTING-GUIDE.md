# Optimization and Testing Guide

## Overview

This guide covers the optimization, stabilization, and end-to-end testing of the EMC Notary mailserver stacks.

## Stack Improvements

### Core Stack Optimizations

1. **SMTP Lambda Improvements**
   - Upgraded Python runtime from 3.8 to 3.11
   - Enhanced error handling with try-catch blocks
   - Improved logging with structured JSON logs
   - Added request ID tracking for better debugging
   - Added validation for required environment variables

2. **Reverse DNS Lambda**
   - Already includes comprehensive error handling
   - Graceful handling of EIP release scenarios
   - Proper cleanup on stack deletion

### Instance Stack Optimizations

1. **Emergency Restart Lambda**
   - Enhanced structured logging (JSON format)
   - Added duration tracking for restart operations
   - Improved error messages with domain context
   - Added CloudWatch Log Group with 1-month retention
   - Better state validation and error handling

2. **CloudWatch Alarms**
   - Instance Status Check Alarm (auto-restart on failure)
   - System Status Check Alarm (auto-restart on failure)
   - OOM Kill Alarm (auto-restart on OOM)
   - Memory High Alarm (alert only)
   - Swap High Alarm (alert only)

## Testing and Validation

### Quick Restore Command

For emcnotary.com, use the quick restore command:

```bash
# Full restore (deploy, restore, test)
pnpm nx run cdk-emcnotary-instance:admin:restore:emcnotary

# Dry run (preview changes)
DRY_RUN=1 pnpm nx run cdk-emcnotary-instance:admin:restore:emcnotary

# Skip deployment (if stacks already exist)
SKIP_DEPLOY=1 pnpm nx run cdk-emcnotary-instance:admin:restore:emcnotary

# Skip restore (test only)
SKIP_RESTORE=1 pnpm nx run cdk-emcnotary-instance:admin:restore:emcnotary

# Skip tests (deploy and restore only)
SKIP_TESTS=1 pnpm nx run cdk-emcnotary-instance:admin:restore:emcnotary
```

### Comprehensive E2E Testing

Use the full test and restore orchestration tool:

```bash
pnpm nx run cdk-emcnotary-instance:admin:test:e2e \
  --mailbox-backup-path=Archive/backups/emcnotary.com/mailboxes/mailboxes-backup-20250923_195631 \
  --dns-backup-path=Archive/backups/emcnotary.com/dns/dns-backup-20250915-120038.json \
  --domain=emcnotary.com
```

### Test Components

The E2E test validates:

1. **Server Services**
   - Postfix service status
   - Dovecot service status
   - Nginx service status
   - Mail-in-a-Box bootstrap completion

2. **Email Connectivity**
   - SMTP (port 25)
   - IMAP (port 143)
   - IMAPS (port 993)
   - HTTPS (port 443)

3. **DNS Records**
   - A record for domain
   - CNAME record for www subdomain

4. **Lambda Functions**
   - Emergency restart Lambda accessibility
   - Function invocation test

5. **CloudWatch Alarms**
   - Instance Status Check alarm exists
   - System Status Check alarm exists
   - OOM Kill alarm exists
   - Memory High alarm exists
   - Swap High alarm exists

6. **Logging**
   - CloudWatch Log Group exists
   - Log group configuration validated

## Deployment Workflow

### 1. Deploy Core Stack

```bash
pnpm nx run cdk-emcnotary-core:deploy
```

This creates:
- Elastic IP with reverse DNS
- SES domain identity
- S3 buckets (backup, nextcloud)
- SNS alarms topic
- CloudWatch log groups
- SSM parameters for shared values

### 2. Deploy Instance Stack

```bash
pnpm nx run cdk-emcnotary-instance:deploy
```

This creates:
- EC2 instance with Mail-in-a-Box
- Security groups
- CloudWatch alarms
- Emergency restart Lambda
- Nightly reboot schedule

### 3. Bootstrap Instance

```bash
pnpm nx run cdk-emcnotary-instance:admin:bootstrap-miab-ec2-instance
```

This:
- Waits for instance to be ready
- Runs Mail-in-a-Box setup via SSM
- Creates admin account
- Configures CloudWatch agent

### 4. Restore DNS

```bash
pnpm exec tsx tools/restore-dns.cli.ts \
  --backup-file=Archive/backups/emcnotary.com/dns/dns-backup-20250915-120038.json \
  --domain=emcnotary.com
```

### 5. Restore Mailboxes

```bash
pnpm exec tsx tools/restore-users-and-mailboxes.cli.ts \
  --backup-path=Archive/backups/emcnotary.com/mailboxes/mailboxes-backup-20250923_195631 \
  --domain=emcnotary.com
```

### 6. Run Tests

```bash
pnpm nx run cdk-emcnotary-instance:admin:test:e2e \
  --skip-deploy \
  --skip-restore
```

## Monitoring and Alarms

### Alarm Actions

- **Instance Status Check Failure**: Auto-restart via Lambda
- **System Status Check Failure**: Auto-restart via Lambda
- **OOM Kill Detected**: Auto-restart via Lambda
- **Memory High**: SNS notification only
- **Swap High**: SNS notification only

### Lambda Logs

View emergency restart Lambda logs:

```bash
aws logs tail /aws/lambda/emergency-restart-emcnotary-com --follow --profile hepe-admin-mfa
```

### CloudWatch Metrics

Key metrics to monitor:
- `AWS/EC2/StatusCheckFailed_Instance`
- `AWS/EC2/StatusCheckFailed_System`
- `EC2/oom_kills`
- `CWAgent/mem_used_percent`
- `CWAgent/swap_used_percent`

## Troubleshooting

### Stack Deployment Errors

1. **Check CloudFormation events**:
   ```bash
   aws cloudformation describe-stack-events --stack-name emcnotary-core --profile hepe-admin-mfa
   ```

2. **Check Lambda logs**:
   ```bash
   aws logs tail /aws/lambda/SMTPCredentialsLambdaFunction-emcnotary-core --follow
   ```

### Instance Bootstrap Issues

1. **Check SSM command status**:
   ```bash
   aws ssm list-command-invocations --instance-id i-xxx --profile hepe-admin-mfa
   ```

2. **Check bootstrap logs**:
   ```bash
   aws ssm get-command-invocation --command-id xxx --instance-id i-xxx --profile hepe-admin-mfa
   ```

### Restore Issues

1. **Check backup format**:
   ```bash
   ls -la Archive/backups/emcnotary.com/mailboxes/mailboxes-backup-20250923_195631/
   ```

2. **Validate DNS backup**:
   ```bash
   cat Archive/backups/emcnotary.com/dns/dns-backup-20250915-120038.json | jq .
   ```

3. **Test connectivity**:
   ```bash
   ssh -i ~/.ssh/emcnotary.com-keypair ubuntu@<instance-ip>
   ```

## Best Practices

1. **Always use dry-run first**:
   ```bash
   DRY_RUN=1 pnpm nx run cdk-emcnotary-instance:admin:restore:emcnotary
   ```

2. **Monitor alarms after deployment**:
   ```bash
   aws cloudwatch describe-alarms --alarm-name-prefix InstanceStatusCheck --profile hepe-admin-mfa
   ```

3. **Verify backups before restore**:
   ```bash
   pnpm exec tsx tools/discover-users-from-mailboxes.cli.ts \
     --backup-path=Archive/backups/emcnotary.com/mailboxes/mailboxes-backup-20250923_195631
   ```

4. **Test email connectivity**:
   ```bash
   telnet <instance-ip> 25
   telnet <instance-ip> 143
   ```

5. **Check DNS propagation**:
   ```bash
   dig emcnotary.com A
   dig www.emcnotary.com CNAME
   ```

## Backup Locations

- **DNS Backup**: `Archive/backups/emcnotary.com/dns/dns-backup-20250915-120038.json`
- **Mailbox Backup**: `Archive/backups/emcnotary.com/mailboxes/mailboxes-backup-20250923_195631`

## Related Commands

- `pnpm nx run cdk-emcnotary-instance:admin:users:discover-from-mailboxes` - Discover users from backup
- `pnpm nx run cdk-emcnotary-instance:admin:users:create-multiple` - Create multiple users
- `pnpm nx run cdk-emcnotary-instance:admin:mailboxes:restore` - Restore mailboxes only
- `pnpm nx run cdk-emcnotary-instance:admin:restore:users-and-mailboxes` - Combined restore


