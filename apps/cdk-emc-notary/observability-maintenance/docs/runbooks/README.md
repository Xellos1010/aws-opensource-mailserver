# EMC Notary Alarm Runbooks

These runbooks are for `cdk-emcnotary-observability-maintenance` alarms and follow a strict policy:

1. Use non-reboot remediation first.
2. Verify service health.
3. Use EC2 stop/start only if all non-reboot steps fail.

## Runbook Index

- `RUNBOOK-AdminEndpointUnhealthy.md`
- `RUNBOOK-DiskUsageCritical.md`
- `RUNBOOK-MailPrimaryUnhealthy.md`
- `RUNBOOK-InstanceStatusCheck.md`
- `RUNBOOK-SystemStatusCheck.md`
- `RUNBOOK-OOMKillDetected.md`
- `RUNBOOK-MaildirPermissionDenied.md`
- `RUNBOOK-MemHigh.md`
- `RUNBOOK-SwapHigh.md`
