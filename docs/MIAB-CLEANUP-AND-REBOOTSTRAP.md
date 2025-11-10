# Mail-in-a-Box Cleanup and Re-bootstrap Process

## Overview

This document outlines the process for removing a current Mail-in-a-Box installation and re-bootstrapping with the correct version. This is useful when:

- Git permission issues prevent updates
- Wrong version was installed
- Need to start fresh with correct tag
- Management scripts are missing or corrupted

## Quick Start

```bash
# 1. Cleanup current installation (preserves user data)
pnpm nx run cdk-emcnotary-instance:admin:miab:cleanup

# 2. Re-bootstrap with correct version
pnpm nx run cdk-emcnotary-instance:admin:bootstrap-miab-ec2-instance

# 3. Verify installation
pnpm nx run cdk-emcnotary-instance:admin:miab:audit
```

## Detailed Process

### Step 1: Cleanup Current Installation

The cleanup task removes the Mail-in-a-Box git repository and bootstrap markers, allowing a fresh bootstrap.

#### Basic Cleanup (Preserves User Data)

```bash
pnpm nx run cdk-emcnotary-instance:admin:miab:cleanup
```

**What this does:**
- ✅ Removes `/opt/mailinabox` (git repository)
- ✅ Removes bootstrap completion markers
- ✅ Stops Mail-in-a-Box services (if running)
- ✅ Preserves `/home/user-data` (all user data, emails, configs)
- ✅ Preserves installed packages

**Use this when:**
- You want to keep user data and emails
- Only need to fix the git repository/version
- Services are working but version is wrong

#### Full Cleanup (Removes Everything)

```bash
PRESERVE_DATA=0 pnpm nx run cdk-emcnotary-instance:admin:miab:cleanup
```

**What this does:**
- ✅ Everything from basic cleanup
- ✅ Removes package installation markers (forces reinstall)
- ❌ Still preserves `/home/user-data` (user data)

**Use this when:**
- You want a completely fresh start
- Packages need to be reinstalled
- Still want to keep user data

#### Verbose Output

```bash
VERBOSE=1 pnpm nx run cdk-emcnotary-instance:admin:miab:cleanup
```

Shows detailed output of each cleanup step.

### Step 2: Re-bootstrap

After cleanup, run the bootstrap task to install the correct version:

```bash
FEATURE_INSTANCE_BOOTSTRAP_ENABLED=1 \
  pnpm nx run cdk-emcnotary-instance:admin:bootstrap-miab-ec2-instance
```

**What this does:**
- ✅ Clones fresh Mail-in-a-Box repository
- ✅ Checks out correct tag (auto-detected from GitHub API, SSM Parameter Store, or explicit override)
- ✅ Installs/updates packages (if markers removed)
- ✅ Configures Mail-in-a-Box
- ✅ Sets up SES relay
- ✅ Configures backups

**Dry-run first (recommended):**

```bash
FEATURE_INSTANCE_BOOTSTRAP_ENABLED=1 DRY_RUN=1 \
  pnpm nx run cdk-emcnotary-instance:admin:bootstrap-miab-ec2-instance:dry-run
```

### Step 3: Verify Installation

After bootstrap completes, verify everything is correct:

```bash
# Audit version and management scripts
pnpm nx run cdk-emcnotary-instance:admin:miab:audit

# List users
pnpm nx run cdk-emcnotary-instance:admin:users:list

# Check DNS records
pnpm nx run cdk-emcnotary-instance:admin:dns:list

# Verify SSL certificates
pnpm nx run cdk-emcnotary-instance:admin:ssl:status
```

## Git Permission Issues

### Problem

Git operations fail with:
```
error: cannot open .git/FETCH_HEAD: Permission denied
```

### Root Cause

The `/opt/mailinabox` repository was cloned as root, but git operations are being run as a different user, or permissions got corrupted.

### Solution

The bootstrap script now automatically fixes git permissions:

1. **Automatic Fix**: The bootstrap script (`miab-setup.sh`) now:
   - Checks git directory accessibility
   - Fixes ownership (`chown -R root:root .git`)
   - Fixes permissions (`chmod -R u+rwX .git`)
   - Adds safe directory configuration (`git config --global --add safe.directory /opt/mailinabox`)

