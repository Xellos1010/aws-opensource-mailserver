# DNS Backup Script

TypeScript script for backing up Route53 DNS records to local files and optionally S3.

## Usage

### Basic Backup (All Hosted Zones)

```bash
# Using Nx target
pnpm nx run admin-dns-backup:backup

# Or directly
node dist/libs/admin/admin-dns-backup/dns-backup.mjs
```

### EMCNotary-Specific Backup

```bash
# Using domain-specific target
pnpm nx run admin-dns-backup:backup:emcnotary

# Using hierarchical app path target
pnpm nx run admin-dns-backup:backup:apps:cdk-emc-notary
```

Both automatically set:
- `AWS_PROFILE=hepe-admin-mfa`
- `AWS_REGION=us-east-1`
- `APP_PATH=apps/cdk-emc-notary` (for automatic stack discovery)

### Environment Variables

| Variable | Description | Required | Default |
|----------|-------------|----------|---------|
| `DNS_BACKUP_BUCKET` | S3 bucket for backups | No | - |
| `DNS_BACKUP_PREFIX` | S3 key prefix (e.g., `backups/dns/`) | No | `dns/` |
| `DNS_ZONE_IDS` | Comma-separated zone IDs to backup | No | All zones (or from stack if APP_PATH set) |
| `APP_PATH` | App directory path (e.g., `apps/cdk-emc-notary`) | No | - |
| `STACK_NAME` | Explicit CloudFormation stack name | No | - |
| `DOMAIN` | Domain name (e.g., `emcnotary.com`) | No | - |
| `AWS_PROFILE` | AWS CLI profile | No | `hepe-admin-mfa` |
| `AWS_REGION` | AWS region | No | `us-east-1` |

### Output

Backups are written to `dist/backups/dns/{timestamp}/` with one JSON file per hosted zone:
- `{zoneId}.json` - Contains zone metadata and all resource record sets

Each backup file contains:
```json
{
  "zoneId": "Z04428471E2ROT6UYYI5F",
  "name": "example.com.",
  "rrsets": [
    {
      "Name": "example.com.",
      "Type": "NS",
      "TTL": 172800,
      "ResourceRecords": [...]
    }
  ]
}
```

### Examples

```bash
# Backup all zones to local files
pnpm nx run admin-dns-backup:backup

# Backup specific zones
DNS_ZONE_IDS=Z04428471E2ROT6UYYI5F,Z09226721UXZC13OOQCFF pnpm nx run admin-dns-backup:backup

# Backup to S3
DNS_BACKUP_BUCKET=my-backup-bucket DNS_BACKUP_PREFIX=backups/dns/ pnpm nx run admin-dns-backup:backup
```

## Building

```bash
pnpm nx build admin-dns-backup
```

## Testing

```bash
pnpm nx test admin-dns-backup
```
