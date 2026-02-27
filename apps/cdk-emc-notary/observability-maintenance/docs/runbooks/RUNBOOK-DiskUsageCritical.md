# Runbook: DiskUsageCritical

## Trigger
- Alarm name contains `DiskUsageCritical-`.
- Metric `MailServer/Health:DiskUsagePercent` is at or above threshold.

## Immediate Checks
- `pnpm nx run cdk-emcnotary-observability-maintenance:admin:disk:monitor`
- `pnpm nx run cdk-emcnotary-observability-maintenance:admin:availability:report`

## Non-Reboot Remediation
1. Run cleanup:
   - `pnpm nx run cdk-emcnotary-observability-maintenance:admin:cleanup:disk-space`
2. Run backup and cleanup if needed:
   - `pnpm nx run cdk-emcnotary-observability-maintenance:admin:backup-and-cleanup`
3. If pressure persists, expand EBS volume in place and grow filesystem online.

## Verification
- Root disk usage drops below alarm threshold.
- `/admin` and mail health checks pass.

## Last Resort
- Only after cleanup and volume expansion steps fail, proceed to EC2 stop/start through orchestrator fallback.
