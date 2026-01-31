#!/bin/bash
set -euo pipefail

export AWS_PROFILE=${AWS_PROFILE:-hepe-admin-mfa}
export DOMAIN=${DOMAIN:-k3frame.com}
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
LOG_GROUP="/aws/lambda/$LAMBDA_NAME"
START_TIME=$((INVOKE_TIME - 60))000

echo "Recent Lambda logs:"
aws logs filter-log-events \
  --log-group-name "$LOG_GROUP" \
  --start-time "$START_TIME" \
  --query 'events[*].message' \
  --output text | grep -E "Rebooting|Successfully|ERROR|Error|INFO" || echo "No relevant logs found"

# Check for errors
echo ""
echo "Checking for errors in logs:"
aws logs filter-log-events \
  --log-group-name "$LOG_GROUP" \
  --start-time "$START_TIME" \
  --filter-pattern "ERROR" \
  --query 'events[*].message' \
  --output text || echo "No errors found"

# Check Lambda configuration
echo ""
echo "Checking Lambda configuration:"
LAMBDA_INSTANCE_ID=$(aws lambda get-function-configuration --function-name "$LAMBDA_NAME" --query 'Environment.Variables.INSTANCE_ID' --output text)
echo "Lambda INSTANCE_ID: $LAMBDA_INSTANCE_ID"
echo "Actual Instance ID: $INSTANCE_ID"
if [ "$LAMBDA_INSTANCE_ID" != "$INSTANCE_ID" ]; then
  echo "⚠️  WARNING: Lambda INSTANCE_ID does not match actual instance ID!"
fi

# Monitor state
echo ""
echo "Monitoring instance state (EC2 soft reboots may not show 'rebooting' state)..."
INITIAL_STATE=$(aws ec2 describe-instance-status --instance-ids "$INSTANCE_ID" --query 'InstanceStatuses[0].InstanceState.Name' --output text 2>/dev/null || echo "unknown")
echo "Initial state: $INITIAL_STATE"

for i in {1..24}; do
  STATE=$(aws ec2 describe-instance-status --instance-ids "$INSTANCE_ID" --query 'InstanceStatuses[0].InstanceState.Name' --output text 2>/dev/null || echo "unknown")
  ELAPSED=$((i*5))
  echo "[${ELAPSED}s] State: $STATE"
  
  # Check for state changes (rebooting, stopping, or if it was running and briefly unavailable)
  if [ "$STATE" = "rebooting" ] || [ "$STATE" = "stopping" ]; then
    echo "✓ Instance state changed to: $STATE"
    break
  fi
  
  # If state becomes unavailable briefly, that might indicate reboot
  if [ "$STATE" = "unknown" ] && [ "$INITIAL_STATE" = "running" ]; then
    echo "⚠️  Instance state became unavailable - may be rebooting"
  fi
  
  sleep 5
done

# Final state check
FINAL_STATE=$(aws ec2 describe-instance-status --instance-ids "$INSTANCE_ID" --query 'InstanceStatuses[0].InstanceState.Name' --output text 2>/dev/null || echo "unknown")
echo ""
echo "Final state: $FINAL_STATE"
if [ "$FINAL_STATE" = "running" ] && [ "$INITIAL_STATE" = "running" ]; then
  echo "⚠️  Note: Instance remained in 'running' state. EC2 soft reboots may not show state transition."
  echo "   Check CloudWatch logs above to verify Lambda executed reboot command."
fi

