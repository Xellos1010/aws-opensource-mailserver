# User and Mailbox Backup/Restore System

## Overview

Enhance bootstrap to create admin user, add user backup to backup bridge, and create tools to discover users from mailbox backups and restore both users and mailboxes. All operations use Mail-in-a-Box management scripts only (no SQLite writes). Support both legacy and new backup formats.

## Implementation Tasks

### 1. Update Bootstrap Script for Admin User Creation

**File**: `libs/support-scripts/aws/instance-bootstrap/assets/miab-setup.sh`

- After MIAB setup completes successfully, add user creation logic:
- Wait for API key generation: Poll for `/var/lib/mailinabox/api.key` with timeout (max 5 minutes, check every 10 seconds)
- Check if admin user (`admin@${DOMAIN_NAME}`) exists via `cli.py user` (read-only check)
- If not exists, create via `cli.py user add "${EMAIL_ADDR}" "${EMAIL_PW}" admin` (v73+) or `users.py add` (older)
- Set password for `me@${PRIMARY_HOSTNAME}` to match admin password via `cli.py user password` or `users.py password`
- Make both operations idempotent (check existence first, skip if already correct)
- Add graceful error handling: Log errors, continue if user creation fails (non-fatal)
- Retry logic: Retry user creation up to 3 times with exponential backoff if API key becomes available

**Location**: After line 367 (after MIAB setup completes)

### 2. Create User Discovery Tool from Mailbox Backups

**New File**: `tools/discover-users-from-mailboxes.cli.ts`

- **Support Both Legacy and New Backup Formats:**
- **Legacy Format**: `Archive/backups/{domain}/mailboxes/mailboxes-backup-{timestamp}/{domain}/{username}/`
- **New Format**: `dist/backups/{domain-name}/mail/{timestamp}-{runId}/{domain}/{username}/`
- **Tar.gz Format**: Extract tar.gz files if needed, then scan extracted directory

- **Auto-detect Backup Format:**
- Check for `mailboxes-backup-` pattern (legacy)
- Check for `{timestamp}-{runId}` pattern (new)
- Check for tar.gz files (extract if needed)
- Detect domain from path structure or require explicit domain

- **Scan and Extract Users:**
- Navigate to domain subdirectory (e.g., `emcnotary.com/` or `askdaokapra.com/`)
- Extract usernames from directory names (e.g., `admin`, `adobe`, `appt`, `inquiry`)
- Validate mailbox structure (check for Maildir format: `cur/`, `new/`, `tmp/` directories)
- Generate email addresses: `{username}@{domain}`
- Filter out system directories (e.g., `.`, `..`, hidden files, non-Maildir directories)

- **Output and Metadata:**
- Output JSON array of discovered users with metadata:
- Email address
- Username
- Domain
- Backup path
- Backup format (legacy/new)
- Mailbox size (optional)
- File count (optional)
- Maildir validation status

- **Error Handling:**
- Continue scanning on individual directory errors
- Log warnings for invalid mailbox structures
- Provide clear error messages for unsupported formats

- **Progress Indicators:**
- Show progress for large backup directories
- Show format detection status
- Show extraction progress if tar.gz files found

**CLI Options**:

- `--backup-path`: Path to mailbox backup directory or tar.gz file (required)
- `--domain`: Domain name (default: auto-detect from path structure)
- `--output`: Output JSON file path (optional, defaults to stdout)
- `--validate-structure`: Validate Maildir structure (default: true)
- `--include-metadata`: Include mailbox metadata in output (size, file count, etc.)
- `--extract-tar`: Auto-extract tar.gz files if found (default: true)
- `--temp-dir`: Temporary directory for tar.gz extraction (default: system temp)

### 3. Create Multi-User Creation Tool

**New File**: `tools/create-multiple-users.cli.ts`

- Wait for API key availability before starting (with timeout and progress indicator)
- Accept JSON array of users (from discovery tool or manual input)
- For each user:
- Check if exists via `cli.py user` (read-only, no SQLite writes)
- If not exists, create via `cli.py user add` (v73+) or `users.py add` (older)
- Set admin privileges via `cli.py user make-admin` or `users.py privileges add`
- Generate random password if not provided (store in SSM for recovery)
- Retry on transient failures (API key unavailable, network issues)
- Make idempotent (skip existing users, verify before attempting creation)
- Report success/failure for each user with detailed error messages
- Continue processing remaining users on individual failures
- Provide summary report at end (success count, failure count, skipped count)

**CLI Options**:

- `--users`: JSON file path or inline JSON array
- `--domain`: Domain name
- `--default-password`: Default password for users without password specified
- `--admin-users`: Comma-separated list of emails to grant admin privileges
- `--wait-for-api-key`: Wait for API key to be available (default: true, max 5 minutes)
- `--retry-attempts`: Number of retry attempts per user (default: 3)

### 4. Create Mailbox Restore Tool

**New File**: `tools/restore-mailboxes.cli.ts`

