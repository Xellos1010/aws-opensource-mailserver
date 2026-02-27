# EMC Notary Mail Server - Stabilization & Hardening Report
**Date:** 2026-02-19
**Instance:** `i-0239dde3de6782b2e` — `box.emcnotary.com` (3.229.143.6)
**Stack:** `emcnotary-com-mailserver-instance` (us-east-1)
**Status at Report Time:** ✅ RECOVERED — All services online

---

## 1. Incident Summary

**Trigger:** Apple Mail reported `emcnotary.com` email unavailable.

**Root Cause:** The root filesystem (`/dev/root`, 7.6G) reached **100% capacity**, causing:
- Dovecot (IMAP/IMAPS) to fail on startup — `Failed to set up mount namespacing: No space left on device`
- SSM RunCommand to fail silently (agent cannot write temp files)
- MIAB admin backend (gunicorn) to become unresponsive (502 Bad Gateway)
- SSH to drop after recovery attempt (fail2ban triggered by diagnosis connections)

**Timeline (all times UTC):**
| Time | Event |
|------|-------|
| 2026-02-19 08:00 | Nightly reboot (scheduled Lambda) |
| 08:01 | Services fail to start — disk full, Dovecot exits code 226/NAMESPACE |
| 08:01–20:37 | 12+ hours of mail server downtime |
| 20:37 | Recovery Orchestrator triggered instance restart (all SSM attempts failed) |
| 20:38–20:59 | Second reboot cycle; SSM still broken due to disk |
| 20:59 | Manual intervention: stop-start via `stop-start-helper` Lambda |
| 21:06 | SSH gained access; confirmed disk 100% |
| 21:08 | Freed 439MB (journal vacuum, SSM logs, apt cache) |
| 21:08 | Dovecot and Postfix restarted — **IMAPS 993 UP** |
| 21:08 | MIAB admin API confirmed operational |
| 21:10 | Lambda health check: **Healthy: True** |

---

## 2. Diagnostic Findings

### Services Checked (via NX targets)
| NX Target | Result |
|-----------|--------|
| `cdk-emcnotary-instance:admin:info` | ✅ Stack running, EC2 running |
| `cdk-emcnotary-instance:admin:ses:status` | ✅ SES domain verified, DKIM enabled |
| `cdk-emcnotary-instance:admin:ssl:status` | ✅ Let's Encrypt cert valid (expires Apr 11, 2026) |
| `cdk-emcnotary-instance:admin:availability:report` | ❌ IMAPS refused, disk 100% |
| `cdk-emcnotary-instance:admin:miab:status-check` | ✅ SSH connects, 0 MIAB checks parsed |
| `cdk-emcnotary-instance:admin:imap:auth:test` | ❌ Unknown error (Dovecot down) |

### Port Status (before recovery)
| Port | Service | Status |
|------|---------|--------|
| 443 | Nginx HTTPS | ✅ UP |
| 587 | Postfix SMTP submission | ✅ UP (Postfix survived) |
| 993 | Dovecot IMAPS | ❌ ECONNREFUSED |
| 22 | SSH | ❌ Initially refused |

### Disk Usage at Crisis Point
```
Filesystem  Size  Used  Avail  Use%  Mounted on
/dev/root   7.6G  7.6G     0   100%  /
```

### Space Freed During Recovery
| Source | Space Freed |
|--------|------------|
| systemd journal archive (vacuum) | ~176MB |
| Amazon SSM agent logs | ~50MB |
| apt package cache (`apt-get clean`) | ~187MB |
| Old compressed log archives | ~30MB |
| **Total** | **~443MB** |

### Confirmed Root Cause: Why Disk Filled
The 7.6GB EBS volume fills because of:
1. **systemd journal** — accumulates 8MB rotating archives indefinitely without size limits
2. **Amazon SSM agent logs** — `/var/log/amazon/` grows unbounded
3. **MIAB backup files** — `/home/user-data/backup/` and `/home/user-data/owncloud/`
4. **Apt cache** — package downloads not cleared after installs
5. **Mail logs** — `/var/log/mail.log.*` rotates but old gzips accumulate

---

## 3. Current Healthy State

```
Postfix:  active ✅
Dovecot:  active ✅
Mail Queue: empty ✅
SSL Cert: valid (50 days remaining) ✅
SES Relay: configured ✅
SES Domain: verified ✅
DKIM: enabled (3 tokens) ✅
Disk: 95% used (445MB free) ⚠️
```

