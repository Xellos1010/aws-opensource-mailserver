# Runbook: SwapHigh

## Trigger
- Alarm name contains `SwapHigh-`.
- `CWAgent swap_used_percent` over threshold.

## Non-Reboot Remediation
1. Trigger orchestrator non-reboot flow.
2. Investigate sustained memory pressure and long-lived processes.
3. Confirm disk cleanup and service health.

## Verification
- Swap usage falls below threshold.
- Alarm returns to `OK`.

## Last Resort
- Use stop/start only when non-reboot remediation cannot stabilize memory/swap.
