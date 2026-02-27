# Runbook: SystemStatusCheck

## Trigger
- Alarm name contains `SystemStatusCheck-`.
- `AWS/EC2 StatusCheckFailed_System` is breaching.

## Non-Reboot Remediation
1. Confirm this is not a transient AWS infrastructure event.
2. Let orchestrator run non-reboot recovery first.

## Verification
- System status check is `OK`.
- Core services are healthy.

## Last Resort
- If AWS host issue persists and service remediation fails, run stop/start fallback.
