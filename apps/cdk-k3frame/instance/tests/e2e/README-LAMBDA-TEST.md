# Manual Lambda Reboot Test Commands

This document provides AWS CLI commands to manually test the Lambda reboot function and diagnose issues.

## Prerequisites

```bash
export AWS_PROFILE=k3frame
export DOMAIN=k3-frame.com
export STACK_NAME="${DOMAIN//./-}-mailserver-instance"
```

## Step 1: Get Stack Information

```bash
# Get instance ID
INSTANCE_ID=$(aws cloudformation describe-stacks \
  --stack-name "$STACK_NAME" \
  --query 'Stacks[0].Outputs[?OutputKey==`InstanceId`].OutputValue' \
  --output text)

echo "Instance ID: $INSTANCE_ID"

# Get Lambda function name
LAMBDA_NAME=$(aws cloudformation describe-stack-resources \
  --stack-name "$STACK_NAME" \
  --query 'StackResources[?ResourceType==`AWS::Lambda::Function` && starts_with(LogicalResourceId, `NightlyRebootFunction`)].PhysicalResourceId' \
  --output text)

echo "Lambda Function: $LAMBDA_NAME"

# Verify Lambda function exists
aws lambda get-function --function-name "$LAMBDA_NAME" --query 'Configuration.[FunctionName,Runtime,Timeout,LastModified]' --output table
```

## Step 2: Check Lambda Configuration

```bash
# Check Lambda environment variables
aws lambda get-function-configuration \
  --function-name "$LAMBDA_NAME" \
  --query 'Environment.Variables' \
  --output json

# Verify INSTANCE_ID matches actual instance
LAMBDA_INSTANCE_ID=$(aws lambda get-function-configuration \
  --function-name "$LAMBDA_NAME" \
  --query 'Environment.Variables.INSTANCE_ID' \
  --output text)

echo "Lambda INSTANCE_ID: $LAMBDA_INSTANCE_ID"
echo "Actual Instance ID: $INSTANCE_ID"

if [ "$LAMBDA_INSTANCE_ID" != "$INSTANCE_ID" ]; then
  echo "⚠️  WARNING: Lambda INSTANCE_ID does not match actual instance ID!"
fi

# Check Lambda IAM role and permissions
LAMBDA_ROLE=$(aws lambda get-function-configuration \
  --function-name "$LAMBDA_NAME" \
  --query 'Role' \
  --output text)

echo "Lambda Role: $LAMBDA_ROLE"

# Check if role has ec2:RebootInstances permission
aws iam get-role-policy \
  --role-name $(echo $LAMBDA_ROLE | cut -d'/' -f2) \
  --policy-name $(aws iam list-role-policies --role-name $(echo $LAMBDA_ROLE | cut -d'/' -f2) --query 'PolicyNames[0]' --output text) \
  --query 'PolicyDocument' \
  --output json | jq '.Statement[] | select(.Action | contains("RebootInstances"))'
```

## Step 3: Invoke Lambda Function

```bash
# Check instance state before
echo "Instance state before Lambda invocation:"
aws ec2 describe-instance-status \
  --instance-ids "$INSTANCE_ID" \
  --query 'InstanceStatuses[0].InstanceState.Name' \
  --output text

# Invoke Lambda function
echo "Invoking Lambda function..."
INVOKE_TIME=$(date +%s)
aws lambda invoke \
  --function-name "$LAMBDA_NAME" \
  --payload '{}' \
  /tmp/lambda-response.json

# Check Lambda response
echo "Lambda invoke response:"
cat /tmp/lambda-response.json | jq .

# Check for errors in response
if cat /tmp/lambda-response.json | jq -e '.errorType' > /dev/null 2>&1; then
  echo "❌ Lambda function error detected:"
  cat /tmp/lambda-response.json | jq '.errorMessage, .trace'
fi
```

## Step 4: Check CloudWatch Logs

```bash
LOG_GROUP="/aws/lambda/$LAMBDA_NAME"
START_TIME=$((INVOKE_TIME - 60))000  # 1 minute before invoke

echo "Checking CloudWatch logs for Lambda invocation..."

# Get recent log events
aws logs filter-log-events \
  --log-group-name "$LOG_GROUP" \
  --start-time "$START_TIME" \
  --query 'events[*].{timestamp:timestamp,message:message}' \
  --output table

# Check for specific log messages
echo ""
echo "Checking for reboot-related logs:"
aws logs filter-log-events \
  --log-group-name "$LOG_GROUP" \
  --start-time "$START_TIME" \
  --filter-pattern "Rebooting" \
  --query 'events[*].message' \
  --output text

echo ""
echo "Checking for success logs:"
aws logs filter-log-events \
  --log-group-name "$LOG_GROUP" \
  --start-time "$START_TIME" \
  --filter-pattern "Successfully initiated reboot" \
  --query 'events[*].message' \
  --output text

echo ""
echo "Checking for error logs:"
aws logs filter-log-events \
  --log-group-name "$LOG_GROUP" \
  --start-time "$START_TIME" \
  --filter-pattern "ERROR" \
  --query 'events[*].message' \
  --output text
```

