# Runbook: InstanceStatusCheck

## Trigger
- Alarm name contains `InstanceStatusCheck-`.
- `AWS/EC2 StatusCheckFailed_Instance` is breaching.

## Non-Reboot Remediation
1. Allow recovery orchestrator to execute health check and system reset/service restart first.
2. Verify SSM responsiveness and service recovery.

## Verification
- EC2 instance status check returns to `OK`.
- Mail health checks pass.

## Last Resort
- If status remains failed and orchestrator cannot recover, execute stop/start fallback.
