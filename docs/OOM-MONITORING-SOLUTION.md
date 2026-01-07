# OOM Monitoring and Alerting Solution

## Problem

The HEPE mailserver instance was experiencing Out-of-Memory (OOM) conditions where the OOM killer was terminating processes (specifically `spampd`). The instance status check was failing, but there was no automated way to:

1. **Detect OOM conditions externally** - No way to check if OOM kills occurred without manually accessing the instance
2. **Get alerted when issues arise** - No CloudWatch alarms configured to notify when problems occur
3. **Monitor instance health proactively** - No automated monitoring of instance status checks, memory usage, or swap usage

## Solution

### 1. CloudWatch Alarms Added to Instance Stack

Added comprehensive CloudWatch alarms to `apps/cdk-emc-notary/instance/src/stacks/instance-stack.ts`:

- **Instance Status Check Alarm** - Alerts when EC2 instance status check fails (instance-level issues)
- **System Status Check Alarm** - Alerts when EC2 system status check fails (AWS infrastructure issues)
- **OOM Kill Alarm** - Alerts immediately when OOM killer terminates processes (detected via log metric filter)
- **Memory High Alarm** - Alerts when memory usage exceeds 85% for 5 consecutive minutes
- **Swap High Alarm** - Alerts when swap usage exceeds 50% for 5 consecutive minutes

All alarms send notifications to the SNS topic configured in the core stack.

### 2. OOM Detection via Log Metric Filter

Added a CloudWatch Logs metric filter to `apps/cdk-emc-notary/core/src/stacks/core-stack.ts`:

- Monitors `/ec2/syslog-{stackName}` log group for "Out of memory" messages
- Creates a CloudWatch metric `EC2::oom_kills` that increments when OOM kills occur
- The OOM Kill Alarm monitors this metric and triggers immediately when any OOM kill is detected

### 3. External Monitoring Script

Created `Archive/administration/check-instance-health.sh` script that provides:

- **Instance Status Checks** - Checks EC2 instance state, system status, and instance status
- **CloudWatch Alarm Status** - Shows state of all configured alarms
- **Memory Metrics** - Displays recent memory and swap usage from CloudWatch
- **OOM Kill Detection** - Checks for OOM kills in the last 24 hours
- **Health Summary** - Provides overall health assessment with actionable recommendations

## Usage

### Deploy the Alarms

After deploying the updated CDK stacks, the alarms will be automatically created:

```bash
# Deploy core stack (includes OOM metric filter)
cd apps/cdk-emc-notary/core
pnpm nx deploy

# Deploy instance stack (includes all alarms)
cd apps/cdk-emc-notary/instance
pnpm nx deploy
```

### Check Instance Health Externally

For HEPE foundation:

```bash
./Archive/hepefoundation/check-instance-health.sh
```

Or for any domain:

```bash
./Archive/administration/check-instance-health.sh hepefoundation.org [profile] [region]
```

### Subscribe to SNS Notifications

To receive email notifications when alarms trigger:

1. Go to AWS SNS Console
2. Find the topic: `ec2-memory-events-{stackName}`
3. Create a subscription with your email address
4. Confirm the subscription via email

## Alarm Details

### Instance Status Check Alarm
- **Name**: `InstanceStatusCheck-{instanceId}`
- **Metric**: `AWS/EC2::StatusCheckFailed_Instance`
- **Threshold**: 1 (any failure)
- **Evaluation**: 2 consecutive periods (2 minutes)
- **Action**: Immediate SNS notification

### System Status Check Alarm
- **Name**: `SystemStatusCheck-{instanceId}`
- **Metric**: `AWS/EC2::StatusCheckFailed_System`
- **Threshold**: 1 (any failure)
- **Evaluation**: 2 consecutive periods (2 minutes)
- **Action**: Immediate SNS notification

### OOM Kill Alarm
- **Name**: `OOMKillDetected-{instanceId}`
- **Metric**: `EC2::oom_kills` (from log metric filter)
- **Threshold**: > 0 (any OOM kill)
- **Evaluation**: 1 period (1 minute)
- **Action**: Immediate SNS notification

### Memory High Alarm
- **Name**: `MemHigh-{instanceId}`
- **Metric**: `CWAgent::mem_used_percent`
- **Threshold**: > 85%
- **Evaluation**: 5 consecutive periods (5 minutes)
- **Action**: SNS notification after sustained high usage

### Swap High Alarm
- **Name**: `SwapHigh-{instanceId}`
- **Metric**: `CWAgent::swap_used_percent`
- **Threshold**: > 50%
- **Evaluation**: 5 consecutive periods (5 minutes)
- **Action**: SNS notification after sustained high swap usage

## Troubleshooting

### Alarms Not Triggering

1. **Check CloudWatch Agent**: Ensure the CloudWatch agent is installed and configured
   ```bash
   sudo systemctl status amazon-cloudwatch-agent
   ```

2. **Verify SSM Parameter**: Check that the CloudWatch agent config is in SSM
   ```bash
   aws ssm get-parameter --name /cwagent-linux-{stackName}
   ```

3. **Check Log Group**: Verify syslog is being sent to CloudWatch
   ```bash
   aws logs describe-log-streams --log-group-name /ec2/syslog-{stackName}
   ```

### OOM Kills Not Detected

1. **Check Metric Filter**: Verify the metric filter exists
   ```bash
   aws logs describe-metric-filters --log-group-name /ec2/syslog-{stackName}
   ```

2. **Check Log Format**: Ensure syslog contains "Out of memory" text (case-sensitive)

3. **Verify Log Delivery**: Check that CloudWatch agent is sending logs
   ```bash
   aws logs tail /ec2/syslog-{stackName} --follow
   ```

### Instance Status Check Failing

Common causes:
- **OOM conditions** - System out of memory (check OOM alarm)
- **Network issues** - Instance cannot reach AWS APIs
- **Kernel panics** - System crashes
- **Disk full** - No space for system operations

**Immediate actions**:
1. Check CloudWatch logs for errors
2. Review system logs via EC2 console
3. Consider restarting the instance if issues persist
4. Check instance metrics (CPU, memory, disk)

## Next Steps

1. **Deploy the updated stacks** to create alarms
2. **Subscribe to SNS topic** to receive email notifications
3. **Run health check script** regularly or set up cron job
4. **Monitor alarm history** in CloudWatch console
5. **Consider increasing instance size** if OOM conditions persist

## Related Files

- `apps/cdk-emc-notary/core/src/stacks/core-stack.ts` - OOM metric filter
- `apps/cdk-emc-notary/instance/src/stacks/instance-stack.ts` - CloudWatch alarms
- `Archive/administration/check-instance-health.sh` - Health monitoring script
- `Archive/hepefoundation/check-instance-health.sh` - HEPE-specific wrapper














