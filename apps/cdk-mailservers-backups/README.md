# Mailservers Backups Stack

Central backup infrastructure stack for all mailserver deployments. This stack provides a shared S3 bucket for storing backups across all mailserver instances.

## Resources

- **S3 Bucket**: Central backup bucket (`mailservers-backups`) with versioning and lifecycle policies
- **SSM Parameter**: `/mailservers/backups/bucketName` - Backup bucket name for other stacks to reference

## Lifecycle Policy

- Backups are kept for 90 days
- After 30 days: Moved to Infrequent Access storage class
- After 60 days: Moved to Glacier storage class
- After 90 days: Deleted

## Usage

### Deploy Backup Stack First

This stack should be deployed **before** any mailserver stacks, as they reference the backup bucket via SSM:

```bash
# Build
pnpm nx build cdk-mailservers-backups

# Deploy
CDK_DEFAULT_ACCOUNT=<account-id> CDK_DEFAULT_REGION=us-east-1 \
  pnpm nx run cdk-mailservers-backups:deploy
```

### Local Backup Management

Backups can be managed locally using admin tools to avoid AWS write operations:

```bash
# List backups for a domain
APP_PATH=apps/cdk-emc-notary pnpm nx run admin-backup-manager:list

# Download backup locally
BACKUP_ID=<backup-id> pnpm nx run admin-backup-manager:download

# Upload local backup
BACKUP_PATH=./local-backup.tar.gz pnpm nx run admin-backup-manager:upload
```

## Backup Structure

Backups are organized by domain and type:

```
s3://mailservers-backups/
  ├── {domain}/
  │   ├── instance-backups/
  │   │   └── {timestamp}-{instance-id}/
  │   │       ├── mailboxes.tar.gz
  │   │       ├── dns-records.json
  │   │       └── users.json
  │   ├── dns-backups/
  │   │   └── {timestamp}-{hosted-zone-id}.json
  │   └── log-exports/
  │       └── {timestamp}-{log-group}.tar.gz
```

## SSM Parameter

The backup bucket name is stored in SSM Parameter Store:

- **Parameter Name**: `/mailservers/backups/bucketName`
- **Value**: `mailservers-backups`
- **Type**: String

Other stacks can reference this parameter to get the backup bucket name.

## Destroy

When destroying this stack, all backups will be deleted (after 90 days per lifecycle policy). Ensure critical backups are downloaded locally before destroying:

```bash
# Download all backups before destroying
pnpm nx run admin-backup-manager:download-all

# Destroy stack
CDK_DEFAULT_ACCOUNT=<account-id> CDK_DEFAULT_REGION=us-east-1 \
  pnpm nx run cdk-mailservers-backups:destroy
```

