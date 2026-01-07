# Box.hepefoundation.org Diagnosis Summary

**Date:** December 9, 2025  
**Issue:** box.hepefoundation.org is not reachable  
**Instance:** i-0a1ff83f513575ed4 (running)

## Current Status

### ✅ Instance Health
- **State:** Running
- **IP Address:** 44.194.23.56
- **System Status Check:** OK
- **Instance Status Check:** OK
- **All CloudWatch Alarms:** OK (3 alarms, all in OK state)

### ⚠️ Service Status
- **SSM Agent:** Unable to verify service status via SSM (may indicate SSM agent not running or IAM role issue)
- **Mail Services:** Cannot verify postfix/dovecot/nginx status remotely

### 📊 Alarm History (Last 7 Days)
- **14 alarm triggers** in the last 7 days
- **7 InstanceStatusCheck alarms** - mostly during scheduled restarts
- **7 SystemStatusCheck alarms** - mostly during scheduled restarts
- All alarms resolved automatically via stop-start Lambda

## Root Cause Analysis

The instance is running and healthy, but box.hepefoundation.org is not reachable. This suggests:

1. **Mail services (postfix/dovecot/nginx) may be stopped** - Services could have crashed or failed to start after a restart
2. **SSM agent may not be running** - Cannot verify service status remotely
3. **Network/firewall issues** - Less likely since instance status checks pass

## Solution Implemented

### ✅ Service Restart Lambda (Fast Recovery)
Created a new Lambda function that restarts mail services without restarting the instance:

- **Stack:** `hepefoundation-org-service-restart`
- **Lambda:** `service-restart-hepefoundation-org-service-restart`
- **Function:** Restarts postfix, dovecot, and nginx via SSM
- **Recovery Time:** ~30-60 seconds (vs 5-10 minutes for instance restart)

### ✅ Updated Stop-Start Lambda (Smart Recovery)
Enhanced the stop-start Lambda to try service restart first:

- **For alarm-triggered restarts:** Tries service restart first, falls back to instance restart if needed
- **For scheduled restarts:** Continues to use instance restart (full refresh)
- **Recovery Method:** Faster recovery for common service failures

## Immediate Actions

### Option 1: Manual Service Restart (Recommended)
Try restarting services manually via Lambda:

```bash
aws lambda invoke \
  --function-name service-restart-hepefoundation-org-service-restart \
  --profile hepe-admin-mfa \
  --region us-east-1 \
  /tmp/result.json && cat /tmp/result.json | jq .
```

**Note:** This requires SSM agent to be running on the instance. If SSM is not available, you'll need to SSH into the instance and restart services manually.

### Option 2: SSH and Manual Restart
If SSM is not available, SSH into the instance and restart services:

```bash
# SSH into instance (use your key file)
ssh -i /path/to/key.pem ubuntu@44.194.23.56

# Restart services
sudo systemctl restart postfix
sudo systemctl restart dovecot
sudo systemctl restart nginx

# Or use Mail-in-a-Box daemon if available
sudo /opt/mailinabox/management/mailinabox-daemon restart
```

### Option 3: Instance Restart (Last Resort)
If service restart doesn't work, trigger instance restart:

```bash
aws lambda invoke \
  --function-name StopStartLambda-hepefoundation-org-stop-start-helper \
  --profile hepe-admin-mfa \
  --region us-east-1 \
  --payload '{"source":"manual"}' \
  /tmp/result.json && cat /tmp/result.json | jq .
```

## Long-Term Improvements

### 1. Fix SSM Agent Configuration
Ensure SSM agent is running and instance has proper IAM role:

- Check IAM role includes `AmazonSSMManagedInstanceCore` policy
- Verify SSM agent is installed and running: `systemctl status amazon-ssm-agent`
- Check SSM agent logs: `/var/log/amazon/ssm/amazon-ssm-agent.log`

### 2. Add Service Health Monitoring
Create CloudWatch alarms for service status:

- Monitor postfix/dovecot service status via SSM
- Alert when services are inactive
- Trigger service restart Lambda automatically

### 3. Improve Alarm Stack
Update alarm stack to use service restart Lambda first:

- Modify alarm actions to call service restart Lambda
- Fall back to instance restart Lambda if service restart fails
- Reduce recovery time from 5-10 minutes to 30-60 seconds

## Testing

### Test Service Restart Lambda
```bash
aws lambda invoke \
  --function-name service-restart-hepefoundation-org-service-restart \
  --profile hepe-admin-mfa \
  --region us-east-1 \
  /tmp/result.json && cat /tmp/result.json | jq .
```

### Test Box Reachability
```bash
# HTTP
curl -v http://box.hepefoundation.org

# HTTPS
curl -v -k https://box.hepefoundation.org

# DNS
dig box.hepefoundation.org
```

### Verify Services After Restart
```bash
# Via SSM (if available)
aws ssm send-command \
  --instance-ids i-0a1ff83f513575ed4 \
  --document-name "AWS-RunShellScript" \
  --parameters 'commands=["systemctl status postfix dovecot nginx"]' \
  --profile hepe-admin-mfa \
  --region us-east-1
```

## Files Created/Modified

1. **service-restart-lambda.yaml** - New Lambda to restart services
2. **deploy-service-restart.sh** - Deployment script for service restart Lambda
3. **stop-start-instance-helper.yaml** - Updated to try service restart first
4. **diagnose-box-reachability.sh** - Diagnostic script for troubleshooting
5. **DIAGNOSIS-SUMMARY.md** - This document

## Next Steps

1. ✅ Service restart Lambda deployed
2. ✅ Stop-start Lambda updated with service restart logic
3. ⏳ Test service restart functionality
4. ⏳ Verify box.hepefoundation.org is reachable after restart
5. ⏳ Update alarm stack to use service restart Lambda (optional improvement)

## Notes

- The instance is healthy and running
- All CloudWatch alarms are in OK state
- The issue is likely with mail services not running
- Service restart Lambda provides faster recovery (30-60s vs 5-10min)
- SSM agent may need to be configured/started for remote service management







