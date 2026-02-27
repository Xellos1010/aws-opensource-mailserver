# Mail Incident Report
Date: 2026-02-20
Severity: Critical
Service: Mail-in-a-Box IMAP (Roundcube + Apple Mail)
Domain: emcnotary.com
Instance: i-0518bce9a3056e4a6 (box.emcnotary.com)

## User-Reported Error
`Internal error occurred. Refer to server log for more information.` when moving messages to mailbox `Certified LSA Emcnotary`.

## Impact
- IMAP mailbox operations failed for affected users.
- Roundcube and Apple Mail showed internal mailbox operation errors.
- Dovecot could not autocreate/access folders for some users.

## Root Cause
Dovecot mail process user (`mail`) could not write to domain mailbox root due ownership drift:
- Path: `/home/user-data/mail/mailboxes/emcnotary.com`
- Bad state at incident time: `root:root 0755`
- Expected state: `mail:mail 0755`

Evidence from server log (`/var/log/mail.log`) around reported time (2026-02-20 19:14:37 UTC):
- `mkdir(.../mailboxes/emcnotary.com/<user>) failed: Permission denied`
- `Mailbox ...: Failed to autocreate mailbox: Internal error occurred`

## Immediate Remediation Performed
1. Repaired mailbox root ownership/permissions in place:
- `chown mail:mail /home/user-data/mail/mailboxes/emcnotary.com`
- `chmod 755 /home/user-data/mail/mailboxes/emcnotary.com`

2. Verified mailbox operations for affected users:
- `doveadm mailbox list -u certifiedlsa@emcnotary.com`
- `doveadm mailbox list -u scheduling@emcnotary.com`

3. Verified target folder behavior:
- Created mailbox `Certified LSA Emcnotary` successfully via `doveadm`.

4. Verified no fresh dovecot permission/internal errors after fix.

## Observability + Failsafe Hardening Implemented
Deployed to `emcnotary-com-mailserver-observability-maintenance`.

### Detection
1. **Health check enhancement**
- `MailHealthCheckLambda` now includes `mailbox_root_permissions` as a primary health signal.
- Checks `/home/user-data/mail/mailboxes/$DOMAIN_NAME` ownership+mode.
- Marks service unhealthy if drift is detected.

2. **Log-derived alarm for this exact failure class**
- New metric filter on syslog log group for phrase `Failed to autocreate mailbox`.
- New CloudWatch alarm:
  - `emcnotary-com-mailserver-observability-maintenance-MaildirPermissionDenied-i-0518bce9a3056e4a6`
- Alarm actions:
  - Recovery Orchestrator Lambda
  - SNS alarm topic

### Automated Restoration
1. **ServiceRestartLambda hardening**
- Before service restart, repairs mailbox root ownership drift to `mail:mail 755` for `$DOMAIN_NAME`.

2. **SystemResetLambda hardening**
- Early in reset flow, verifies and repairs mailbox root ownership drift.

Together, this gives two auto-remediation paths:
- Proactive scheduled health checks
- Immediate alarm-triggered recovery orchestration

## Deployment Status
- Observability stack deployment: `UPDATE_COMPLETE` (2026-02-20)
- Stack outputs verified via `admin-stack-info:get`.
- Mail health Lambda invocation verified:
  - `mailbox_root_permissions.status = ok`
  - `healthy = true`

## Current Service State
- `postfix`, `dovecot`, `nginx`: active
- IMAPS/SMTP submission health checks: passing
- Known remaining risk: disk usage elevated (~82%), monitor/clean up advised.

## Files Changed (Hardening)
- `libs/infra/mailserver-recovery/src/lib/mail-health-check-lambda.ts`
- `libs/infra/mailserver-recovery/src/lib/service-restart-lambda.ts`
- `libs/infra/mailserver-recovery/src/lib/system-reset-lambda.ts`
- `libs/infra/mailserver-recovery/src/lib/emergency-alarms.ts`

