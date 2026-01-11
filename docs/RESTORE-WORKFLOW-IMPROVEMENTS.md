# Restore Workflow Improvements

## Overview

Enhanced restore orchestration with disk cleanup, proper user creation order, stack polling, and instance health verification.

## New Features

### 1. Disk Space Cleanup Script

**File**: `tools/cleanup-disk-space.cli.ts`

Automatically cleans up disk space before restore operations:

- **Apt cache cleanup**: Removes cached package files
- **Old log files**: Removes logs older than 7 days
- **Journal logs**: Vacuums systemd journal (keeps 7 days)
- **Temporary files**: Removes temp files older than 1 day
- **Mail-in-a-Box temp files**: Cleans MIAB-specific temp files
- **Docker cleanup**: Prunes unused Docker images/containers (if Docker installed)
- **Old kernel packages**: Removes unused kernel packages

**Usage**:
```bash
# Cleanup disk space
pnpm nx run cdk-emcnotary-instance:admin:cleanup:disk-space

# Dry run
DRY_RUN=1 pnpm nx run cdk-emcnotary-instance:admin:cleanup:disk-space
```

### 2. Stack Creation Polling

The restore orchestration now polls CloudFormation stack status after deployment:

- **Core Stack**: Verifies `emcnotary-com-mailserver-core` reaches `CREATE_COMPLETE` or `UPDATE_COMPLETE`
- **Instance Stack**: Verifies `emcnotary-com-mailserver-instance` reaches stable state
- **Timeout**: 10 minutes per stack
- **Error Detection**: Fails fast if stack enters `FAILED` or `ROLLBACK` state

### 3. EC2 Instance Health Polling

After stack deployment, the tool polls EC2 instance health:

- **Instance State**: Verifies instance is `running`
- **System Status**: Verifies system status check is `ok`
- **Instance Status**: Verifies instance status check is `ok`
- **Timeout**: 10 minutes
- **Poll Interval**: 15 seconds

### 4. User Creation Before Mailbox Restore

The restore workflow now ensures proper order:

1. **Discover users** from mailbox backup
2. **Create users** via Mail-in-a-Box management scripts
3. **Restore mailboxes** after users exist

This prevents "No space left on device" errors that occur when trying to create directories for non-existent users.

## Updated Restore Flow

```
1. Deploy Core Stack
   └─> Poll stack status until CREATE_COMPLETE

2. Deploy Instance Stack
   └─> Poll stack status until CREATE_COMPLETE
   └─> Poll EC2 instance health until healthy

3. Get Stack Info
   └─> Verify instance health (if just deployed)

4. Check Bootstrap Status
   └─> Bootstrap if needed

5. Restore DNS Records
   └─> Uses instance IP if domain not accessible
   └─> Continues on failure (non-blocking)

6. Cleanup Disk Space
   └─> Removes old logs, temp files, apt cache
   └─> Frees up space for mailbox restore

7. Create Users and Restore Mailboxes
   └─> Step 7a: Discover users from backup
   └─> Step 7b: Create users (idempotent)
   └─> Step 7c: Restore mailboxes (after users exist)

8. Run End-to-End Tests
   └─> Server services
   └─> Email connectivity
   └─> DNS records
   └─> Lambda functions
   └─> CloudWatch alarms
   └─> Logging
```

## Error Handling

### Stack Deployment Errors

- **Stack fails**: Tool stops and reports error
- **Stack rollback**: Tool detects and reports rollback reason
- **Timeout**: Tool reports timeout after 10 minutes

### Instance Health Errors

- **Instance stopped**: Tool reports error and stops
- **Status checks fail**: Tool reports which check failed
- **Timeout**: Tool reports timeout after 10 minutes

### Disk Space Errors

- **Cleanup warnings**: Non-fatal, restore continues
- **Cleanup failures**: Logged but don't block restore
- **Disk still full**: Mailbox restore will fail with clear error

### DNS Restore Errors

- **Network errors**: Logged but don't block restore
- **API errors**: Logged with helpful hints
- **Partial success**: Tool reports success/failure counts

## Usage Examples

### Full Restore (Deploy + Restore + Test)

```bash
pnpm nx run cdk-emcnotary-instance:admin:restore:emcnotary
```

### Skip Deployment (Stacks Already Exist)

```bash
SKIP_DEPLOY=1 pnpm nx run cdk-emcnotary-instance:admin:restore:emcnotary
```

### Cleanup Disk Space Only

```bash
pnpm nx run cdk-emcnotary-instance:admin:cleanup:disk-space
```

### Dry Run (Preview Changes)

```bash
DRY_RUN=1 pnpm nx run cdk-emcnotary-instance:admin:restore:emcnotary
```

## Troubleshooting

### Stack Deployment Fails

1. Check CloudFormation events:
   ```bash
   aws cloudformation describe-stack-events \
     --stack-name emcnotary-com-mailserver-core \
     --profile hepe-admin-mfa \
     --region us-east-1 \
     --max-items 20
   ```

2. Check for resource conflicts (EIP, buckets, etc.)

3. Verify AWS credentials and permissions

### Instance Health Check Fails

1. Check instance status:
   ```bash
   aws ec2 describe-instance-status \
     --instance-ids i-xxx \
     --profile hepe-admin-mfa \
     --region us-east-1
   ```

2. Check system logs:
   ```bash
   ssh -i ~/.ssh/emcnotary.com-keypair ubuntu@3.229.143.6
   sudo journalctl -xe
   ```

3. Verify instance is running and accessible

### Disk Space Issues

1. Run cleanup script:
   ```bash
   pnpm nx run cdk-emcnotary-instance:admin:cleanup:disk-space
   ```

2. Check disk usage manually:
   ```bash
   ssh -i ~/.ssh/emcnotary.com-keypair ubuntu@3.229.143.6
   df -h
   du -sh /var/log/* | sort -h | tail -10
   ```

3. Consider increasing EBS volume size if consistently full

### DNS Restore Fails

1. Check if Mail-in-a-Box is accessible:
   ```bash
   curl -k https://3.229.143.6/admin/login
   ```

2. Verify admin credentials:
   ```bash
   pnpm nx run admin-credentials:get:emcnotary
   ```

3. Try restoring DNS manually via admin interface

## Related Commands

- `pnpm nx run cdk-emcnotary-instance:admin:cleanup:disk-space` - Clean disk space
- `pnpm nx run cdk-emcnotary-instance:admin:restore:emcnotary` - Full restore
- `pnpm nx run cdk-emcnotary-instance:admin:test:e2e` - E2E tests only
- `pnpm nx run cdk-emcnotary-instance:admin:restore:users-and-mailboxes` - Users + mailboxes only


