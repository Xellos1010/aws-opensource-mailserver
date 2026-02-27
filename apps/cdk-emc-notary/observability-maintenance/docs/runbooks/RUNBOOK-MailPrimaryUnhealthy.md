# Runbook: MailPrimaryUnhealthy

## Trigger
- Alarm name contains `MailPrimaryUnhealthy-`.
- Metric `MailServer/Health:MailPrimaryHealthy` is below 1.

## Immediate Checks
- Check alarm reason details in CloudWatch.
- Run:
  - `pnpm nx run cdk-emcnotary-observability-maintenance:admin:availability:report`

## Non-Reboot Remediation
1. Trigger recovery orchestrator.
2. Confirm system reset path executed.
3. Confirm service restart path executed when reset did not fully recover.

## Verification
- Health check Lambda reports `healthy=true`.
- Alarm transitions to `OK`.

## Last Resort
- Allow stop/start only if orchestrator non-reboot steps fail.