---

## 4. Hardening Plan: Disk Space

### 4A. Immediate — NX Disk Cleanup (run now via NX)

```bash
# Run disk cleanup via NX (uses SSH)
NX_WORKSPACE_ROOT_PATH=/Users/evanmccall/Projects/aws-opensource-mailserver \
  AWS_PROFILE=hepe-admin-mfa \
  node .nx/installation/node_modules/.bin/nx run cdk-emcnotary-observability-maintenance:admin:cleanup:disk-space

# Or via backup-and-cleanup
node .nx/installation/node_modules/.bin/nx run cdk-emcnotary-observability-maintenance:admin:backup-and-cleanup
```

### 4B. Permanent — systemd Journal Limits (add to MIAB bootstrap)

Add to `/etc/systemd/journald.conf` on the instance:
```ini
[Journal]
SystemMaxUse=100M
SystemKeepFree=500M
RuntimeMaxUse=50M
```
Then: `sudo systemctl restart systemd-journald`

### 4C. Permanent — Automated Weekly Disk Cleanup

**New Lambda needed:** `disk-cleanup-emcnotary-com-mailserver-instance`
- Triggered by: EventBridge rule, weekly (Sunday 02:00 UTC)
- Action: SSH or SSM to run cleanup commands
- Fallback: CloudWatch disk alarm trigger (see 4D)

**NX Target to add** in `apps/cdk-emc-notary/instance/project.json`:
```json
"admin:disk:cleanup:schedule": {
  "executor": "nx:run-commands",
  "command": "AWS_PROFILE=hepe-admin-mfa tsx tools/schedule-disk-cleanup.cli.ts"
}
```

### 4D. Critical — CloudWatch Disk Alarm (REQUIRED)

The instance currently has NO disk space alarm. Add to CDK stack `EmcNotaryCoreStack` or `emcnotary-com-mailserver-instance`:

```typescript
// In CDK infra - disk space alarm
new cloudwatch.Alarm(this, 'DiskSpaceAlarm', {
  metric: new cloudwatch.Metric({
    namespace: 'CWAgent',
    metricName: 'disk_used_percent',
    dimensionsMap: {
      path: '/',
      InstanceId: ec2Instance.instanceId,
      fstype: 'ext4',
      device: 'xvda1',
    },
    statistic: 'Average',
    period: Duration.minutes(5),
  }),
  threshold: 85,
  evaluationPeriods: 2,
  comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
  alarmDescription: 'Disk usage above 85% - cleanup needed',
  alarmActions: [diskCleanupTopic],
});
```

