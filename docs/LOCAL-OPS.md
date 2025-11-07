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
- **CDK Stacks**: `FEATURE_CDK_EMCNOTARY_STACKS_ENABLED=1`
- **Instance Bootstrap**: `FEATURE_INSTANCE_BOOTSTRAP_ENABLED=1` (default: enabled unless set to "0")

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

### EMC Notary Stack Operations

**⚠️ Feature Flag Required**: Set `FEATURE_CDK_EMCNOTARY_STACKS_ENABLED=1` before running stack operations.

#### Deploy Core Stack (SES, S3, SNS, EIP)
```bash
# Deploy shared resources stack
FEATURE_CDK_EMCNOTARY_STACKS_ENABLED=1 pnpm nx run cdk-emcnotary-core:deploy
```

#### Deploy Instance Stack (EC2, nightly reboot)
```bash
# Deploy EC2 instance with EIP association and nightly reboot at 03:00 ET
FEATURE_CDK_EMCNOTARY_STACKS_ENABLED=1 pnpm nx run cdk-emcnotary-instance:deploy
```

#### Provision Instance (SSH + SES DNS)
```bash
# Setup SSH access and configure SES DNS records
pnpm nx run admin-instance:provision -- --domain emcnotary.com
```

#### Bootstrap Instance (MIAB Setup via SSM)
**⚠️ Feature Flag Required**: Set `FEATURE_INSTANCE_BOOTSTRAP_ENABLED=1` (or leave unset - enabled by default unless set to "0").

Bootstrap runs Mail-in-a-Box setup on an existing instance via SSM RunCommand. This is idempotent and safe to re-run.

```bash
# Bootstrap emcnotary.com instance (default)
FEATURE_INSTANCE_BOOTSTRAP_ENABLED=1 DOMAIN=emcnotary.com pnpm nx run ops-runner:instance:bootstrap

# Dry run - show what would be done without executing
FEATURE_INSTANCE_BOOTSTRAP_ENABLED=1 DOMAIN=emcnotary.com DRY_RUN=1 pnpm nx run ops-runner:instance:bootstrap

# Bootstrap different domain
FEATURE_INSTANCE_BOOTSTRAP_ENABLED=1 DOMAIN=askdaokapra.com pnpm nx run ops-runner:instance:bootstrap

# Explicit stack name (overrides domain-derived)
FEATURE_INSTANCE_BOOTSTRAP_ENABLED=1 STACK=my-alt-instance-stack pnpm nx run ops-runner:instance:bootstrap

# With restore prefix (backup restoration)
FEATURE_INSTANCE_BOOTSTRAP_ENABLED=1 DOMAIN=emcnotary.com RESTORE_PREFIX=i-1234567890abcdef0 pnpm nx run ops-runner:instance:bootstrap

# With custom AWS profile
FEATURE_INSTANCE_BOOTSTRAP_ENABLED=1 DOMAIN=emcnotary.com PROFILE=hepe-admin-mfa pnpm nx run ops-runner:instance:bootstrap

# With reboot after setup (default: false, as nightly reboot is handled by EventBridge)
FEATURE_INSTANCE_BOOTSTRAP_ENABLED=1 DOMAIN=emcnotary.com REBOOT_AFTER_SETUP=1 pnpm nx run ops-runner:instance:bootstrap
```

**What Bootstrap Does:**
- Discovers instance via CloudFormation stack outputs
- Reads core SSM parameters (`/emcnotary/core/*`)
- Ships MIAB setup script via SSM RunCommand
- Configures Mail-in-a-Box with proper environment variables
- Sets up SES relay, DNS resolver, duplicity backups
- Logs to CloudWatch (`/aws/ssm/miab-bootstrap`)
- Polls command status until completion

**Idempotency**: The script checks for existing state before making changes, so it's safe to re-run.

#### End-to-End Deployment
```bash
# Complete deployment workflow:
FEATURE_CDK_EMCNOTARY_STACKS_ENABLED=1 pnpm nx run cdk-emcnotary-core:deploy
FEATURE_CDK_EMCNOTARY_STACKS_ENABLED=1 pnpm nx run cdk-emcnotary-instance:deploy
pnpm nx run admin-instance:provision -- --domain emcnotary.com
FEATURE_INSTANCE_BOOTSTRAP_ENABLED=1 DOMAIN=emcnotary.com pnpm nx run ops-runner:instance:bootstrap
```

#### Nightly Reboot Schedule
The instance stack includes automatic nightly reboot at **03:00 ET (08:00 UTC)** via EventBridge + Lambda to clear memory issues.

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

