# Alarm-to-Lambda Connection Fix

## Problem
The CloudWatch alarm `InstanceStatusCheck-i-0a1ff83f513575ed4` was in ALARM state but was not triggering the Lambda function `StopStartLambda-hepefoundation-org-stop-start-helper` to restart the instance.

## Root Cause
The Lambda function was missing the correct permission for CloudWatch alarms to invoke it. CloudWatch alarms use a different service principal (`lambda.alarms.cloudwatch.amazonaws.com`) than EventBridge rules (`events.amazonaws.com`).

## Solution
Added the correct Lambda permission for CloudWatch alarms to invoke the function:

```bash
aws lambda add-permission \
  --function-name StopStartLambda-hepefoundation-org-stop-start-helper \
  --statement-id allow-cloudwatch-alarms \
  --action lambda:InvokeFunction \
  --principal lambda.alarms.cloudwatch.amazonaws.com \
  --source-arn "arn:aws:cloudwatch:us-east-1:413988044972:alarm:InstanceStatusCheck-i-0a1ff83f513575ed4"
```

Similar permissions were added for:
- `SystemStatusCheck-i-0a1ff83f513575ed4`
- `OOMKillDetected-i-0a1ff83f513575ed4`

## Changes Made

### 1. Lambda Permissions (Applied)
- Added permission for Instance Status Check alarm
- Added permission for System Status Check alarm
- Added permission for OOM Kill alarm

### 2. CloudFormation Template (Updated)
Updated `Archive/hepefoundation/stop-start-instance-helper.yaml` to include the CloudWatch alarm permission:

```yaml
StopStartLambdaCloudWatchPermission:
  Type: AWS::Lambda::Permission
  Properties:
    FunctionName: !Ref StopStartLambdaFunction
    Action: lambda:InvokeFunction
    Principal: lambda.alarms.cloudwatch.amazonaws.com
    SourceArn: !Sub 'arn:aws:cloudwatch:${AWS::Region}:${AWS::AccountId}:alarm:*'
    StatementId: allow-cloudwatch-alarms
```

**Note:** The wildcard pattern allows all alarms in the account to invoke the Lambda. For production, consider using specific alarm ARNs.

## Verification

### Test Performed
1. Set alarm state to OK (to create a state transition)
2. Set alarm state to ALARM (triggered state transition)
3. Verified Lambda was invoked within seconds
4. Confirmed Lambda executed successfully:
   - Stopped the instance
   - Waited for stopped state
   - Started the instance
   - Waited for running state
   - Completed successfully

### Test Results
- ✅ Lambda invoked when alarm transitions to ALARM state
- ✅ Lambda successfully stopped and restarted the instance
- ✅ Instance is now running
- ✅ All permissions correctly configured

## Deployment

To make the CloudFormation template changes permanent:

```bash
cd Archive/hepefoundation
./deploy-stop-start-helper.sh
```

This will update the stack with the new CloudWatch alarm permission.

## Monitoring

### Check Alarm State
```bash
aws cloudwatch describe-alarms \
  --alarm-names "InstanceStatusCheck-i-0a1ff83f513575ed4" \
  --profile hepe-admin-mfa \
  --region us-east-1 \
  --query 'MetricAlarms[0].StateValue'
```

### Monitor Lambda Execution
```bash
aws logs tail /aws/lambda/StopStartLambda-hepefoundation-org-stop-start-helper \
  --follow \
  --profile hepe-admin-mfa \
  --region us-east-1
```

### Test Alarm Connection
```bash
./Archive/hepefoundation/test-alarm-lambda-connection.sh
```

## Important Notes

1. **State Transitions**: Alarm actions are only triggered on state transitions (OK → ALARM or ALARM → OK), not when manually setting the alarm to the same state.

2. **Permission Principal**: CloudWatch alarms use `lambda.alarms.cloudwatch.amazonaws.com`, not `events.amazonaws.com`.

3. **Source ARN**: The permission can use a wildcard pattern (`alarm:*`) or specific alarm ARNs for tighter security.

4. **Automatic Restart**: When the alarm enters ALARM state, the Lambda will automatically:
   - Stop the instance
   - Wait for it to stop
   - Start the instance
   - Wait for it to be running

## Date Fixed
November 16, 2025

## Status
✅ **RESOLVED** - Alarm-to-Lambda connection is working correctly.

