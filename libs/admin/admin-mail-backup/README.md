# Mailbox Backup Script

TypeScript script for backing up IMAP mailboxes to local files and optionally S3.

## Usage

### Basic Backup

```bash
# Using Nx target (requires environment variables)
pnpm nx run admin-mail-backup:backup

# Or directly
node dist/libs/admin/admin-mail-backup/mail-backup.mjs
```

### EMCNotary-Specific Backup

```bash
# Using app path (automatically discovers connection details from stack)
pnpm nx run admin-mail-backup:backup:apps:cdk-emc-notary

# Or using domain-specific target
pnpm nx run admin-mail-backup:backup:emcnotary

# Manual connection details (overrides stack discovery)
export MAIL_HOST=mail.emcnotary.com
export MAIL_USER=admin@emcnotary.com
export MAIL_PASS=your-password
pnpm nx run admin-mail-backup:backup
```

### Environment Variables

| Variable | Description | Required | Default |
|----------|-------------|----------|---------|
| `MAIL_HOST` | IMAP server hostname | **Yes** | - |
| `MAIL_USER` | IMAP username | **Yes** | - |
| `MAIL_PASS` | IMAP password | **Yes** | - |
| `MAIL_PORT` | IMAP port | No | `993` |
| `MAIL_SECURE` | Use TLS/SSL (`1` or `0`) | No | `1` (true) |
| `MAIL_BACKUP_BUCKET` | S3 bucket for backups | No | - |
| `MAIL_BACKUP_PREFIX` | S3 key prefix (e.g., `backups/mail/`) | No | `mail/` |
| `MAIL_INCLUDE` | Comma-separated mailbox names to include | No | All mailboxes |
| `MAIL_EXCLUDE` | Comma-separated mailbox names to exclude | No | None |
| `APP_PATH` | App directory path (e.g., `apps/cdk-emc-notary`) | No | - |
| `STACK_NAME` | Explicit CloudFormation stack name | No | - |
| `DOMAIN` | Domain name (e.g., `emcnotary.com`) | No | - |
| `AWS_PROFILE` | AWS CLI profile | No | `hepe-admin-mfa` |
| `AWS_REGION` | AWS region | No | `us-east-1` |

### Getting EMCNotary Mail Server Details

To get the mail server connection details from the CloudFormation stack:

```bash
# Get stack outputs
STACK_NAME="emcnotary-com-mailserver"
REGION="us-east-1"
PROFILE="hepe-admin-mfa"

# Get instance IP
INSTANCE_IP=$(aws cloudformation describe-stacks \
  --profile $PROFILE \
  --region $REGION \
  --stack-name $STACK_NAME \
  --query 'Stacks[0].Outputs[?OutputKey==`InstancePublicIp`].OutputValue' \
  --output text)

# Get admin password
ADMIN_PASS=$(aws cloudformation describe-stacks \
  --profile $PROFILE \
  --region $REGION \
  --stack-name $STACK_NAME \
  --query 'Stacks[0].Outputs[?OutputKey==`AdminPassword`].OutputValue' \
  --output text)

# Set environment variables
export MAIL_HOST=$INSTANCE_IP
export MAIL_USER=admin@emcnotary.com
export MAIL_PASS=$ADMIN_PASS
export MAIL_PORT=993
export MAIL_SECURE=1
```

### Output

Backups are written to `dist/backups/mail/{timestamp}-{runId}/`:
- `{mailbox-name}.eml.ndjson` - One file per mailbox containing messages in NDJSON format

Each message entry contains:
```json
{
  "uid": 123,
  "subject": "Example Subject",
  "from": [{"name": "Sender", "address": "sender@example.com"}],
  "date": "2025-11-06T22:00:00.000Z",
  "raw": "base64-encoded-email-content"
}
```

The directory is then compressed into `mail-backup-{timestamp}-{runId}.tar.gz`.

### Examples

```bash
# Backup all mailboxes
export MAIL_HOST=mail.example.com
export MAIL_USER=admin@example.com
export MAIL_PASS=password
pnpm nx run admin-mail-backup:backup

# Backup specific mailboxes only
export MAIL_INCLUDE=INBOX,Sent
pnpm nx run admin-mail-backup:backup

# Exclude certain mailboxes
export MAIL_EXCLUDE=Trash,Spam
pnpm nx run admin-mail-backup:backup

# Backup to S3
export MAIL_BACKUP_BUCKET=my-backup-bucket
export MAIL_BACKUP_PREFIX=backups/mail/
pnpm nx run admin-mail-backup:backup
```

## Building

```bash
pnpm nx build admin-mail-backup
```

## Testing

```bash
pnpm nx test admin-mail-backup
```
