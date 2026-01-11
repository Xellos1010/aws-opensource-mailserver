# Next Steps Plan - System Status Report Analysis

**Generated**: 2026-01-10T23:54:23Z  
**Instance**: i-0bb56d49f12d430b4 (3.229.143.6)  
**Domain**: emcnotary.com  
**Hostname**: box.emcnotary.com

## Executive Summary

The system status report indicates a **partially configured** instance:
- ✅ Bootstrap process completed (admin password param exists, bootstrap file present)
- ❌ Mail-in-a-Box services are NOT running
- ❌ Mail-in-a-Box installation directory NOT found
- ❌ No DNS records configured
- ❌ No SSL certificate provisioned
- ❌ No users configured

**Status**: Bootstrap process completed but MIAB installation/services appear incomplete or failed.

---

## Current State Analysis

### ✅ What's Working

1. **Instance Status**
   - EC2 instance is running
   - SSH access configured
   - Bootstrap process completed (marker file exists)
   - Admin password stored in SSM Parameter Store

2. **Infrastructure**
   - Stack deployed successfully
   - Instance has public IP
   - Hostname configured: box.emcnotary.com

### ❌ Critical Issues

1. **Mail-in-a-Box Not Installed**
   - `/opt/mailinabox` directory not found
   - All services (postfix, dovecot, nginx, named) not running
   - This suggests the bootstrap script may have failed during MIAB installation

2. **DNS Not Configured**
   - No DNS records found via MIAB DNS management
   - A record missing
   - CNAME, MX, TXT records missing
   - DNS service (named) not running

3. **SSL Not Provisioned**
   - SSL certificate file not found
   - Cannot verify HTTPS connectivity

4. **No Users**
   - No user accounts configured
   - No mailboxes exist

---

## Recommended Next Steps

### Phase 1: Diagnose Bootstrap Failure (IMMEDIATE)

**Priority**: 🔴 CRITICAL

1. **Check Bootstrap Logs**
   ```bash
   APP_PATH=apps/cdk-emc-notary/instance pnpm nx run cdk-emcnotary-instance:admin:bootstrap:logs
   ```

2. **Check SSM Command Status**
   ```bash
   APP_PATH=apps/cdk-emc-notary/instance pnpm nx run cdk-emcnotary-instance:admin:bootstrap:status
   ```

3. **SSH to Instance and Check**
   ```bash
   # Check bootstrap log
   ssh -i ~/.ssh/emcnotary-com-mailserver-instance.pem ubuntu@3.229.143.6 \
     "tail -100 /var/log/mailinabox_setup.log"
   
   # Check if MIAB directory exists
   ssh -i ~/.ssh/emcnotary-com-mailserver-instance.pem ubuntu@3.229.143.6 \
     "ls -la /opt/mailinabox"
   
   # Check systemd services
   ssh -i ~/.ssh/emcnotary-com-mailserver-instance.pem ubuntu@3.229.143.6 \
     "systemctl status postfix dovecot nginx named"
   ```

**Expected Outcomes**:
- Identify why MIAB installation failed
- Determine if bootstrap needs to be re-run
- Check for error messages in logs

---

### Phase 2: Fix Bootstrap Issues (IF NEEDED)

**Priority**: 🔴 CRITICAL

**If bootstrap failed or incomplete:**

1. **Re-run Bootstrap**
   ```bash
   APP_PATH=apps/cdk-emc-notary/instance pnpm nx run cdk-emcnotary-instance:admin:bootstrap-miab-ec2-instance
   ```

2. **Monitor Bootstrap Progress**
   ```bash
   # In one terminal, follow logs
   APP_PATH=apps/cdk-emc-notary/instance FOLLOW=1 pnpm nx run cdk-emcnotary-instance:admin:bootstrap:logs --follow
   
   # In another terminal, check status
   APP_PATH=apps/cdk-emc-notary/instance pnpm nx run cdk-emcnotary-instance:admin:bootstrap:status
   ```

3. **Verify Bootstrap Completion**
   ```bash
   APP_PATH=apps/cdk-emc-notary/instance pnpm nx run cdk-emcnotary-instance:admin:bootstrap:confirm
   ```

**Expected Outcomes**:
- MIAB successfully installed
- All services running
- Bootstrap confirmation passes

---

### Phase 3: Configure DNS Records

**Priority**: 🟡 HIGH (After Phase 1-2)

**Once MIAB is running:**

1. **Restore DNS from Backup** (if available)
   ```bash
   APP_PATH=apps/cdk-emc-notary/instance \
   BACKUP_PATH=Archive/backups/emcnotary.com/dns/dns-backup-20250915-120038.json \
   pnpm exec tsx tools/restore-dns.cli.ts --backup-path Archive/backups/emcnotary.com/dns/dns-backup-20250915-120038.json
   ```

2. **Or Set SES DNS Records**
   ```bash
   APP_PATH=apps/cdk-emc-notary/instance pnpm nx run cdk-emcnotary-instance:admin:ses-dns:set
   ```

3. **Verify DNS Records**
   ```bash
   APP_PATH=apps/cdk-emc-notary/instance pnpm exec tsx tools/list-miab-dns.cli.ts
   ```

