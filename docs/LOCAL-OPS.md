# Local Operations Guide

This guide covers running all administrative operations locally using the Nx ops-runner.

## Quick Start

1. **Copy environment template**
   ```bash
   cp .env.example .env.local
   ```

2. **Edit `.env.local`** with your actual values

3. **Load environment** (Linux/macOS)
   ```bash
   export $(grep -v '^#' .env.local | xargs)
   ```

4. **Run operations**
   ```bash
   pnpm nx run ops-runner:run -- <command>
   ```

## Available Commands

### Authentication
```bash
# Interactive MFA authentication
pnpm nx run ops-runner:run -- auth:mfa
```

### DNS Backup
```bash
# Backup all Route53 zones to JSON (and optional S3)
pnpm nx run ops-runner:run -- dns:backup
```

**Output**: `dist/backups/dns/<timestamp>/<zone-id>.json`

**S3 Upload**: If `DNS_BACKUP_BUCKET` is set, files are also uploaded to S3.

### Mail Backup
```bash
# Backup mailboxes via IMAP to tar.gz (and optional S3)
pnpm nx run ops-runner:run -- mail:backup
```

**Output**: `dist/backups/mail/<timestamp>-<runId>/mail-backup-<timestamp>-<runId>.tar.gz`

**S3 Upload**: If `MAIL_BACKUP_BUCKET` is set, tarball is uploaded via multipart upload.

**Filtering**: Use `MAIL_INCLUDE` (comma-separated) or `MAIL_EXCLUDE` to filter mailboxes.

### EC2 Administration
```bash
# Restart instance
INSTANCE_ID=i-abc123 pnpm nx run ops-runner:run -- ec2:restart

# Stop instance
INSTANCE_ID=i-abc123 pnpm nx run ops-runner:run -- ec2:stop

# Start instance
INSTANCE_ID=i-abc123 pnpm nx run ops-runner:run -- ec2:start

# Change instance type
INSTANCE_ID=i-abc123 INSTANCE_TYPE=t3.medium pnpm nx run ops-runner:run -- ec2:type t3.medium
```

### KMS Key Management
```bash
# Check rotation status
KMS_KEY_ID=arn:aws:kms:... pnpm nx run ops-runner:run -- kms:status

# Enable rotation
KMS_KEY_ID=arn:aws:kms:... pnpm nx run ops-runner:run -- kms:enable

# Disable rotation
KMS_KEY_ID=arn:aws:kms:... pnpm nx run ops-runner:run -- kms:disable
```

## Environment Variables

See `.env.example` for all available variables. Key variables:

- **MFA**: `MFA_DEVICE_ARN`, `SOURCE_PROFILE`, `TARGET_PROFILE`
- **DNS**: `DNS_BACKUP_BUCKET`, `DNS_BACKUP_PREFIX`
- **Mail**: `MAIL_HOST`, `MAIL_PORT`, `MAIL_USER`, `MAIL_PASS`, `MAIL_BACKUP_BUCKET`
- **EC2**: `INSTANCE_ID`, `INSTANCE_TYPE`
- **KMS**: `KMS_KEY_ID`

## Scheduled Backups

### macOS/Linux (cron)

```bash
crontab -e

# Add these lines:
# Daily DNS backup at 02:15
15 2 * * * cd /path/to/repo && . ./.env.local && pnpm nx run ops-runner:run -- dns:backup >> ./logs/dns-backup.log 2>&1

# Daily mail backup at 02:20
20 2 * * * cd /path/to/repo && . ./.env.local && pnpm nx run ops-runner:run -- mail:backup >> ./logs/mail-backup.log 2>&1
```

### Windows (Task Scheduler)

Create a batch file `run-backup.bat`:
```batch
@echo off
cd C:\path\to\repo
call .env.local
pnpm nx run ops-runner:run -- dns:backup >> logs\dns-backup.log 2>&1
```

Then schedule it:
```powershell
schtasks /Create /SC DAILY /TN "dns-backup" /TR "C:\path\to\run-backup.bat" /ST 02:15
```

## CDK Operations

### Synthesize Stacks
```bash
# EMC-Notary stack
pnpm nx run cdk-emc-notary:build && pnpm nx run cdk-emc-notary:synth

# EC2 stack (when implemented)
# pnpm nx run cdk-ec2-stack:build && pnpm nx run cdk-ec2-stack:synth
```

### Deploy (when ready)
```bash
cd dist/apps/cdk-emc-notary
cdk deploy --require-approval never
```

## Troubleshooting

### Missing Environment Variables
If you see "Missing X" errors, ensure `.env.local` is loaded:
```bash
export $(grep -v '^#' .env.local | xargs)
```

### AWS Credentials
Ensure AWS credentials are configured:
- Via AWS CLI profiles (for MFA)
- Via environment variables (for ops-runner)
- Via `~/.aws/credentials` file

### Build Errors
If ops-runner fails to build:
```bash
pnpm nx run ops-runner:build
```

### Help
Get command help:
```bash
pnpm nx run ops-runner:run -- help
```

