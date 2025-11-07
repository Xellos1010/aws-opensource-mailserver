# Admin S3 Empty

Utility library for emptying S3 buckets in a CloudFormation stack before stack deletion.

## Overview

When deleting a CloudFormation stack that contains S3 buckets, AWS requires that all buckets be empty before deletion. This library automates the process of:

1. Discovering all S3 buckets in a CloudFormation stack
2. Emptying each bucket by deleting all object versions and delete markers
3. Providing a summary of the operation

## Usage

### Via Nx Tasks

#### Empty buckets for EMC Notary (old stack)
```bash
pnpm nx run admin-s3-empty:empty:emcnotary
```

#### Dry run (preview what would be deleted)
```bash
pnpm nx run admin-s3-empty:empty:emcnotary:dry-run
```

#### Empty buckets for AskDaoKapra
```bash
pnpm nx run admin-s3-empty:empty:askdaokapra
```

#### Generic usage with environment variables
```bash
APP_PATH=apps/cdk-emcnotary-core \
STACK_NAME=emcnotary-mailserver-core \
AWS_PROFILE=hepe-admin-mfa \
AWS_REGION=us-east-1 \
pnpm nx run admin-s3-empty:empty
```

### Environment Variables

- `APP_PATH` - Path to the CDK app directory (e.g., `apps/cdk-emcnotary-core`)
- `STACK_NAME` - Explicit CloudFormation stack name (takes precedence over `APP_PATH`)
- `DOMAIN` - Domain name (used for stack name resolution)
- `AWS_PROFILE` - AWS CLI profile to use (default: `hepe-admin-mfa`)
- `AWS_REGION` - AWS region (default: `us-east-1`)
- `DRY_RUN` - Set to `1` or `true` for dry run mode (default: `0`)

## How It Works

1. **Stack Discovery**: Uses `admin-stack-info` to resolve the stack name from `APP_PATH`, `STACK_NAME`, or `DOMAIN`
2. **Bucket Discovery**: Lists all CloudFormation resources in the stack and filters for `AWS::S3::Bucket` resources
3. **Bucket Emptying**: For each bucket:
   - Lists all object versions (including delete markers)
   - Deletes all versions and markers in batches
   - Handles pagination for large buckets
4. **Summary**: Provides a detailed summary of what was deleted

## Example Output

```
Finding S3 buckets in stack: emcnotary-mailserver-core
Region: us-east-1, Profile: hepe-admin-mfa

Found 2 S3 bucket(s):
  - emcnotary.com-backup (BackupBucket26B8E51C)
  - emcnotary.com-nextcloud (NextcloudBucket8B0187A4)

  Emptying bucket: emcnotary.com-backup
    Deleted 15 object version(s)
    Deleted 2 delete marker(s)
  ✅ Completed: 15 versions, 2 markers

  Emptying bucket: emcnotary.com-nextcloud
    Deleted 8 object version(s)
  ✅ Completed: 8 versions, 0 markers

============================================================
Summary:
============================================================
Total buckets processed: 2
  emcnotary.com-backup: 15 versions, 2 markers
  emcnotary.com-nextcloud: 8 versions, 0 markers

Total: 23 versions, 2 markers deleted
```

## Important Notes

- **Versioned Buckets**: This script handles versioned buckets correctly by deleting all versions and delete markers
- **Dry Run**: Always test with `--dry-run` first to preview what will be deleted
- **Irreversible**: Emptying buckets is irreversible. Ensure you have backups if needed
- **Stack Deletion**: After emptying buckets, you can safely delete the CloudFormation stack

## Integration with Stack Deletion

This script is designed to be run before deleting a CloudFormation stack:

```bash
# 1. Empty buckets (dry run first)
pnpm nx run admin-s3-empty:empty:emcnotary:dry-run

# 2. Empty buckets (actual)
pnpm nx run admin-s3-empty:empty:emcnotary

# 3. Delete stack
aws cloudformation delete-stack --stack-name emcnotary-mailserver-core
```

