# Admin Mailbox Restore Library

Library for aggregating and restoring mailboxes from multiple backup folders with deduplication.

## Features

- **Aggregate backups**: Combines users and emails from multiple backup folders
- **Deduplication**: Removes duplicate emails using SHA-256 hash
- **User creation**: Creates users if they don't exist (skips existing users)
- **Email restoration**: Restores emails to mailboxes (skips existing emails)
- **Password generation**: Auto-generates passwords for new users (except admin@domain)

## Usage

### Aggregating Backups

```typescript
import { aggregateBackups, findBackupFolders } from '@mm/admin-mailbox-restore';

// Find backup folders automatically
const backupBaseDir = 'Archive/backups/emcnotary.com/mailboxes';
const backupFolders = findBackupFolders(backupBaseDir);

// Or specify folders manually
const backupFolders = [
  'Archive/backups/emcnotary.com/mailboxes/mailboxes-backup-20250923_201744',
  'Archive/backups/emcnotary.com/mailboxes/mailboxes-backup-20250923_195631',
  'Archive/backups/emcnotary.com/mailboxes/mailboxes-backup-20250915_000853',
];

// Aggregate users and emails
const result = await aggregateBackups(backupFolders, 'emcnotary.com');

console.log(`Found ${result.totalUsers} users`);
console.log(`Found ${result.totalEmails} emails (deduplicated)`);
console.log(`Total size: ${(result.totalSize / 1024 / 1024).toFixed(2)} MB`);
```

### Restoring Mailboxes

```typescript
import { restoreMailboxes } from '@mm/admin-mailbox-restore';

const results = await restoreMailboxes({
  keyPath: '/path/to/ssh/key',
  instanceIp: '1.2.3.4',
  domain: 'emcnotary.com',
  users: aggregateResult.users,
  adminPassword: 'admin-password',
  generatePasswords: true,
  skipExistingUsers: true,
  skipExistingEmails: true,
  dryRun: false,
});

for (const [email, result] of results.entries()) {
  if (result.success) {
    console.log(`${email}: ${result.emailsRestored} emails restored`);
  }
}
```

## CLI Tools

### Restore Aggregated Mailboxes

Restores users and mailboxes from multiple backup folders:

```bash
# Auto-discover backup folders
nx run cdk-emcnotary-instance:admin:mailboxes:restore-aggregated

# Specify backup folders
BACKUP_FOLDERS="folder1,folder2,folder3" \
nx run cdk-emcnotary-instance:admin:mailboxes:restore-aggregated

# Specify backup base directory
BACKUP_BASE_DIR="Archive/backups/emcnotary.com/mailboxes" \
nx run cdk-emcnotary-instance:admin:mailboxes:restore-aggregated

# Dry run
DRY_RUN=1 nx run cdk-emcnotary-instance:admin:mailboxes:restore-aggregated
```

### Sync Master Backup

Syncs master backup folder with mailserver (skips duplicates):

```bash
MASTER_BACKUP_DIR="Archive/backups/emcnotary.com/mailboxes/master" \
nx run cdk-emcnotary-instance:admin:mailboxes:sync-master

# Dry run
MASTER_BACKUP_DIR="Archive/backups/emcnotary.com/mailboxes/master" \
DRY_RUN=1 nx run cdk-emcnotary-instance:admin:mailboxes:sync-master
```

### Archive Master Backup

Packages master backup folder into timestamped archive:

```bash
MASTER_BACKUP_DIR="Archive/backups/emcnotary.com/mailboxes/master" \
nx run cdk-emcnotary-instance:admin:mailboxes:archive-master

# Specify archive base directory
MASTER_BACKUP_DIR="Archive/backups/emcnotary.com/mailboxes/master" \
ARCHIVE_BASE_DIR="Archive/backups/emcnotary.com/mailboxes" \
nx run cdk-emcnotary-instance:admin:mailboxes:archive-master

# Custom timestamp
MASTER_BACKUP_DIR="Archive/backups/emcnotary.com/mailboxes/master" \
TIMESTAMP="2025-01-11_120000" \
nx run cdk-emcnotary-instance:admin:mailboxes:archive-master
```

## Workflow

### Initial Restore from Multiple Backups

1. **Aggregate backups**: Combines all backup folders, deduplicates emails
2. **Create users**: Creates users that don't exist (skips existing)
3. **Restore emails**: Uploads emails to mailboxes (skips existing)

```bash
nx run cdk-emcnotary-instance:admin:mailboxes:restore-aggregated
```

### Ongoing Sync with Master Backup

1. **Work with master backup**: Keep master backup folder up-to-date
2. **Sync to server**: Periodically sync master backup with mailserver

```bash
# Sync master backup
MASTER_BACKUP_DIR="Archive/backups/emcnotary.com/mailboxes/master" \
nx run cdk-emcnotary-instance:admin:mailboxes:sync-master
```

### Archive Master Backup

1. **Archive master**: Package master backup into timestamped archive
2. **Keep master clean**: Master backup remains for ongoing sync

```bash
# Archive master backup
MASTER_BACKUP_DIR="Archive/backups/emcnotary.com/mailboxes/master" \
nx run cdk-emcnotary-instance:admin:mailboxes:archive-master
```

## Deduplication

Emails are deduplicated using SHA-256 hash of file contents. This ensures:
- Same email from multiple backups is only restored once
- Different versions of same email are preserved (if hash differs)
- Efficient storage and restoration

## Password Generation

- **New users**: Random 16-character password generated automatically
- **Admin user**: Uses provided admin password (from SSM or --admin-password)
- **Existing users**: Password not changed (user creation skipped)

## Skipping Logic

- **Existing users**: Skipped if user already exists on server
- **Existing emails**: Skipped using rsync `--ignore-existing` flag
- **Dry run**: Preview changes without making them

## File Structure

```
Archive/backups/emcnotary.com/mailboxes/
├── mailboxes-backup-20250923_201744/
│   └── emcnotary.com/
│       ├── admin/
│       │   ├── cur/
│       │   ├── new/
│       │   └── tmp/
│       └── user1/
│           ├── cur/
│           ├── new/
│           └── tmp/
├── mailboxes-backup-20250923_195631/
│   └── emcnotary.com/
│       └── ...
└── master/  (for ongoing sync)
    └── emcnotary.com/
        └── ...
```


