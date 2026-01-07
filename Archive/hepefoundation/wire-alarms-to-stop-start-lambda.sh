#!/usr/bin/env bash
set -Eeuo pipefail
IFS=$'\n\t'

# Wire existing CloudWatch alarms to the stop-start helper Lambda for emergency restarts
# This enables automatic instance restart when critical failures are detected

DOMAIN_NAME="hepefoundation.org"
LEGACY_STACK_NAME="hepefoundation-org-mailserver"
STOP_START_STACK_NAME="hepefoundation-org-stop-start-helper"
REGION="us-east-1"
PROFILE="hepe-admin-mfa"

echo "=========================================="
echo "Wiring CloudWatch Alarms to Stop-Start Lambda"
echo "=========================================="
echo "Domain: ${DOMAIN_NAME}"
echo "Legacy Stack: ${LEGACY_STACK_NAME}"
echo "Stop-Start Stack: ${STOP_START_STACK_NAME}"
echo "=========================================="
echo ""

# Get instance ID from legacy stack
echo "Getting instance ID from legacy stack..."
INSTANCE_ID=$(aws cloudformation describe-stacks \
    --profile "${PROFILE}" \
    --region "${REGION}" \
    --stack-name "${LEGACY_STACK_NAME}" \
    --query 'Stacks[0].Outputs[?OutputKey==`RestorePrefix`].OutputValue' \
    --output text 2>/dev/null)

if [ -z "$INSTANCE_ID" ]; then
    INSTANCE_ID=$(aws cloudformation describe-stacks \
        --profile "${PROFILE}" \
        --region "${REGION}" \
        --stack-name "${LEGACY_STACK_NAME}" \
        --query 'Stacks[0].Outputs[?OutputKey==`InstanceId`].OutputValue' \
        --output text 2>/dev/null)
fi

if [ -z "$INSTANCE_ID" ] || [ "$INSTANCE_ID" = "None" ]; then
    echo "Error: Could not find instance ID in legacy stack"
    exit 1
fi

echo "✓ Found instance ID: ${INSTANCE_ID}"
echo ""

# Get Lambda ARN from stop-start helper stack
echo "Getting Lambda ARN from stop-start helper stack..."
LAMBDA_ARN=$(aws cloudformation describe-stacks \
    --profile "${PROFILE}" \
    --region "${REGION}" \
    --stack-name "${STOP_START_STACK_NAME}" \
    --query 'Stacks[0].Outputs[?OutputKey==`LambdaFunctionArn`].OutputValue' \
    --output text 2>/dev/null)

if [ -z "$LAMBDA_ARN" ] || [ "$LAMBDA_ARN" = "None" ]; then
    echo "Error: Could not find Lambda ARN in stop-start helper stack"
    echo "Please deploy the stop-start helper stack first:"
    echo "  ./Archive/hepefoundation/deploy-stop-start-helper.sh"
    exit 1
fi

echo "✓ Found Lambda ARN: ${LAMBDA_ARN}"
echo ""

# Grant Lambda permission to be invoked by CloudWatch alarms
echo "Granting CloudWatch permission to invoke Lambda..."
aws lambda add-permission \
    --profile "${PROFILE}" \
    --region "${REGION}" \
    --function-name "${LAMBDA_ARN}" \
    --statement-id "allow-cloudwatch-alarms" \
    --action "lambda:InvokeFunction" \
    --principal "events.amazonaws.com" \
    --source-arn "arn:aws:events:${REGION}:*:rule/*" \
    2>/dev/null || echo "  ℹ️  Permission may already exist"

echo ""

# Alarm names to update (matching legacy stack alarm names)
ALARM_NAMES=(
    "InstanceStatusCheck-${INSTANCE_ID}"
    "SystemStatusCheck-${INSTANCE_ID}"
    "OOMKillDetected-${INSTANCE_ID}"
)

echo "Updating alarms to include Lambda action for emergency restart..."
echo ""

