# Runbook: MailPrimaryUnhealthy

## Trigger
- Alarm name contains `MailPrimaryUnhealthy-`.
- Metric `MailServer/Health:MailPrimaryHealthy` is below 1.
- Scope: postfix/dovecot/mailinabox/admin checks (disk pressure is handled by `DiskUsageCritical` separately).

## Immediate Checks
- Check alarm reason details in CloudWatch.
- Run:
  - `pnpm nx run cdk-emcnotary-observability-maintenance:admin:availability:report`

## Non-Reboot Remediation
1. Trigger recovery orchestrator (service restart path first, then system reset if needed).
2. Confirm `mailinabox`, `postfix`, and `dovecot` are active.
3. Confirm admin endpoint responds locally:
   - `curl -sk --max-time 20 -o /dev/null -w "%{http_code}\n" https://127.0.0.1/admin`
4. If disk is the only failing signal, use `RUNBOOK-DiskUsageCritical.md` instead of forcing instance restart.

## Verification
- Health check Lambda reports `healthy=true`.
- Alarm transitions to `OK`.

## Last Resort
- Allow stop/start only if orchestrator non-reboot steps fail.
