# Emergency Alarms Verification Report

## Overview

This document confirms that the emergency alarms for `hepefoundation.org` mailserver are properly configured and will automatically trigger instance restarts when critical failures are detected.

## Stack Resources

All alarms are managed by the CloudFormation stack: `hepefoundation-org-emergency-alarms`

### Resources Created

1. **InstanceStatusCheckAlarm** → `InstanceStatusCheck-i-0a1ff83f513575ed4`
2. **SystemStatusCheckAlarm** → `SystemStatusCheck-i-0a1ff83f513575ed4`
3. **OOMKillAlarm** → `OOMKillDetected-i-0a1ff83f513575ed4`

## Alarm Configurations

### 1. Instance Status Check Alarm

**Purpose:** Detects instance-level failures (software/hardware issues on the instance)

**Configuration:**
- **Namespace:** `AWS/EC2`
- **Metric:** `StatusCheckFailed_Instance`
- **Statistic:** Maximum
- **Period:** 60 seconds
- **Threshold:** 1.0 (fails if status check fails)
- **Evaluation Periods:** 2 (alarm triggers after 2 consecutive failures = 2 minutes)
- **Comparison:** GreaterThanOrEqualToThreshold
- **Dimensions:** `InstanceId: i-0a1ff83f513575ed4`
- **Current State:** OK ✅

**What it monitors:**
- EC2 instance status checks (AWS-provided health checks)
- Triggers when the instance itself has issues (not AWS infrastructure)

### 2. System Status Check Alarm

**Purpose:** Detects AWS infrastructure-level failures

**Configuration:**
- **Namespace:** `AWS/EC2`
- **Metric:** `StatusCheckFailed_System`
- **Statistic:** Maximum
- **Period:** 60 seconds
- **Threshold:** 1.0 (fails if system status check fails)
- **Evaluation Periods:** 2 (alarm triggers after 2 consecutive failures = 2 minutes)
- **Comparison:** GreaterThanOrEqualToThreshold
- **Dimensions:** `InstanceId: i-0a1ff83f513575ed4`
- **Current State:** OK ✅

**What it monitors:**
- AWS system status checks (infrastructure health)
- Triggers when AWS infrastructure has issues affecting the instance

### 3. OOM Kill Alarm

**Purpose:** Detects when the Out-of-Memory killer terminates processes

**Configuration:**
- **Namespace:** `EC2` (custom metric from log filter)
- **Metric:** `oom_kills`
- **Statistic:** Sum
- **Period:** 60 seconds
- **Threshold:** 0.0 (alarm triggers on any OOM kill)
- **Evaluation Periods:** 1 (alarm triggers immediately)
- **Comparison:** GreaterThanThreshold
- **Dimensions:** None (log-based metric, not instance-specific)
- **Current State:** OK ✅

**What it monitors:**
- Log messages containing "Out of memory" in `/var/log/syslog`
- Triggers when the Linux OOM killer terminates processes due to memory exhaustion

**Note:** This alarm requires a log metric filter to be active. The metric will only appear after OOM kills occur in syslog.

## Lambda Integration

**Lambda Function:** `StopStartLambda-hepefoundation-org-stop-start-helper`

**Configuration:**
- **Runtime:** Node.js 20.x
- **Timeout:** 900 seconds (15 minutes)
- **Memory:** 256 MB
- **Environment Variables:**
  - `MAIL_SERVER_STACK_NAME`: `hepefoundation-org-mailserver`

**How it works:**
1. Lambda receives alarm trigger from CloudWatch
2. Lambda reads `MAIL_SERVER_STACK_NAME` environment variable
3. Lambda queries CloudFormation stack to get instance ID
4. Lambda performs `stop-instances` command
5. Lambda waits for instance to stop
6. Lambda performs `start-instances` command
7. Lambda waits for instance to start
8. Instance restarts and status checks should pass

**Permissions:**
- ✅ Lambda has CloudWatch/EventBridge permissions
- ✅ Lambda can invoke EC2 stop/start operations
- ✅ Lambda can read CloudFormation stack outputs

## Verification Results

### ✅ All Checks Passed

1. **Stack Resources:** All 3 alarms are tracked in CloudFormation
2. **Alarm Configuration:** All alarms are properly configured with correct thresholds
3. **Instance Targeting:** Status check alarms correctly target instance `i-0a1ff83f513575ed4`
4. **Lambda Integration:** All alarms are wired to trigger the stop-start Lambda
5. **Lambda Accessibility:** Lambda function exists and is accessible
6. **Current Status:** All alarms are in OK state
7. **Instance Health:** Instance status checks are passing

### Metric Data Verification

**Instance Status Check:**
- Recent metric values: All 0.0 (no failures)
- Status: Healthy ✅

**System Status Check:**
- Recent metric values: All 0.0 (no failures)
- Status: Healthy ✅

