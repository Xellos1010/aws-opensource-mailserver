# Runbook: MemHigh

## Trigger
- Alarm name contains `MemHigh-`.
- `CWAgent mem_used_percent` over threshold.

## Non-Reboot Remediation
1. Invoke orchestrator to run system reset and service stabilization.
2. Check for runaway processes and queue spikes.
3. Confirm swap and disk are not compounding pressure.

## Verification
- Memory usage drops below threshold.
- Alarm returns to `OK`.

## Last Resort
- If memory pressure remains and services degrade, allow stop/start fallback.