**Expected Outcomes**:
- A record configured (box.emcnotary.com -> 3.229.143.6)
- CNAME records configured (www -> box.emcnotary.com)
- MX records configured
- TXT records configured (SPF, DKIM, DMARC)

---

### Phase 4: Provision SSL Certificate

**Priority**: 🟡 HIGH (After Phase 3)

**Once DNS is configured:**

1. **Provision SSL Certificate**
   ```bash
   APP_PATH=apps/cdk-emc-notary/instance pnpm nx run cdk-emcnotary-instance:admin:ssl:provision
   ```

2. **Check SSL Status**
   ```bash
   APP_PATH=apps/cdk-emc-notary/instance pnpm exec tsx tools/ssl-status.cli.ts
   ```

**Expected Outcomes**:
- SSL certificate provisioned
- HTTPS accessible
- Certificate valid and not expired

---

### Phase 5: Restore Users and Mailboxes

**Priority**: 🟢 MEDIUM (After Phase 4)

**Once SSL is provisioned:**

1. **Restore Users from Backup** (if available)
   ```bash
   APP_PATH=apps/cdk-emc-notary/instance \
   BACKUP_PATH=Archive/backups/emcnotary.com/mailboxes/mailboxes-backup-20250923_195631 \
   pnpm exec tsx tools/restore-users-and-mailboxes.cli.ts \
     --backup-path Archive/backups/emcnotary.com/mailboxes/mailboxes-backup-20250923_195631
   ```

2. **Or Create Users Manually**
   ```bash
   # Create admin account
   APP_PATH=apps/cdk-emc-notary/instance pnpm exec tsx tools/create-admin-account.cli.ts
   
   # Create multiple users
   APP_PATH=apps/cdk-emc-notary/instance pnpm exec tsx tools/create-multiple-users.cli.ts --users user1@emcnotary.com,user2@emcnotary.com
   ```

3. **Verify Users and Mailboxes**
   ```bash
   APP_PATH=apps/cdk-emc-notary/instance pnpm exec tsx tools/list-miab-users.cli.ts
   ```

**Expected Outcomes**:
- Users created
- Mailboxes exist for each user
- Users can access email

---

### Phase 6: Final Verification

**Priority**: 🟢 MEDIUM

**Run comprehensive status check:**

```bash
APP_PATH=apps/cdk-emc-notary/instance pnpm exec tsx tools/system-status-report.cli.ts --output .cursor/system-status-report-final.json
```

**Expected Outcomes**:
- ✅ All services running
- ✅ DNS records configured
- ✅ SSL certificate valid
- ✅ Users and mailboxes exist
- ✅ All critical checks pass

---

## Decision Points

### If Bootstrap Logs Show Errors:

1. **Check for common issues**:
   - Network connectivity problems
   - Package installation failures
   - Disk space issues
   - Permission problems

2. **Fix issues and re-run bootstrap**

3. **If bootstrap continues to fail**:
   - Consider manual MIAB installation via SSH
   - Check instance resources (CPU, memory, disk)
   - Review CloudWatch logs for additional context

### If Bootstrap Completed But Services Not Running:

1. **Manually start services**:
   ```bash
   ssh -i ~/.ssh/emcnotary-com-mailserver-instance.pem ubuntu@3.229.143.6 \
     "sudo systemctl start postfix dovecot nginx named"
   ```

2. **Check service status and errors**

3. **Investigate why services didn't start automatically**

---

## Quick Reference Commands

### Status Checks
```bash
# Full system status
APP_PATH=apps/cdk-emc-notary/instance pnpm exec tsx tools/system-status-report.cli.ts

# Bootstrap status
APP_PATH=apps/cdk-emc-notary/instance pnpm nx run cdk-emcnotary-instance:admin:bootstrap:status

# Bootstrap confirmation
APP_PATH=apps/cdk-emc-notary/instance pnpm nx run cdk-emcnotary-instance:admin:bootstrap:confirm

# List users
APP_PATH=apps/cdk-emc-notary/instance pnpm exec tsx tools/list-miab-users.cli.ts

# List DNS records
APP_PATH=apps/cdk-emc-notary/instance pnpm exec tsx tools/list-miab-dns.cli.ts

# SSL status
APP_PATH=apps/cdk-emc-notary/instance pnpm exec tsx tools/ssl-status.cli.ts
```

### Operations
```bash
# Re-run bootstrap
APP_PATH=apps/cdk-emc-notary/instance pnpm nx run cdk-emcnotary-instance:admin:bootstrap-miab-ec2-instance

# Set SES DNS
APP_PATH=apps/cdk-emc-notary/instance pnpm nx run cdk-emcnotary-instance:admin:ses-dns:set

# Provision SSL
APP_PATH=apps/cdk-emc-notary/instance pnpm nx run cdk-emcnotary-instance:admin:ssl:provision
```

---

## Notes

- The bootstrap process appears to have completed (marker file exists) but MIAB installation may have failed
- All next steps assume we're working with the `emcnotary.com` domain
- Backup files referenced are from `Archive/backups/emcnotary.com/`
- All commands use `APP_PATH=apps/cdk-emc-notary/instance` for stack resolution

---

## Status Report Files

- **Full Report**: `.cursor/system-status-report.json`
- **Output Log**: `.cursor/system-status-report-output.txt`
- **This Plan**: `.cursor/next-steps-plan.md`


