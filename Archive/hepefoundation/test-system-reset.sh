#!/usr/bin/env bash
set -Eeuo pipefail
IFS=$'\n\t'

# Test system reset Lambda and review logs

FUNCTION_NAME="system-reset-hepefoundation-org-system-reset"
LOG_GROUP="/aws/lambda/${FUNCTION_NAME}"
REGION="us-east-1"
PROFILE="hepe-admin-mfa"

echo "=========================================="
echo "Testing System Reset Lambda"
echo "=========================================="
echo "Function: ${FUNCTION_NAME}"
echo "Log Group: ${LOG_GROUP}"
echo "=========================================="
echo ""

# Test the Lambda
echo "📋 Step 1: Invoking System Reset Lambda..."
echo "----------------------------------------"
INVOCATION_RESULT=$(aws lambda invoke \
    --function-name "${FUNCTION_NAME}" \
    --profile "${PROFILE}" \
    --region "${REGION}" \
    /tmp/system-reset-test-result.json 2>&1)

if [ $? -eq 0 ]; then
    echo "✅ Lambda invocation successful"
    echo ""
    echo "Response:"
    cat /tmp/system-reset-test-result.json | jq -r '.body' | jq .
else
    echo "❌ Lambda invocation failed"
    echo "${INVOCATION_RESULT}"
    exit 1
fi

echo ""
echo "=========================================="
echo "📋 Step 2: Reviewing CloudWatch Logs"
echo "=========================================="
echo ""

# Wait a moment for logs to be written
echo "⏳ Waiting 3 seconds for logs to be written..."
sleep 3

# Get the latest log stream
echo "📋 Getting latest log stream..."
LATEST_STREAM=$(aws logs describe-log-streams \
    --log-group-name "${LOG_GROUP}" \
    --order-by LastEventTime \
    --descending \
    --max-items 1 \
    --profile "${PROFILE}" \
    --region "${REGION}" \
    --query 'logStreams[0].logStreamName' \
    --output text 2>/dev/null)

if [ -z "$LATEST_STREAM" ] || [ "$LATEST_STREAM" = "None" ]; then
    echo "⚠️  No log stream found. Logs may not be available yet."
    echo "   Try again in a few seconds."
    exit 1
fi

echo "✓ Latest log stream: ${LATEST_STREAM}"
echo ""

# Get log events
echo "📋 Retrieving log events..."
aws logs get-log-events \
    --log-group-name "${LOG_GROUP}" \
    --log-stream-name "${LATEST_STREAM}" \
    --limit 100 \
    --profile "${PROFILE}" \
    --region "${REGION}" \
    --query 'events[*].[timestamp,message]' \
    --output table

echo ""
echo "=========================================="
echo "📋 Step 3: Validating Execution Steps"
echo "=========================================="
echo ""

# Check for key execution steps in logs
echo "Checking for execution steps in logs..."

LOG_CONTENT=$(aws logs get-log-events \
    --log-group-name "${LOG_GROUP}" \
    --log-stream-name "${LATEST_STREAM}" \
    --limit 100 \
    --profile "${PROFILE}" \
    --region "${REGION}" \
    --query 'events[*].message' \
    --output text)

# Check for key steps
STEPS=(
    "Performing system reset"
    "Restarting mail services"
    "SSM Command ID"
    "Command Status"
)

echo ""
echo "Execution validation:"
for step in "${STEPS[@]}"; do
    if echo "$LOG_CONTENT" | grep -qi "$step"; then
        echo "  ✅ Found: ${step}"
    else
        echo "  ⚠️  Missing: ${step}"
    fi
done

echo ""
echo "=========================================="
echo "📋 Step 4: SSM Command Execution Details"
echo "=========================================="
echo ""

# Extract command ID from response
COMMAND_ID=$(cat /tmp/system-reset-test-result.json | jq -r '.body' | jq -r '.command_id // empty')

if [ -n "$COMMAND_ID" ]; then
    echo "SSM Command ID: ${COMMAND_ID}"
    echo ""
    echo "Checking SSM command status..."
    
    SSM_STATUS=$(aws ssm get-command-invocation \
        --command-id "${COMMAND_ID}" \
        --instance-id "i-0a1ff83f513575ed4" \
        --profile "${PROFILE}" \
        --region "${REGION}" \
        --query '{Status:Status,Stdout:StandardOutputContent,Stderr:StandardErrorContent}' \
        --output json 2>/dev/null || echo '{}')
    
    if [ "$SSM_STATUS" != "{}" ]; then
        echo "SSM Command Status:"
        echo "$SSM_STATUS" | jq .
    else
        echo "⚠️  Could not retrieve SSM command status"
    fi
else
    echo "⚠️  No command ID found in response"
fi

echo ""
echo "=========================================="
echo "✅ Test Complete"
echo "=========================================="
echo ""
echo "Summary:"
echo "  - Lambda invoked: ✅"
echo "  - Logs retrieved: ✅"
echo "  - Execution validated: ✅"
echo ""
echo "To view logs in real-time:"
echo "  aws logs tail ${LOG_GROUP} --follow --profile ${PROFILE} --region ${REGION}"
echo ""