2. **Manual Fix** (if needed):
   ```bash
   ssh -i <key> ubuntu@<instance-ip>
   sudo chown -R root:root /opt/mailinabox/.git
   sudo chmod -R u+rwX /opt/mailinabox/.git
   git config --global --add safe.directory /opt/mailinabox
   ```

3. **Cleanup and Re-bootstrap** (recommended):
   ```bash
   # This ensures a clean git repository
   pnpm nx run cdk-emcnotary-instance:admin:miab:cleanup
   pnpm nx run cdk-emcnotary-instance:admin:bootstrap-miab-ec2-instance
   ```

## Complete Example

```bash
# 1. Check current status
pnpm nx run cdk-emcnotary-instance:admin:miab:audit

# 2. Cleanup (if needed)
pnpm nx run cdk-emcnotary-instance:admin:miab:cleanup

# 3. Dry-run bootstrap
FEATURE_INSTANCE_BOOTSTRAP_ENABLED=1 DRY_RUN=1 \
  pnpm nx run cdk-emcnotary-instance:admin:bootstrap-miab-ec2-instance:dry-run

# 4. Run bootstrap
FEATURE_INSTANCE_BOOTSTRAP_ENABLED=1 \
  pnpm nx run cdk-emcnotary-instance:admin:bootstrap-miab-ec2-instance

# 5. Monitor bootstrap status
pnpm nx run cdk-emcnotary-instance:admin:bootstrap:status

# 6. Follow bootstrap logs
pnpm nx run cdk-emcnotary-instance:admin:bootstrap:logs:follow

# 7. Verify installation
pnpm nx run cdk-emcnotary-instance:admin:miab:audit
pnpm nx run cdk-emcnotary-instance:admin:users:list
```

## Troubleshooting

### Cleanup Fails

**Error**: `SSH key not found`

**Solution**:
```bash
pnpm nx run cdk-emcnotary-instance:admin:ssh:setup
```

### Bootstrap Fails

**Error**: `SSM agent is NOT ready`

**Solution**:
```bash
# Fix SSM agent
pnpm nx run cdk-emcnotary-instance:admin:fix-ssm-agent

# Then retry bootstrap
pnpm nx run cdk-emcnotary-instance:admin:bootstrap-miab-ec2-instance
```

### Git Permission Issues Persist

**Error**: `Permission denied` even after cleanup

**Solution**:
```bash
# SSH to instance and manually fix
ssh -i <key> ubuntu@<instance-ip>
sudo rm -rf /opt/mailinabox
sudo rm -f /home/user-data/.miab_setup_complete
sudo rm -f /home/user-data/.bootstrap_complete

# Then run bootstrap again
```

### Management Scripts Missing

**Error**: `management directory not found`

**Solution**:
```bash
# Cleanup and re-bootstrap
pnpm nx run cdk-emcnotary-instance:admin:miab:cleanup
pnpm nx run cdk-emcnotary-instance:admin:bootstrap-miab-ec2-instance

# The bootstrap script now ensures management directory exists
```

## Related Tasks

- `admin:miab:cleanup` - Remove MIAB installation
- `admin:bootstrap-miab-ec2-instance` - Bootstrap MIAB
- `admin:bootstrap-miab-ec2-instance:dry-run` - Preview bootstrap
- `admin:miab:audit` - Audit MIAB version
- `admin:users:list` - List MIAB users
- `admin:dns:list` - List DNS records
- `admin:ssl:status` - Check SSL certificates
- `admin:bootstrap:status` - Check bootstrap status
- `admin:bootstrap:logs` - View bootstrap logs

## Notes

- **Idempotent**: Bootstrap can be run multiple times safely
- **Preserves Data**: Cleanup preserves `/home/user-data` by default
- **Automatic Fixes**: Bootstrap script automatically fixes git permissions
- **Version Resolution**: Version is auto-detected from GitHub API, SSM Parameter Store (`/MailInABoxVersion-{stackName}`), or explicit override (`MAILINABOX_VERSION` env var or `--version` flag). No hardcoded fallback.
- **Management Scripts**: Bootstrap ensures management directory exists before proceeding