## Step 5: Monitor Instance State

```bash
echo "Monitoring instance state (checking every 5 seconds for 2 minutes)..."
for i in {1..24}; do
  STATE=$(aws ec2 describe-instance-status \
    --instance-ids "$INSTANCE_ID" \
    --query 'InstanceStatuses[0].InstanceState.Name' \
    --output text 2>/dev/null || echo "unknown")
  
  ELAPSED=$((i * 5))
  echo "[${ELAPSED}s] Instance state: $STATE"
  
  if [ "$STATE" = "rebooting" ] || [ "$STATE" = "stopping" ]; then
    echo "✓ Instance is rebooting!"
    break
  fi
  
  if [ "$STATE" = "running" ] && [ $i -gt 10 ]; then
    echo "⚠️  Instance is still running after ${ELAPSED} seconds - reboot may not have occurred"
  fi
  
  sleep 5
done
```

## Step 6: Verify EC2 Reboot Command

```bash
# Check EC2 instance events (may show reboot events)
echo "Recent EC2 instance events:"
aws ec2 describe-instance-status \
  --instance-ids "$INSTANCE_ID" \
  --query 'InstanceStatuses[0].Events[*].{time:NotBefore,code:Code,description:Description}' \
  --output table

# Check if instance was rebooted recently (system log)
echo ""
echo "Checking system log for reboot events (last 10 minutes):"
aws ec2 get-console-output \
  --instance-id "$INSTANCE_ID" \
  --latest \
  --query 'Output' \
  --output text | tail -20 | grep -i "reboot\|shutdown\|restart" || echo "No reboot events found in console output"
```

## Troubleshooting

### Lambda returns success but instance doesn't reboot

1. **Check Lambda logs** - Look for errors in CloudWatch logs
2. **Verify INSTANCE_ID** - Ensure Lambda environment variable matches actual instance
3. **Check IAM permissions** - Verify Lambda role has `ec2:RebootInstances` permission
4. **Check instance state** - Instance must be in "running" state to reboot
5. **Check EC2 API directly** - Try rebooting instance manually to verify it's possible

### Lambda invocation fails

1. **Check Lambda function code** - Verify code is deployed correctly
2. **Check runtime** - Ensure Node.js version matches Lambda runtime
3. **Check dependencies** - Verify @aws-sdk/client-ec2 is available
4. **Check timeout** - Lambda may be timing out

### No CloudWatch logs appear

1. **Wait a few seconds** - Logs can take 5-10 seconds to appear
2. **Check log group exists** - Verify `/aws/lambda/{function-name}` exists
3. **Check IAM permissions** - Lambda execution role needs CloudWatch Logs permissions
4. **Check region** - Ensure you're checking logs in the correct region

## Quick Test Script

Save this as `test-lambda-reboot.sh`:

```bash
#!/bin/bash
set -euo pipefail

export AWS_PROFILE=${AWS_PROFILE:-k3frame}
export DOMAIN=${DOMAIN:-k3-frame.com}
export STACK_NAME="${DOMAIN//./-}-mailserver-instance"

# Get resources
INSTANCE_ID=$(aws cloudformation describe-stacks --stack-name "$STACK_NAME" --query 'Stacks[0].Outputs[?OutputKey==`InstanceId`].OutputValue' --output text)
LAMBDA_NAME=$(aws cloudformation describe-stack-resources --stack-name "$STACK_NAME" --query 'StackResources[?ResourceType==`AWS::Lambda::Function` && starts_with(LogicalResourceId, `NightlyRebootFunction`)].PhysicalResourceId' --output text)

echo "=== Testing Lambda Reboot Function ==="
echo "Instance: $INSTANCE_ID"
echo "Lambda: $LAMBDA_NAME"
echo ""

# Invoke Lambda
echo "Invoking Lambda..."
INVOKE_TIME=$(date +%s)
aws lambda invoke --function-name "$LAMBDA_NAME" --payload '{}' /tmp/lambda-response.json
cat /tmp/lambda-response.json | jq .

# Check logs
echo ""
echo "Checking CloudWatch logs..."
sleep 5
aws logs filter-log-events \
  --log-group-name "/aws/lambda/$LAMBDA_NAME" \
  --start-time $((INVOKE_TIME - 60))000 \
  --query 'events[*].message' \
  --output text | grep -E "Rebooting|Successfully|ERROR|Error" || echo "No relevant logs found"

# Monitor state
echo ""
echo "Monitoring instance state..."
for i in {1..12}; do
  STATE=$(aws ec2 describe-instance-status --instance-ids "$INSTANCE_ID" --query 'InstanceStatuses[0].InstanceState.Name' --output text 2>/dev/null || echo "unknown")
  echo "[$((i*5))s] State: $STATE"
  [ "$STATE" = "rebooting" ] && break
  sleep 5
done
```

Make it executable: `chmod +x test-lambda-reboot.sh`



