- **Support Both Legacy and New Backup Formats:**
- **Legacy Format**: `Archive/backups/{domain}/mailboxes/mailboxes-backup-{timestamp}/{domain}/{username}/`
- **New Format**: `dist/backups/{domain-name}/mail/{timestamp}-{runId}/{domain}/{username}/`
- **Tar.gz Format**: Auto-extract tar.gz files if provided, then restore

- **Auto-detect and Handle Backup Format:**
- Detect backup format (legacy vs new)
- Extract tar.gz files to temporary directory if needed
- Navigate to correct domain subdirectory
- Handle both directory structures gracefully

- **Validate Backup Structure:**
- Check for required directories before starting
- Verify Maildir format (check for `cur/`, `new/`, `tmp/` directories)
- Validate domain structure matches expected format

- **Restore Process:**
- For each mailbox directory:
- Extract domain and username from path structure (handle both formats)
- Verify mailbox structure (check for Maildir format: cur/, new/, tmp/)
- Upload mailbox via rsync/SSH to `/home/user-data/mail/mailboxes/{domain}/{username}/`
- Set proper ownership (`mail:mail`) and permissions (`755` for directories, `644` for files)
- Verify upload success (check file counts, directory structure)
- Batch operations: Upload all mailboxes, then set permissions in batch
- Clean up temporary extraction directories after restore

- **Service Management:**
- Restart Dovecot/Postfix after all mailboxes restored (only if changes made)
- Option to skip service restart for testing

- **Progress and Error Handling:**
- Support dry-run mode with detailed preview
- Progress indicators: Show progress for large mailbox uploads
- Error handling: Continue with next mailbox on failure, log errors
- Verification: After restore, verify mailboxes are accessible

**CLI Options**:

- `--backup-path`: Path to mailbox backup directory or tar.gz file (required)
- `--domain`: Domain name (default: auto-detect from path)
- `--dry-run`: Show what would be restored without executing
- `--restart-services`: Restart mail services after restore (default: true)
- `--verify-after-restore`: Verify mailboxes after restore (default: true)
- `--parallel-uploads`: Number of parallel mailbox uploads (default: 1, for large restores)
- `--extract-tar`: Auto-extract tar.gz files if found (default: true)
- `--temp-dir`: Temporary directory for tar.gz extraction (default: system temp)
- `--backup-format`: Force backup format (legacy/new/auto) (default: auto-detect)

### 5. Create Combined Restore Tool

**New File**: `tools/restore-users-and-mailboxes.cli.ts`

- **Support Both Legacy and New Backup Formats:**
- Auto-detect backup format (legacy/new/tar.gz)
- Handle both directory structures seamlessly
- Extract tar.gz files if needed

- **Unified Workflow:**

1. Validate backup path and structure (detect format)
2. Discover users from mailbox backup structure (with progress indicator, both formats)
3. Wait for API key availability (if creating users)
4. Create users (via `create-multiple-users` logic) - management scripts only
5. Verify users were created successfully
6. Restore mailboxes (via `restore-mailboxes` logic, both formats)
7. Verify mailboxes are accessible after restore
8. Clean up temporary extraction directories

- **Progress and Error Handling:**
- Provide unified progress reporting across all steps
- Handle errors gracefully (continue with next user/mailbox on failure)
- Transaction-like behavior: Option to rollback on critical failures
- Summary report: Users created, mailboxes restored, failures, warnings, backup format detected

**CLI Options**:

- `--backup-path`: Path to mailbox backup directory or tar.gz file (required)
- `--domain`: Domain name (default: auto-detect from path)
- `--default-password`: Default password for users (required if creating users)
- `--skip-users`: Skip user creation (only restore mailboxes)
- `--skip-mailboxes`: Skip mailbox restore (only create users)
- `--wait-for-api-key`: Wait for API key before user creation (default: true, max 5 minutes)
- `--verify-after-restore`: Verify users and mailboxes after restore (default: true)
- `--dry-run`: Preview operations without executing
- `--backup-format`: Force backup format (legacy/new/auto) (default: auto-detect)
- `--extract-tar`: Auto-extract tar.gz files if found (default: true)

### 6. Update Backup Bridge to Include User Backup

**File**: `libs/admin/admin-backup-bridge/src/lib/backup-bridge.ts`

- Add user backup step before mail backup:
- Call `backupUsers()` from `admin-users-backup`
- Store in `dist/backups/{domain}/users/{timestamp}/`
- Include in backup summary
- Add `skipUsers` option to config (default: false)
- Update `BackupBridgeResult` type to include `userBackup` field

**Location**: After DNS backup, before mail backup (around line 130)

### 7. Add Nx Tasks for New Tools

**File**: `apps/cdk-emc-notary/instance/project.json`

Add new admin tasks:

- `admin:users:discover-from-mailboxes` - Discover users from mailbox backup
- `admin:users:create-multiple` - Create multiple users from JSON
- `admin:mailboxes:restore` - Restore mailboxes from backup
- `admin:restore:users-and-mailboxes` - Combined restore workflow

