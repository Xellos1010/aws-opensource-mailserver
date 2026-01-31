# CloudWatch Agent Manual Configuration - Complete

## Summary

✅ **All configuration tests passed!** The CloudWatch Agent has been manually configured for the HEPE Foundation mailserver without modifying the legacy stack.

## What Was Configured

### 1. SSM Parameter
- **Parameter**: `/cwagent-linux-hepefoundation-org-mailserver`
- **Purpose**: Stores CloudWatch Agent configuration
- **Status**: ✅ Created and verified

### 2. SSM Association
- **Association ID**: `80b20d48-4eb7-4eb3-aee3-33852186b8af`
- **Document**: `AmazonCloudWatch-ManageAgent`
- **Target**: Instance `i-0a1ff83f513575ed4`
- **Status**: ✅ Created and verified

### 3. CloudWatch Log Group
- **Log Group**: `/ec2/syslog-hepefoundation-org-mailserver`
- **Retention**: 7 days
- **Status**: ✅ Exists (created by emergency alarms stack)

### 4. OOM Metric Filter
- **Filter**: `OOMMetricFilter-P5URREyubApa`
- **Pattern**: "Out of memory"
- **Metric**: `EC2/oom_kills`
- **Status**: ✅ Configured

### 5. OOM Alarm
- **Alarm**: `OOMKillDetected-i-0a1ff83f513575ed4`
- **State**: OK
- **Action**: Triggers stop-start Lambda for automatic restart
- **Status**: ✅ Configured

## Configuration Details

The CloudWatch Agent is configured to:
- **Forward syslog** from `/var/log/syslog` to CloudWatch Logs
- **Collect memory metrics** (mem_used_percent, mem_available)
- **Collect swap metrics** (swap_used_percent)
- **Create log streams** named with instance ID

## Next Steps (Manual on Instance)

Since SSM access is not available, you need to manually verify/install CloudWatch Agent on the instance:

### 1. SSH into the Instance
```bash
ssh admin@box.k3frame.com
```

### 2. Check if CloudWatch Agent is Installed
```bash
which amazon-cloudwatch-agent
# OR
dpkg -l | grep amazon-cloudwatch-agent
# OR (for Amazon Linux)
rpm -qa | grep amazon-cloudwatch-agent
```

### 3. Install CloudWatch Agent (if not installed)

**For Ubuntu/Debian:**
```bash
wget https://s3.amazonaws.com/amazoncloudwatch-agent/ubuntu/amd64/latest/amazon-cloudwatch-agent.deb
sudo dpkg -i -E ./amazon-cloudwatch-agent.deb
```

**For Amazon Linux:**
```bash
wget https://s3.amazonaws.com/amazoncloudwatch-agent/amazon_linux/amd64/latest/amazon-cloudwatch-agent.rpm
sudo rpm -U ./amazon-cloudwatch-agent.rpm
```

### 4. Verify Agent Configuration
The SSM Association should automatically configure the agent, but you can verify:
```bash
sudo /opt/aws/amazon-cloudwatch-agent/bin/amazon-cloudwatch-agent-ctl \
  -a fetch-config \
  -m ec2 \
  -s \
  -c ssm:/cwagent-linux-hepefoundation-org-mailserver
```

### 5. Check Agent Status
```bash
sudo systemctl status amazon-cloudwatch-agent
sudo journalctl -u amazon-cloudwatch-agent -n 50 --no-pager
```

### 6. Start Agent (if not running)
```bash
sudo systemctl start amazon-cloudwatch-agent
sudo systemctl enable amazon-cloudwatch-agent
```

### 7. Verify Logs Are Being Forwarded

**On the instance:**
```bash
# Check agent logs for errors
sudo journalctl -u amazon-cloudwatch-agent -f

# Verify syslog is being read
sudo tail -f /var/log/syslog
```

**From your local machine:**
```bash
aws logs tail /ec2/syslog-hepefoundation-org-mailserver \
  --follow \
  --profile hepe-admin-mfa \
  --region us-east-1
```

## Testing the Configuration

### Run Test Script
```bash
cd Archive/hepefoundation
./test-cloudwatch-agent-config.sh
```

### Run Diagnostic Script
```bash
cd Archive/hepefoundation
./diagnose-oom-alarm.sh
```

### Manually Trigger SSM Association (if needed)
```bash
cd Archive/hepefoundation
./manual-trigger-association.sh
```

## Verification Checklist

- [x] SSM Parameter created
- [x] SSM Association created
- [x] Log Group exists
- [x] OOM Metric Filter configured
- [x] OOM Alarm configured
- [ ] CloudWatch Agent installed on instance
- [ ] CloudWatch Agent running on instance
- [ ] Logs appearing in CloudWatch Logs
- [ ] OOM detection working (test with simulated OOM if needed)

## Troubleshooting

### If logs don't appear in CloudWatch:

1. **Check agent is running:**
   ```bash
   sudo systemctl status amazon-cloudwatch-agent
   ```

2. **Check agent logs:**
   ```bash
   sudo journalctl -u amazon-cloudwatch-agent -n 100
   ```

3. **Verify SSM parameter is accessible:**
   ```bash
   sudo /opt/aws/amazon-cloudwatch-agent/bin/amazon-cloudwatch-agent-ctl \
     -a fetch-config \
     -m ec2 \
     -c ssm:/cwagent-linux-hepefoundation-org-mailserver \
     -s
   ```

4. **Check IAM permissions:**
   - Instance needs `CloudWatchAgentServerPolicy` or equivalent
   - Instance needs `logs:CreateLogStream` and `logs:PutLogEvents` permissions

5. **Verify log group exists:**
   ```bash
   aws logs describe-log-groups \
     --profile hepe-admin-mfa \
     --region us-east-1 \
     --log-group-name-prefix "/ec2/syslog-hepefoundation"
   ```

## Files Created

- `configure-cloudwatch-agent.sh` - Main configuration script
- `test-cloudwatch-agent-config.sh` - Test script to verify configuration
- `manual-trigger-association.sh` - Script to manually trigger SSM association
- `diagnose-oom-alarm.sh` - Diagnostic script (updated to use profile)

## Related Stacks

- **Emergency Alarms Stack**: `hepefoundation-org-emergency-alarms`
  - Creates log group and OOM metric filter
  - Creates OOM alarm
  
- **Stop-Start Helper Stack**: `hepefoundation-org-stop-start-helper`
  - Provides Lambda function for automatic restart

## Notes

- This configuration does NOT modify the legacy `hepefoundation-org-mailserver` stack
- All resources are managed independently
- The SSM Association will automatically configure the agent when it runs
- Logs will start appearing once the agent is installed and running on the instance




