# Mail server alarm runbooks

**Path:** `docs/runbooks/observability-maintenance/` — alarm procedures for `cdk-client-example-observability-maintenance`.

These runbooks follow a strict policy:

1. Use non-reboot remediation first.
2. Verify service health.
3. Use EC2 stop/start only if all non-reboot steps fail.

## Runbook Index

- `RUNBOOK-AdminEndpointUnhealthy.md`
- `RUNBOOK-DiskUsageCritical.md`
- `RUNBOOK-MailPrimaryUnhealthy.md`
- `RUNBOOK-Fail2BanUnhealthy.md`
- `RUNBOOK-InstanceStatusCheck.md`
- `RUNBOOK-SystemStatusCheck.md`
- `RUNBOOK-OOMKillDetected.md`
- `RUNBOOK-MaildirPermissionDenied.md`
- `RUNBOOK-MemHigh.md`
- `RUNBOOK-SwapHigh.md`