**OOM Kill:**
- No metric data (expected - no OOM kills occurred)
- Status: Healthy ✅

## How to Verify Alarms Are Working

### Run Verification Script

```bash
cd Archive/hepefoundation
./verify-emergency-alarms.sh
```

This script performs comprehensive checks:
- Verifies stack resources
- Checks alarm configurations
- Validates Lambda integration
- Shows recent metric data
- Confirms instance health

### Manual Verification

**Check alarm states:**
```bash
aws cloudwatch describe-alarms \
  --profile hepe-admin-mfa \
  --region us-east-1 \
  --alarm-names InstanceStatusCheck-i-0a1ff83f513575ed4 \
  --query 'MetricAlarms[0].StateValue'
```

**View Lambda logs:**
```bash
aws logs tail /aws/lambda/StopStartLambda-hepefoundation-org-stop-start-helper \
  --profile hepe-admin-mfa \
  --region us-east-1 \
  --follow
```

**Check instance status:**
```bash
aws ec2 describe-instance-status \
  --profile hepe-admin-mfa \
  --region us-east-1 \
  --instance-ids i-0a1ff83f513575ed4 \
  --include-all-instances
```

## What Happens When Alarms Trigger

### Automatic Restart Flow

1. **Failure Detected:**
   - Instance status check fails, OR
   - System status check fails, OR
   - OOM kill detected in logs

2. **Alarm State Change:**
   - Alarm transitions from `OK` → `ALARM`
   - CloudWatch automatically invokes Lambda

3. **Lambda Execution:**
   - Lambda reads stack name from environment: `hepefoundation-org-mailserver`
   - Lambda queries CloudFormation to get instance ID
   - Lambda stops the instance
   - Lambda waits for instance to stop (up to 10 minutes)
   - Lambda starts the instance
   - Lambda waits for instance to start (up to 10 minutes)

4. **Recovery:**
   - Instance restarts
   - Status checks should pass
   - Alarm returns to `OK` state

### Expected Timeline

- **Detection:** 2 minutes (2 evaluation periods × 60 seconds)
- **Lambda Invocation:** < 1 second
- **Stop Instance:** 1-3 minutes
- **Start Instance:** 1-3 minutes
- **Total Recovery Time:** ~5-8 minutes

## Scheduled Restart

In addition to emergency restarts, the instance is also restarted daily:

- **Schedule:** 3:00 AM EST (8:00 AM UTC)
- **Stack:** `hepefoundation-org-stop-start-helper`
- **Purpose:** Preventive maintenance to clear memory leaks and restart services

## Troubleshooting

### Alarm Not Triggering Lambda

1. Check Lambda permissions:
   ```bash
   aws lambda get-policy \
     --function-name StopStartLambda-hepefoundation-org-stop-start-helper
   ```

2. Verify alarm actions:
   ```bash
   aws cloudwatch describe-alarms \
     --alarm-names InstanceStatusCheck-i-0a1ff83f513575ed4 \
     --query 'MetricAlarms[0].AlarmActions'
   ```

### Lambda Failing

1. Check Lambda logs:
   ```bash
   aws logs tail /aws/lambda/StopStartLambda-hepefoundation-org-stop-start-helper --follow
   ```

2. Verify instance ID discovery:
   - Lambda should find instance ID from stack `hepefoundation-org-mailserver`
   - Check stack outputs for `RestorePrefix` or `InstanceId`

### OOM Alarm Not Working

1. Verify log metric filter exists:
   ```bash
   aws logs describe-metric-filters \
     --log-group-name /ec2/syslog-hepefoundation-org-mailserver \
     --filter-name-prefix OOM
   ```

2. Check if OOM kills are being logged:
   - OOM kills must appear in `/var/log/syslog` with "Out of memory" message
   - Metric filter must be active to create the `EC2/oom_kills` metric

## Maintenance

### Update Alarm Configuration

Edit `Archive/hepefoundation/emergency-alarms-stack.yaml` and redeploy:

```bash
cd Archive/hepefoundation
./deploy-emergency-alarms.sh
```

### Delete Alarms

To remove all alarms (managed by stack):

```bash
aws cloudformation delete-stack \
  --profile hepe-admin-mfa \
  --region us-east-1 \
  --stack-name hepefoundation-org-emergency-alarms
```

### Audit for Orphaned Alarms

Run the audit script to find alarms not managed by CloudFormation:

```bash
cd Archive/hepefoundation
./audit-and-cleanup-alarms.sh
```

## Summary

✅ **All alarms are properly configured and managed by CloudFormation**

✅ **All alarms are wired to trigger automatic instance restart**

✅ **Lambda function is accessible and properly configured**

✅ **Instance is healthy and all status checks are passing**

✅ **System is ready to automatically recover from critical failures**

---

**Last Verified:** 2025-11-14 03:38:52 EST  
**Verification Script:** `Archive/hepefoundation/verify-emergency-alarms.sh`