for ALARM_NAME in "${ALARM_NAMES[@]}"; do
    echo "Processing alarm: ${ALARM_NAME}"
    
    # Check if alarm exists
    ALARM_EXISTS=$(aws cloudwatch describe-alarms \
        --profile "${PROFILE}" \
        --region "${REGION}" \
        --alarm-names "${ALARM_NAME}" \
        --query 'MetricAlarms[0].AlarmName' \
        --output text 2>/dev/null || echo "")
    
    if [ -z "$ALARM_EXISTS" ] || [ "$ALARM_EXISTS" = "None" ]; then
        echo "  ⚠️  Alarm ${ALARM_NAME} not found, skipping"
        continue
    fi
    
    # Get current alarm actions
    CURRENT_ACTIONS=$(aws cloudwatch describe-alarms \
        --profile "${PROFILE}" \
        --region "${REGION}" \
        --alarm-names "${ALARM_NAME}" \
        --query 'MetricAlarms[0].AlarmActions' \
        --output json 2>/dev/null)
    
    # Check if Lambda is already in actions
    if echo "$CURRENT_ACTIONS" | grep -q "$LAMBDA_ARN"; then
        echo "  ✓ Lambda action already present"
        continue
    fi
    
    # Add Lambda action to existing actions
    UPDATED_ACTIONS=$(echo "$CURRENT_ACTIONS" | jq ". + [\"${LAMBDA_ARN}\"]")
    
    # Get alarm configuration
    ALARM_CONFIG=$(aws cloudwatch describe-alarms \
        --profile "${PROFILE}" \
        --region "${REGION}" \
        --alarm-names "${ALARM_NAME}" \
        --query 'MetricAlarms[0]' \
        --output json)
    
    # Update alarm with Lambda action
    echo "  Adding Lambda action..."
    aws cloudwatch put-metric-alarm \
        --profile "${PROFILE}" \
        --region "${REGION}" \
        --alarm-name "${ALARM_NAME}" \
        --alarm-description "$(echo "$ALARM_CONFIG" | jq -r '.AlarmDescription')" \
        --metric-name "$(echo "$ALARM_CONFIG" | jq -r '.MetricName')" \
        --namespace "$(echo "$ALARM_CONFIG" | jq -r '.Namespace')" \
        --statistic "$(echo "$ALARM_CONFIG" | jq -r '.Statistic')" \
        --period "$(echo "$ALARM_CONFIG" | jq -r '.Period')" \
        --evaluation-periods "$(echo "$ALARM_CONFIG" | jq -r '.EvaluationPeriods')" \
        --threshold "$(echo "$ALARM_CONFIG" | jq -r '.Threshold')" \
        --comparison-operator "$(echo "$ALARM_CONFIG" | jq -r '.ComparisonOperator')" \
        --alarm-actions $(echo "$UPDATED_ACTIONS" | jq -r '.[]' | tr '\n' ' ') \
        --treat-missing-data "$(echo "$ALARM_CONFIG" | jq -r '.TreatMissingData')" \
        --dimensions "$(echo "$ALARM_CONFIG" | jq -c '.Dimensions')" \
        > /dev/null 2>&1
    
    if [ $? -eq 0 ]; then
        echo "  ✓ Successfully updated ${ALARM_NAME}"
    else
        echo "  ✗ Failed to update ${ALARM_NAME}"
    fi
done

echo ""
echo "=========================================="
echo "Alarm Wiring Complete!"
echo "=========================================="
echo ""
echo "Alarms are now configured to automatically restart the instance"
echo "when critical failures are detected, using the existing stop-start Lambda."
echo ""
echo "Summary:"
echo "  - Scheduled restart: Daily at 3am EST (8am UTC)"
echo "  - Emergency restart: On Instance Status Check failure"
echo "  - Emergency restart: On System Status Check failure"
echo "  - Emergency restart: On OOM Kill detection"
echo ""
echo "To verify, check alarm actions:"
echo "  aws cloudwatch describe-alarms --alarm-names InstanceStatusCheck-${INSTANCE_ID} --query 'MetricAlarms[0].AlarmActions'"
echo ""














