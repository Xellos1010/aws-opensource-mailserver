# EMC Notary Mailserver Incident Report

Date: 2026-02-27 (UTC)
Domain: emcnotary.com
Hostname: box.emcnotary.com
Instance: i-0518bce9a3056e4a6
Region: us-east-1

## Executive Summary

`box.emcnotary.com` is currently reachable for webmail and core mail services, but the system is degraded:

- Admin panel (`/admin`) is timing out (HTTP 504 / request timeout).
- Root disk is critically full at ~95% (about 395-396 MB free on a 7.6 GB root volume).
- Observability-maintenance stack is deployed and active, but it is not monitoring this failure mode (admin endpoint + disk exhaustion) for auto-remediation.
- There is also a scheduled daily stop/start maintenance window around 03:00 ET that intentionally causes short reachability loss.

## What Was Verified

### 1. External Reachability

- DNS resolves `box.emcnotary.com` to `3.229.143.6`.
- HTTPS root endpoint returns 200.
- HTTP redirects to HTTPS.
- Mail ports mostly reachable from this network path (22 intermittently refused during one check, then recovered).
- POP3S (995) timed out from this vantage point during one probe.

### 2. Instance and Stack State

CloudFormation:
- `emcnotary-com-mailserver-instance`: `UPDATE_COMPLETE`
- `emcnotary-com-mailserver-observability-maintenance`: `UPDATE_COMPLETE`

EC2:
- Instance running with EIP `3.229.143.6` associated.
- Security group allows expected inbound ports (22/25/53/80/143/443/465/587/993/4190).

### 3. Availability Report (Nx Tooling)

Generated report:
- `monitoring-reports/availability-report-emcnotary-20260227-143650.json`

Summary from report:
- Overall: `degraded`
- Services: 6/6 running
- Health checks: 6/7 passing
- Failing check: `Admin Panel: Request timeout`
- Disk: `critical` (95%)

### 4. Observability-Maintenance Audit

The stack is online and wired:
- EventBridge rules enabled for:
  - Mail health check (rate 5 minutes)
  - System stats (rate 1 hour)
  - Nightly reboot (cron 08:00 UTC / 03:00 ET)
  - Stop/start helper (cron 08:00 UTC / 03:00 ET)
- EC2 instance/system status alarms are attached to recovery orchestrator Lambda + SNS.
- Recovery Lambdas are active.

But there are important gaps:
- External monitoring is disabled (stack output `ExternalMonitoringEnabled=false`).
- Health checks are focused on postfix/dovecot/mailbox perms, not admin endpoint responsiveness.
- No disk usage alarm/remediation path is in the active alarm set.

### 5. Failure Evidence and Timeline

#### A. Scheduled Daily Reachability Loss (Expected/Configured)

CloudTrail + Lambda logs show scheduled actions at ~03:00 ET:
- Nightly reboot Lambda invoked around `08:00:23Z`.
- Stop/start helper then stopped and started the instance (`08:00:28Z` to `08:05:13Z`).
- EC2 status alarms flipped ALARM then recovered around `08:09Z` to `08:13Z`.

This means there is a deliberate daily downtime window due to maintenance automation.

#### B. Current Critical Degradation (Admin Plane)

- `https://box.emcnotary.com/admin` times out externally and internally.
- Local backend `http://127.0.0.1:10222/admin` times out after 60s with no response.
- Nginx error log contains repeated:
  - `upstream timed out while reading response header from upstream`
  - upstream target `http://127.0.0.1:10222/...`
- Timed-out `/admin/dns/custom/...` operations were observed from localhost (`::1`, user-agent `curl/7.81.0`) around 19:31-19:35 UTC, blocking the single gunicorn worker.
- The admin backend socket also shows accumulated `CLOSE-WAIT` connections on `127.0.0.1:10222` (21 observed), consistent with a wedged management worker.

## Root Cause Assessment

Primary cause of the current critical failure:
1. Mail-in-a-Box admin backend is not responding in time (upstream timeout to localhost:10222), likely due to long-running/stuck admin API operations.
2. Critically low disk headroom (95%) increases risk and contributes to unstable behavior.

Secondary cause of user-visible "not reachable" events:
3. Intentional daily stop/start automation at 03:00 ET creates a predictable outage window.

## Resolution Steps

### Immediate (P0)

1. Recover headroom now:
- Run non-dry cleanup:
  - `AWS_PROFILE=hepe-admin-mfa AWS_REGION=us-east-1 DOMAIN=emcnotary.com pnpm nx run cdk-emcnotary-observability-maintenance:admin:cleanup:disk-space`
- Verify disk is below 85%:
  - `AWS_PROFILE=hepe-admin-mfa AWS_REGION=us-east-1 DOMAIN=emcnotary.com pnpm nx run cdk-emcnotary-observability-maintenance:admin:disk:monitor`

2. Unstick admin control plane:
- Restart MIAB management service on instance:
  - `sudo systemctl restart mailinabox`
- Re-test:
  - `curl -I --max-time 15 https://box.emcnotary.com/admin`

3. Re-validate full availability:
- `AWS_PROFILE=hepe-admin-mfa AWS_REGION=us-east-1 DOMAIN=emcnotary.com OUTPUT_FILE=./monitoring-reports/availability-report-emcnotary-postfix.json pnpm nx run cdk-emcnotary-instance:admin:availability:report`

### Near Term (P1)

4. Eliminate planned 03:00 ET downtime overlap:
- Keep either nightly reboot or stop/start helper schedule, not both at the same time.
- If both are retained, stagger windows and suppress status alarms during that exact window.

5. Increase root volume capacity:
- 8 GB root volume is too small for sustained operations.
- Increase to at least 16 GB (preferably 20+ GB), then grow filesystem.

6. Identify source of localhost admin DNS mutation calls:
- Investigate what is issuing repeated `curl` deletes to `/admin/dns/custom/...` from `::1`.
- Stop/rework that process to avoid serially blocking the single admin worker.

### Observability Hardening (P2)

7. Add detection for this exact failure class:
- Add alarm for admin endpoint (`/admin`) latency/timeout.
- Add alarm for disk usage (e.g., >85% warning, >90% critical).
- Add auto-remediation path for disk pressure (safe cleanup + alert + escalation).

8. Re-enable external monitoring after prerequisites:
- Current code explicitly sets `externalMonitoring = undefined` in construct.

## Code-Level Audit Notes

Relevant implementation references:
- `libs/infra/mailserver-recovery/src/lib/mailserver-observability-maintenance.ts`
  - Daily stop/start helper schedule at `cron(0 8 * * ? *)`
  - External monitoring disabled (`externalMonitoring = undefined`)
- `libs/infra/mailserver-recovery/src/lib/emergency-alarms.ts`
  - Recovery alarms are wired for EC2 status, OOM, mailbox permission events
- `libs/infra/mailserver-recovery/src/lib/mail-health-check-lambda.ts`
  - Health checks focus on postfix/dovecot/mailbox perms, not admin endpoint health
- `apps/cdk-emc-notary/observability-maintenance/src/stacks/observability-maintenance-stack.ts`
  - Output includes `ExternalMonitoringEnabled`

## Conclusion

The observability-maintenance stack is deployed and active, but it is not currently covering the failure mode that caused the critical degradation (`/admin` timeout + disk pressure). It did auto-handle EC2 status transitions, but daily scheduled maintenance is also creating intentional reachability gaps around 03:00 ET.
