# Runbook: MaildirPermissionDenied

## Trigger
- Alarm name contains `MaildirPermissionDenied-`.
- Dovecot mailbox autocreation permission errors detected.

## Non-Reboot Remediation
1. Trigger orchestrator.
2. Ensure mailbox root ownership/perms are corrected by recovery scripts.
3. Re-run health check Lambda.

## Verification
- Mailbox permission metric returns to zero.
- Mail services healthy and alarm `OK`.

## Last Resort
- Use stop/start only if permission repair and service restart fail.
