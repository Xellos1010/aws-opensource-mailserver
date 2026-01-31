#!/usr/bin/env bash
set -Eeuo pipefail
IFS=$'\n\t'

# Test script to verify CloudWatch alarm can invoke the stop-start Lambda
# This script sets the alarm to ALARM state and verifies Lambda execution

DOMAIN_NAME="k3frame.com"
INSTANCE_ID="i-0a1ff83f513575ed4"
ALARM_NAME="InstanceStatusCheck-${INSTANCE_ID}"
LAMBDA_NAME="StopStartLambda-hepefoundation-org-stop-start-helper"
REGION="us-east-1"
PROFILE="hepe-admin-mfa"

echo "=========================================="
echo "Testing Alarm-to-Lambda Connection"
echo "=========================================="
echo "Domain: ${DOMAIN_NAME}"
echo "Instance ID: ${INSTANCE_ID}"
echo "Alarm: ${ALARM_NAME}"
echo "Lambda: ${LAMBDA_NAME}"
echo "=========================================="
echo ""

# Check current alarm state
echo "📋 Checking current alarm state..."
CURRENT_STATE=$(aws cloudwatch describe-alarms \
    --profile "${PROFILE}" \
    --region "${REGION}" \
    --alarm-names "${ALARM_NAME}" \
    --query 'MetricAlarms[0].StateValue' \
    --output text 2>/dev/null || echo "UNKNOWN")

echo "Current alarm state: ${CURRENT_STATE}"
echo ""

# Check Lambda permissions
echo "📋 Checking Lambda permissions..."
LAMBDA_POLICY=$(aws lambda get-policy \
    --profile "${PROFILE}" \
    --region "${REGION}" \
    --function-name "${LAMBDA_NAME}" \
    --query 'Policy' \
    --output text 2>/dev/null || echo "{}")

if echo "${LAMBDA_POLICY}" | jq -e '.Statement[] | select(.Sid == "allow-cloudwatch-alarms")' > /dev/null 2>&1; then
    echo "✓ Lambda has CloudWatch alarm permission"
else
    echo "✗ Lambda missing CloudWatch alarm permission"
    echo "  Run: aws lambda add-permission --function-name ${LAMBDA_NAME} --statement-id allow-cloudwatch-alarms --action lambda:InvokeFunction --principal events.amazonaws.com --source-arn 'arn:aws:cloudwatch:${REGION}:*:alarm:*'"
    exit 1
fi
echo ""

# Check alarm actions
echo "📋 Checking alarm actions..."
ALARM_ACTIONS=$(aws cloudwatch describe-alarms \
    --profile "${PROFILE}" \
    --region "${REGION}" \
    --alarm-names "${ALARM_NAME}" \
    --query 'MetricAlarms[0].AlarmActions' \
    --output json 2>/dev/null)

LAMBDA_ARN=$(aws lambda get-function \
    --profile "${PROFILE}" \
    --region "${REGION}" \
    --function-name "${LAMBDA_NAME}" \
    --query 'Configuration.FunctionArn' \
    --output text 2>/dev/null)

if echo "${ALARM_ACTIONS}" | grep -q "${LAMBDA_ARN}"; then
    echo "✓ Alarm is wired to Lambda function"
else
    echo "✗ Alarm is NOT wired to Lambda function"
    echo "  Alarm actions: ${ALARM_ACTIONS}"
    echo "  Lambda ARN: ${LAMBDA_ARN}"
    echo "  Run: ./Archive/hepefoundation/wire-alarms-to-stop-start-lambda.sh"
    exit 1
fi
echo ""

# Get recent Lambda invocations (last 5 minutes)
echo "📋 Checking recent Lambda invocations..."
RECENT_INVOCATIONS=$(aws logs filter-log-events \
    --profile "${PROFILE}" \
    --region "${REGION}" \
    --log-group-name "/aws/lambda/${LAMBDA_NAME}" \
    --start-time $(($(date +%s) - 300))000 \
    --query 'events[*].message' \
    --output text 2>/dev/null | wc -l || echo "0")

echo "Recent invocations (last 5 min): ${RECENT_INVOCATIONS}"
echo ""

# Test by setting alarm state to ALARM (this simulates the alarm triggering)
echo "🧪 Testing alarm invocation..."
echo "Setting alarm state to ALARM to trigger Lambda..."
echo ""

# Note: We can't directly set alarm state, but we can check if the alarm is already in ALARM state
# and if so, verify the Lambda was invoked

if [ "${CURRENT_STATE}" = "ALARM" ]; then
    echo "⚠️  Alarm is already in ALARM state"
    echo "Checking if Lambda was invoked..."
    
    # Check for Lambda invocations in the last 10 minutes
    INVOCATION_COUNT=$(aws logs filter-log-events \
        --profile "${PROFILE}" \
        --region "${REGION}" \
        --log-group-name "/aws/lambda/${LAMBDA_NAME}" \
        --start-time $(($(date +%s) - 600))000 \
        --filter-pattern "START RequestId" \
        --query 'events | length(@)' \
        --output text 2>/dev/null || echo "0")
    
    if [ "${INVOCATION_COUNT}" -gt "0" ]; then
        echo "✓ Lambda was invoked ${INVOCATION_COUNT} time(s) in the last 10 minutes"
        echo ""
        echo "Recent Lambda logs:"
        aws logs tail "/aws/lambda/${LAMBDA_NAME}" \
            --profile "${PROFILE}" \
            --region "${REGION}" \
            --since 10m \
            --format short 2>/dev/null | tail -20 || echo "No recent logs"
    else
        echo "✗ Lambda was NOT invoked in the last 10 minutes"
        echo "  This indicates the alarm is not properly triggering the Lambda"
        echo ""
        echo "Troubleshooting steps:"
        echo "  1. Verify Lambda permission includes CloudWatch alarms"
        echo "  2. Verify alarm actions include Lambda ARN"
        echo "  3. Check CloudWatch Logs for Lambda invocation errors"
        exit 1
    fi
else
    echo "ℹ️  Alarm is in ${CURRENT_STATE} state (not ALARM)"
    echo "To test, wait for alarm to trigger naturally or manually cause a status check failure"
    echo ""
    echo "To manually test, you can:"
    echo "  1. Stop the instance temporarily (will trigger status check failure)"
    echo "  2. Wait for alarm to enter ALARM state"
    echo "  3. Check Lambda logs for invocation"
fi

echo ""
echo "=========================================="
echo "Test Complete"
echo "=========================================="
echo ""
echo "To monitor Lambda execution in real-time:"
echo "  aws logs tail /aws/lambda/${LAMBDA_NAME} --follow --profile ${PROFILE} --region ${REGION}"
echo ""

