# Backup Bridge Script

Unified bridge script that backs up both DNS and mail server for a CloudFormation stack. Automatically discovers stack information and orchestrates both backup operations.

## Features

- **Automatic Stack Discovery**: Uses app path to automatically discover stack details
- **Unified Backup**: Backs up both DNS and mail in a single operation
- **Error Handling**: Continues with one backup if the other fails
- **Summary Report**: Generates a JSON summary of all backup operations

## Usage

### EMC Notary Backup (Recommended)

```bash
# Using hierarchical app path target
pnpm nx run admin-backup-bridge:backup:apps:cdk-emc-notary

# Using domain-specific target
pnpm nx run admin-backup-bridge:backup:emcnotary
```

### Basic Usage

```bash
# Using app path (automatically discovers stack)
APP_PATH=apps/cdk-emc-notary pnpm nx run admin-backup-bridge:backup

# Using domain
DOMAIN=emcnotary.com pnpm nx run admin-backup-bridge:backup

# Using explicit stack name
STACK_NAME=emcnotary-com-mailserver pnpm nx run admin-backup-bridge:backup
```

### Selective Backups

```bash
# DNS only
SKIP_MAIL=1 pnpm nx run admin-backup-bridge:backup:apps:cdk-emc-notary

# Mail only
SKIP_DNS=1 pnpm nx run admin-backup-bridge:backup:apps:cdk-emc-notary
```

## Environment Variables

| Variable | Description | Required | Default |
|----------|-------------|----------|---------|
| `APP_PATH` | App directory path (e.g., `apps/cdk-emc-notary`) | No* | - |
| `STACK_NAME` | Explicit CloudFormation stack name | No* | - |
| `DOMAIN` | Domain name (e.g., `emcnotary.com`) | No* | - |
| `SKIP_DNS` | Skip DNS backup (`1` or `true`) | No | `false` |
| `SKIP_MAIL` | Skip mail backup (`1` or `true`) | No | `false` |
| `DNS_BACKUP_BUCKET` | S3 bucket for DNS backups | No | - |
| `DNS_BACKUP_PREFIX` | S3 key prefix for DNS backups | No | `dns/` |
| `MAIL_BACKUP_BUCKET` | S3 bucket for mail backups | No | - |
| `MAIL_BACKUP_PREFIX` | S3 key prefix for mail backups | No | `mail/` |
| `MAIL_INCLUDE` | Comma-separated mailboxes to include | No | All mailboxes |
| `MAIL_EXCLUDE` | Comma-separated mailboxes to exclude | No | None |
| `AWS_PROFILE` | AWS CLI profile | No | `hepe-admin-mfa` |
| `AWS_REGION` | AWS region | No | `us-east-1` |

\* At least one of `APP_PATH`, `STACK_NAME`, or `DOMAIN` must be provided.

## Output

The script creates backups in the following locations:

- **DNS Backup**: `dist/backups/dns/{timestamp}/`
- **Mail Backup**: `dist/backups/mail/{timestamp}-{runId}/`
- **Summary**: `dist/backups/{domain}/backup-summary-{timestamp}.json`

### Summary File Structure

```json
{
  "timestamp": "2025-11-06T22-00-00-000Z",
  "stackInfo": {
    "stackName": "emcnotary-com-mailserver",
    "domain": "emcnotary.com",
    "instancePublicIp": "1.2.3.4"
  },
  "dnsBackup": {
    "outputDir": "dist/backups/dns/2025-11-06T22-00-00-000Z"
  },
  "mailBackup": {
    "outDir": "dist/backups/mail/2025-11-06T22-00-00-000Z-abc123",
    "tarPath": "dist/backups/mail/mail-backup-2025-11-06T22-00-00-000Z-abc123.tar.gz",
    "s3Uri": "s3://bucket/mail/mail-backup-..."
  },
  "summary": {
    "dnsSuccess": true,
    "mailSuccess": true,
    "errors": []
  }
}
```

## How It Works

1. **Stack Discovery**: Retrieves CloudFormation stack information using the stack info library
2. **DNS Backup**: Backs up Route53 hosted zone records (if `SKIP_DNS` is not set)
3. **Mail Backup**: Connects to mail server and backs up all mailboxes (if `SKIP_MAIL` is not set)
4. **Summary Generation**: Creates a JSON summary file with all backup results

## Examples

```bash
# Full backup for EMC Notary
pnpm nx run admin-backup-bridge:backup:apps:cdk-emc-notary

# DNS backup only
SKIP_MAIL=1 pnpm nx run admin-backup-bridge:backup:apps:cdk-emc-notary

# Mail backup only
SKIP_DNS=1 pnpm nx run admin-backup-bridge:backup:apps:cdk-emc-notary

# Backup to S3
DNS_BACKUP_BUCKET=my-backup-bucket \
MAIL_BACKUP_BUCKET=my-backup-bucket \
pnpm nx run admin-backup-bridge:backup:apps:cdk-emc-notary
```

## Building

```bash
pnpm nx build admin-backup-bridge
```

## Testing

```bash
pnpm nx test admin-backup-bridge
```
