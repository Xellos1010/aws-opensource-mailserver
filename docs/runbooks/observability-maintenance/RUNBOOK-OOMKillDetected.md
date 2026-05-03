# Runbook: OOMKillDetected

## Trigger
- Alarm name contains `OOMKillDetected-`.
- Metric filter detected OOM events in syslog.

## Non-Reboot Remediation
1. Trigger orchestrator; system reset should clear pressure and restart services.
2. Check memory and swap trends.
3. Review heavy processes and mail queue behavior.

## Verification
- No new OOM events.
- Services remain healthy.

## Last Resort
- Stop/start only if repeated OOM keeps services unhealthy after non-reboot recovery.
