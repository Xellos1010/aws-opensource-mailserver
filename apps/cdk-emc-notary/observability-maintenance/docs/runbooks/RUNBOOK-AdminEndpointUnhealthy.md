# Runbook: AdminEndpointUnhealthy

## Trigger
- Alarm name contains `AdminEndpointUnhealthy-`.
- Metric `MailServer/Health:AdminEndpointHealthy` is below 1.

## Immediate Checks
- `curl -I --max-time 20 https://box.emcnotary.com/admin`
- `pnpm nx run cdk-emcnotary-observability-maintenance:admin:availability:report`

## Non-Reboot Remediation
1. Invoke recovery orchestrator Lambda (system reset/service restart first).
2. Run disk cleanup:
   - `pnpm nx run cdk-emcnotary-observability-maintenance:admin:cleanup:disk-space`
3. Re-check `/admin` endpoint and alarm state.

## Verification
- `/admin` returns non-timeout response.
- Alarm returns to `OK`.

## Last Resort
- If system reset + service restart + cleanup all fail, allow stop/start helper via orchestrator path only.
