# Local operations (ops-runner)

This guide covers running administrative operations locally using the Nx **ops-runner**. For CDK deploy commands for the reference mail stacks, see [nx-cdk-reference.md](./nx-cdk-reference.md) and [mail-server-operations.md](./mail-server-operations.md).

## Quick start

1. **Copy environment template**
   ```bash
   cp .env.example .env.local
   ```

2. **Edit `.env.local`** with your values (never commit secrets).

3. **Load environment** (Linux/macOS)
   ```bash
   set -a && source .env.local && set +a
   ```
   Or:
   ```bash
   export $(grep -v '^#' .env.local | xargs)
   ```

4. **Run operations**
   ```bash
   pnpm nx run ops-runner:run -- <command>
   ```

## Common commands

### Authentication

```bash
pnpm nx run ops-runner:run -- auth:mfa
```

### DNS backup

```bash
pnpm nx run ops-runner:run -- dns:backup
```

**Output:** `dist/backups/dns/<timestamp>/<zone-id>.json`  
**S3:** if `DNS_BACKUP_BUCKET` is set, uploads are performed.

### Mail backup

```bash
pnpm nx run ops-runner:run -- mail:backup
```

**Output:** `dist/backups/mail/<timestamp>-<runId>/mail-backup-*.tar.gz`  
**Filters:** `MAIL_INCLUDE` / `MAIL_EXCLUDE` (comma-separated).

### EC2

```bash
INSTANCE_ID=i-abc123 pnpm nx run ops-runner:run -- ec2:restart
INSTANCE_ID=i-abc123 pnpm nx run ops-runner:run -- ec2:stop
INSTANCE_ID=i-abc123 pnpm nx run ops-runner:run -- ec2:start
INSTANCE_ID=i-abc123 INSTANCE_TYPE=t3.medium pnpm nx run ops-runner:run -- ec2:type t3.medium
```

### KMS

```bash
KMS_KEY_ID=arn:aws:kms:... pnpm nx run ops-runner:run -- kms:status
KMS_KEY_ID=arn:aws:kms:... pnpm nx run ops-runner:run -- kms:enable
KMS_KEY_ID=arn:aws:kms:... pnpm nx run ops-runner:run -- kms:disable
```

## Environment variables

See `.env.example`. Commonly:

- **MFA:** `MFA_DEVICE_ARN`, `SOURCE_PROFILE`, `TARGET_PROFILE`
- **DNS / mail backup:** `DNS_BACKUP_BUCKET`, `MAIL_*`
- **EC2:** `INSTANCE_ID`, `INSTANCE_TYPE`
- **CDK (reference apps):** `FEATURE_CDK_EMC_NOTARY_EXAMPLE_STACKS_ENABLED=1`
- **Bootstrap:** `FEATURE_INSTANCE_BOOTSTRAP_ENABLED=1` (default on unless set to `0`)

## Scheduled backups

### macOS / Linux (cron)

```bash
crontab -e
```

Example lines (adjust repo path):

```cron
15 2 * * * cd /path/to/repo && set -a && . ./.env.local && set +a && pnpm nx run ops-runner:run -- dns:backup >> ./logs/dns-backup.log 2>&1
20 2 * * * cd /path/to/repo && set -a && . ./.env.local && set +a && pnpm nx run ops-runner:run -- mail:backup >> ./logs/mail-backup.log 2>&1
```

### Windows (Task Scheduler)

Use a `.bat` that `cd`s to the repo, loads env, and invokes the same `pnpm nx run ops-runner:run -- ...` lines.

## Troubleshooting

### Missing environment variables

```bash
set -a && source .env.local && set +a
```

### AWS credentials

Use profiles (MFA flow), environment variables, or `~/.aws/credentials` consistent with how ops-runner resolves the chain.

### Build ops-runner

```bash
pnpm nx run ops-runner:build
```

### Help

```bash
pnpm nx run ops-runner:run -- help
```
