# Runbook: AdminEndpointUnhealthy

## Trigger
- Alarm name contains `AdminEndpointUnhealthy-`.
- Metric `MailServer/Health:AdminEndpointHealthy` is below 1.

## Immediate Checks
- `curl -I --max-time 20 https://box.emcnotary.com/admin`
- `pnpm nx run cdk-emcnotary-observability-maintenance:admin:availability:report`
- Confirm Mail-in-a-Box backend service:
  - `sudo systemctl is-active mailinabox`
  - `curl -sS --max-time 20 -o /dev/null -w "%{http_code}\n" http://127.0.0.1:10222/`

## Non-Reboot Remediation
1. Invoke recovery orchestrator Lambda (targets service restart before broader reset for this alarm).
2. If `/admin` still times out, harden Mail-in-a-Box start script and restart service:
   - `sudo sed -i '/source \/usr\/local\/lib\/mailinabox\/env\/bin\/activate/a cd \/opt\/mailinabox\/management' /usr/local/lib/mailinabox/start`
   - `sudo sed -i 's/-b localhost:10222/-b 127.0.0.1:10222/g' /usr/local/lib/mailinabox/start`
   - `sudo systemctl restart mailinabox`
3. Run disk cleanup when root disk is high:
   - `pnpm nx run cdk-emcnotary-observability-maintenance:admin:cleanup:disk-space`
4. Re-check `/admin` endpoint and alarm state.

## Verification
- `/admin` returns non-timeout response.
- Alarm returns to `OK`.

## Last Resort
- If system reset + service restart + cleanup all fail, allow stop/start helper via orchestrator path only.