**Requires:** CloudWatch agent installed on the instance (not currently installed — MIAB doesn't include it by default).

**Short-term workaround:** Use Lambda to poll disk via SSM periodically:
```bash
# New NX target - add to project.json
"admin:disk:monitor": {
  "command": "tsx tools/monitor-disk-space.cli.ts --domain emcnotary.com --threshold 85"
}
```

---

## 5. Recovery Orchestrator Fix

### Current Behavior (PROBLEM)
The Recovery Orchestrator (`mail-recovery-orchestrator-emcnotary-com-mailserver-instance`) tries:
1. `system_reset` via SSM → fails when disk full (SSM can't write)
2. `service_restart` via SSM → fails same reason
3. `instance_restart` (EC2 reboot) → triggers immediately after SSM fails

**3-5 minute reboot downtime** when SSM is unavailable.

### Required Fix: SSH Fallback Path

The Recovery Orchestrator should be updated to have a **4th recovery method** before instance restart:

```
Method 1: SSM service restart (fast, <30s)
Method 2: SSM system reset (fast, <60s)
Method 3: SSH service restart (medium, ~60s) ← ADD THIS
Method 4: MIAB Admin API restart (medium, ~60s) ← ADD THIS
Method 5: Instance stop-start (slow, 3-5min) ← current fallback
```

### Implementation in `mail-recovery-orchestrator-emcnotary-com-mailserver-instance` Lambda

```python
# Pseudo-code for updated orchestrator
methods = [
    ('ssm_service_restart', try_ssm_restart),    # ~30s
    ('ssm_system_reset', try_ssm_system_reset),   # ~60s
    ('ssh_service_restart', try_ssh_restart),      # ~60s (NEW)
    ('miab_api_restart', try_miab_api_restart),    # ~60s (NEW)
    ('instance_stop_start', try_stop_start),       # 3-5 min (LAST)
]
```

### SSH Restart Lambda Implementation
The Lambda needs SSH key access (already in SSM under `/emcnotary.com-keypair`):

```python
import paramiko
import boto3

def try_ssh_restart(instance_ip, ssm_client):
    # Get SSH key from SSM
    key_param = ssm_client.get_parameter(Name='/emcnotary.com-keypair', WithDecryption=True)
    key_data = key_param['Parameter']['Value']

    # Connect and restart
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(instance_ip, username='ubuntu', pkey=...)

    stdin, stdout, stderr = client.exec_command(
        'sudo systemctl restart dovecot postfix'
    )
    return stdout.read()
```

### NX Target for Manual Orchestrator Trigger
```bash
# Run recovery orchestrator via NX
NX_WORKSPACE_ROOT_PATH=... node .nx/installation/node_modules/.bin/nx run \
  cdk-emcnotary-instance:admin:recovery:trigger
```

---

## 6. Structural Hardening Items

### 6A. EBS Volume Resize (Recommended)
The 7.6GB EBS volume is too small for a production mail server. Resize to 20GB:

```bash
# Via NX CDK deploy after updating stack
NX_WORKSPACE_ROOT_PATH=... node .nx/installation/node_modules/.bin/nx run \
  cdk-emcnotary-instance:deploy -- --parameters RootVolumeSize=20
```

Or resize in-place:
```bash
# AWS CLI (no downtime required for EBS resize)
aws ec2 modify-volume --volume-id vol-xxxx --size 20 --profile hepe-admin-mfa
# Then resize partition in OS
sudo growpart /dev/xvda 1 && sudo resize2fs /dev/xvda1
```

### 6B. SSM Agent Hardening
SSM RunCommand should not fail instantly when disk is full. The agent should:
1. Detect disk full condition and report it as an error (not silent fail)
2. Have a dedicated partition for agent temp files

Current SSM failure mode: **Silent exit code 1, 0.001s elapsed, no stderr** — unmaintainable.

**Fix:** Add `sudo journalctl --vacuum-size=100M` to the nightly reboot script BEFORE services restart.

### 6C. Nightly Reboot Improvement
The nightly reboot Lambda (`emcnotary-com-mailserver--NightlyRebootFunction`) should:
1. Run disk cleanup BEFORE issuing the reboot
2. Verify services are healthy AFTER reboot (with retry)
3. Alert if services don't come up after 5 minutes

### 6D. NX_WORKSPACE_ROOT_PATH Documentation
Running NX commands from `aws-opensource-mailserver` requires overriding the env variable:

```bash
# REQUIRED for aws-opensource-mailserver NX commands:
NX_WORKSPACE_ROOT_PATH=/Users/evanmccall/Projects/aws-opensource-mailserver \
  node .nx/installation/node_modules/.bin/nx run cdk-emcnotary-instance:<target>

# The NX_WORKSPACE_ROOT_PATH env is set to emcnotary-website by VSCode extension
# which causes NX to find the wrong workspace
```

Add this to `aws-opensource-mailserver/CLAUDE.md` or README.

---

## 7. Observability Gaps Found

| Gap | Severity | Fix |
|-----|----------|-----|
| No disk space alarm | **CRITICAL** | CloudWatch CWAgent alarm at 85% |
| No post-reboot health check Lambda | High | Add to nightly reboot Lambda |
| SSM agent fails silently when disk full | High | Detect and report disk full in health check |
| No IMAP connectivity alarm | High | External probe Lambda every 5 min |
| Recovery orchestrator lacks SSH/API fallback | High | Add paramiko SSH or MIAB API restart |
| MIAB backup files grow unbounded | Medium | Add backup retention policy (7 days) |
| Journal max size not set | Medium | Add journald.conf limits to bootstrap |

---

## 8. Immediate Next Steps (Priority Order)

### Do Now (via NX + SSH)
```bash
# 1. Set journal size limits (prevents recurrence)
NX_WORKSPACE_ROOT_PATH=... nx run cdk-emcnotary-observability-maintenance:admin:cleanup:disk-space

# 2. Check SES relay and test mail flow
NX_WORKSPACE_ROOT_PATH=... nx run cdk-emcnotary-instance:admin:mail:flow:test

# 3. Provision SSL cert renewal reminder
NX_WORKSPACE_ROOT_PATH=... nx run cdk-emcnotary-instance:admin:ssl:status
```

### This Week (CDK + Lambda)
1. Add CloudWatch disk alarm to CDK stack → deploy
2. Update Recovery Orchestrator Lambda with SSH fallback path
3. Add `journald.conf` disk limits to MIAB bootstrap script
4. Add post-reboot health verification to nightly reboot Lambda

### This Month
1. Resize EBS volume from 7.6GB → 20GB
2. Implement disk monitoring NX task (`admin:disk:monitor`)
3. Enable CloudWatch agent on instance for CWAgent metrics
4. Set backup retention policy on MIAB backups (7-day max)

---

## 9. Service Recovery Commands Reference

```bash
# All commands use NX_WORKSPACE_ROOT_PATH override

export NX_ROOT=/Users/evanmccall/Projects/aws-opensource-mailserver
export NX_BIN=$NX_ROOT/.nx/installation/node_modules/.bin/nx
export NX_ENV="NX_WORKSPACE_ROOT_PATH=$NX_ROOT AWS_PROFILE=hepe-admin-mfa AWS_REGION=us-east-1"

# Check health
eval $NX_ENV $NX_BIN run cdk-emcnotary-instance:admin:availability:report

# Restart services (requires SSH working)
eval $NX_ENV $NX_BIN run cdk-emcnotary-instance:admin:fix:webmail-401

# Disk cleanup
eval $NX_ENV $NX_BIN run cdk-emcnotary-observability-maintenance:admin:cleanup:disk-space

# SES status
eval $NX_ENV $NX_BIN run cdk-emcnotary-instance:admin:ses:status

# MIAB status check
eval $NX_ENV $NX_BIN run cdk-emcnotary-instance:admin:miab:status-check

# Mail flow test
eval $NX_ENV $NX_BIN run cdk-emcnotary-instance:admin:mail:flow:test

# SSL status
eval $NX_ENV $NX_BIN run cdk-emcnotary-instance:admin:ssl:status

# Emergency: invoke recovery directly
aws lambda invoke \
  --function-name mail-recovery-orchestrator-emcnotary-com-mailserver-instance \
  --profile hepe-admin-mfa --region us-east-1 \
  --payload '{}' --cli-binary-format raw-in-base64-out /tmp/recovery.json
```

---

## 10. Observability Cutover Runbook

The stack split is now:

- `cdk-emcnotary-core` (shared infra and core parameters)
- `cdk-emcnotary-instance` (launch-time EC2/base infra only)
- `cdk-emcnotary-observability-maintenance` (all post-init observability/recovery/maintenance)

### Preflight

```bash
zsh -lc 'AWS_PROFILE=hepe-admin-mfa AWS_REGION=us-east-1 pnpm nx run cdk-emcnotary-core:admin:test:core-deployed'
zsh -lc 'AWS_PROFILE=hepe-admin-mfa AWS_REGION=us-east-1 pnpm nx run cdk-emcnotary-instance:admin:test:instance-deployed'
```

### Deploy Order

```bash
# 1) Deploy instance refactor (publishes /emcnotary/instance/* metadata)
zsh -lc 'FEATURE_CDK_EMCNOTARY_STACKS_ENABLED=1 DOMAIN=emcnotary.com pnpm nx run cdk-emcnotary-instance:deploy'

# 2) Deploy observability-maintenance stack
zsh -lc 'FEATURE_CDK_EMCNOTARY_STACKS_ENABLED=1 DOMAIN=emcnotary.com pnpm nx run cdk-emcnotary-observability-maintenance:deploy'
```

### Validate

```bash
zsh -lc 'AWS_PROFILE=hepe-admin-mfa AWS_REGION=us-east-1 APP_PATH=apps/cdk-emc-notary/observability-maintenance pnpm nx run admin-stack-info:get'
zsh -lc 'pnpm nx run cdk-emcnotary-observability-maintenance:admin:disk:monitor'
zsh -lc 'pnpm nx run cdk-emcnotary-observability-maintenance:admin:availability:report'
```

### Rollback

```bash
# If observability cutover fails
zsh -lc 'FEATURE_CDK_EMCNOTARY_STACKS_ENABLED=1 DOMAIN=emcnotary.com pnpm nx run cdk-emcnotary-observability-maintenance:destroy'

# Then redeploy previous instance commit that still includes in-stack observability
```

---

*Report generated by Claude Code on 2026-02-19 during live incident response and recovery.*
