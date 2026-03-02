# Runbook: Fail2BanUnhealthy

## Trigger
- Alarm name contains `Fail2BanUnhealthy-`.
- Metric `MailServer/Health:Fail2BanHealthy` is below `1`.

## Immediate Checks
- Confirm alarm details in CloudWatch (state change reason + last datapoints).
- Run:
  - `pnpm nx run cdk-emcnotary-observability-maintenance:admin:availability:report`

## Diagnosis
1. Validate fail2ban service state and recent logs.
2. Validate fail2ban log dependencies:
   - `/var/log/fail2ban.log`
   - `/var/log/roundcubemail/errors.log`
3. Check jail status and ping:
   - `fail2ban-client ping`
   - `fail2ban-client status`

## Automated Non-Reboot Remediation
1. Recovery orchestrator triggers service restart path first.
2. Service restart ensures required log files exist, then restarts `fail2ban`.
3. If still unhealthy, orchestrator runs system reset (non-reboot), then re-validates.

## Manual Non-Reboot Remediation
1. Recreate missing logs and permissions:
   - `sudo mkdir -p /var/log/roundcubemail`
   - `sudo touch /var/log/roundcubemail/errors.log /var/log/fail2ban.log`
   - `sudo chown www-data:www-data /var/log/roundcubemail/errors.log`
   - `sudo chown root:adm /var/log/fail2ban.log`
2. Restart and verify:
   - `sudo systemctl restart fail2ban`
   - `systemctl is-active fail2ban`
   - `fail2ban-client ping`

## Verification
- `Fail2BanHealthy` returns to `1`.
- `Fail2BanUnhealthy-*` alarm transitions to `OK`.
- `/admin` remains responsive and mail services remain healthy.

## Last Resort
- EC2 stop/start is allowed only if all non-reboot remediation steps fail.