### 8. Update Create Admin Account Tool

**File**: `tools/create-admin-account.cli.ts`

- Remove all SQLite direct write operations
- Wait for API key availability before attempting user operations (with timeout)
- Use only `cli.py` (v73+) or `users.py` (older) management scripts
- Ensure it properly handles `me@` user password update via `cli.py user password`
- Add option to update `me@` password to match admin password
- Make idempotent (check if user exists and password matches before updating)
- Add retry logic with exponential backoff for API key availability
- Graceful error handling: Clear error messages, troubleshooting steps
- Fallback: If API key unavailable, provide instructions to wait for setup completion

### 9. Add API Key Helper Utility

**New File**: `libs/admin/admin-miab-api/src/lib/api-key.ts`

- Utility functions for API key management:
- `waitForApiKey()`: Poll for API key with timeout and progress
- `checkApiKeyAvailable()`: Check if API key exists and is readable
- `getApiKeyPath()`: Return standard API key path
- Reusable across all tools that need API key

### 10. Enhanced Error Messages and Troubleshooting

- All tools provide:
- Clear error messages with context
- Troubleshooting steps for common issues
- Links to relevant documentation
- Suggested next steps
- Error categorization: Transient (retry), Permanent (skip), Critical (abort)

### 11. Progress Indicators and Logging

- Progress bars for long operations (user creation, mailbox restore)
- Estimated time remaining
- Detailed logging to files (optional)
- Structured JSON logs for programmatic parsing
- Verbose mode for debugging

### 12. Validation and Pre-flight Checks

- Validate backup structure before starting restore
- Check disk space before mailbox restore
- Verify SSH/SSM connectivity before operations
- Check Mail-in-a-Box version compatibility
- Validate user input (email format, password strength)

## Key Implementation Details

### Backup Format Support

- **Legacy Format**: `Archive/backups/{domain}/mailboxes/mailboxes-backup-{timestamp}/{domain}/{username}/`
- **New Format**: `dist/backups/{domain-name}/mail/{timestamp}-{runId}/{domain}/{username}/`
- **Tar.gz Format**: `mail-backup-{timestamp}-{runId}.tar.gz` (contains same structure when extracted)
- **On Server**: `/home/user-data/mail/mailboxes/{domain}/{username}/`

### API Key Management

- **Location**: `/var/lib/mailinabox/api.key`
- **Generation**: Created by Mail-in-a-Box `setup/start.sh` after first user creation
- **Waiting Strategy**: Poll every 10 seconds, max 5 minutes timeout
- **Verification**: Check file exists and is readable by `user-data` user
- **Error Handling**: If unavailable, provide clear error message and wait instructions

### User Creation Strategy (NO SQLite Writes)

1. Wait for API key availability (with timeout and progress indicator)
2. Use `cli.py user add` (v73+) or `users.py add` (older versions) - management scripts only
3. If API key unavailable: Wait and retry (up to 3 attempts with exponential backoff)
4. Never write directly to SQLite - use management scripts exclusively
5. Always idempotent (check existence via `cli.py user` first, skip if exists)

### Password Handling

- Admin password stored in SSM: `/MailInABoxAdminPassword-{STACK_NAME}`
- `me@` password set to match admin password during bootstrap via `cli.py user password`
- User passwords in restore: use provided password or generate random (store in SSM for recovery)
- Password changes: Always use `cli.py user password` or `users.py password` - never SQLite

### Error Handling & Gracefulness

- **API Key Unavailable**: Wait with progress indicator, retry with exponential backoff, clear error messages
- **User Creation Failures**: Continue with next user, log detailed error, provide troubleshooting steps
- **Mailbox Restore Failures**: Continue with next mailbox, verify structure before restore, retry on transient errors
- **Progress Indicators**: Show progress bars for long operations, estimated time remaining
- **Validation**: Verify inputs before starting operations, validate backup structure
- **Rollback**: On critical failures, provide rollback instructions
- **Summary Reports**: Detailed success/failure counts, skipped items, error summaries
- **Non-blocking**: Individual failures don't stop entire operation
- **Retry Logic**: Automatic retries for transient failures (network, API key, permissions)
- **Dry-run Support**: Preview operations before executing

## Testing Considerations

- Test bootstrap with fresh instance (should create admin and set me@ password)
- Test API key waiting logic (simulate delayed API key generation)
- Test user discovery with both legacy and new backup formats
- Test multi-user creation with various scenarios (existing users, new users, admin privileges, API key unavailable)
- Test mailbox restore with both legacy and new backup formats, including tar.gz extraction
- Test combined restore workflow end-to-end with both formats
- Verify idempotency (re-running should not duplicate users/mailboxes)
- Test error scenarios: Network failures, permission errors, invalid backups, unsupported formats
- Test graceful degradation: Partial failures should not abort entire operation