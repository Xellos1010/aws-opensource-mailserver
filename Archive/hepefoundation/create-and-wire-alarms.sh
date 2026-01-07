#!/usr/bin/env bash
set -Eeuo pipefail
IFS=$'\n\t'

# Create CloudWatch alarms and wire them to the stop-start Lambda
# This does NOT require redeploying the EC2 instance - alarms are independent resources

DOMAIN_NAME="hepefoundation.org"
LEGACY_STACK_NAME="hepefoundation-org-mailserver"
STOP_START_STACK_NAME="hepefoundation-org-stop-start-helper"
REGION="us-east-1"
PROFILE="hepe-admin-mfa"

echo "=========================================="
echo "Create and Wire CloudWatch Alarms"
echo "=========================================="
echo "Domain: ${DOMAIN_NAME}"
echo "Legacy Stack: ${LEGACY_STACK_NAME}"
echo "Stop-Start Stack: ${STOP_START_STACK_NAME}"
echo ""
echo "⚠️  NOTE: This does NOT affect the running instance"
echo "    Alarms are independent CloudWatch resources"
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

# Get SNS topic ARN from legacy stack
echo "Getting SNS topic ARN from legacy stack..."
SNS_TOPIC_ARN=$(aws cloudformation describe-stacks \
    --profile "${PROFILE}" \
    --region "${REGION}" \
    --stack-name "${LEGACY_STACK_NAME}" \
    --query 'Stacks[0].Outputs[?OutputKey==`AlertTopicArn`].OutputValue' \
    --output text 2>/dev/null)

if [ -z "$SNS_TOPIC_ARN" ] || [ "$SNS_TOPIC_ARN" = "None" ]; then
    echo "⚠️  Warning: No SNS topic found in legacy stack"
    echo "   Alarms will be created without SNS notifications"
    SNS_TOPIC_ARN=""
fi

if [ -n "$SNS_TOPIC_ARN" ]; then
    echo "✓ Found SNS topic: ${SNS_TOPIC_ARN}"
fi
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
    --statement-id "allow-cloudwatch-alarms-$(date +%s)" \
    --action "lambda:InvokeFunction" \
    --principal "events.amazonaws.com" \
    --source-arn "arn:aws:events:${REGION}:*:rule/*" \
    2>/dev/null && echo "  ✓ Permission granted" || echo "  ℹ️  Permission may already exist"

echo ""

# Build alarm actions array
ALARM_ACTIONS=("${LAMBDA_ARN}")
if [ -n "$SNS_TOPIC_ARN" ]; then
    ALARM_ACTIONS+=("${SNS_TOPIC_ARN}")
fi

# Create Instance Status Check Alarm
echo "Creating Instance Status Check Alarm..."
aws cloudwatch put-metric-alarm \
    --profile "${PROFILE}" \
    --region "${REGION}" \
    --alarm-name "InstanceStatusCheck-${INSTANCE_ID}" \
    --alarm-description "Alerts when EC2 instance status check fails (instance-level issues). Triggers automatic restart." \
    --metric-name "StatusCheckFailed_Instance" \
    --namespace "AWS/EC2" \
    --statistic "Maximum" \
    --period 60 \
    --evaluation-periods 2 \
    --threshold 1 \
    --comparison-operator "GreaterThanOrEqualToThreshold" \
    --alarm-actions $(IFS=' '; echo "${ALARM_ACTIONS[*]}") \
    --treat-missing-data "breaching" \
    --dimensions Name=InstanceId,Value="${INSTANCE_ID}" \
    > /dev/null 2>&1

if [ $? -eq 0 ]; then
    echo "  ✓ Created InstanceStatusCheck-${INSTANCE_ID}"
else
    echo "  ⚠️  Alarm may already exist, updating..."
    aws cloudwatch put-metric-alarm \
        --profile "${PROFILE}" \
        --region "${REGION}" \
        --alarm-name "InstanceStatusCheck-${INSTANCE_ID}" \
        --alarm-description "Alerts when EC2 instance status check fails (instance-level issues). Triggers automatic restart." \
        --metric-name "StatusCheckFailed_Instance" \
        --namespace "AWS/EC2" \
        --statistic "Maximum" \
        --period 60 \
        --evaluation-periods 2 \
        --threshold 1 \
        --comparison-operator "GreaterThanOrEqualToThreshold" \
        --alarm-actions $(IFS=' '; echo "${ALARM_ACTIONS[*]}") \
        --treat-missing-data "breaching" \
        --dimensions Name=InstanceId,Value="${INSTANCE_ID}" \
        && echo "  ✓ Updated InstanceStatusCheck-${INSTANCE_ID}"
fi

# Create System Status Check Alarm
echo "Creating System Status Check Alarm..."
aws cloudwatch put-metric-alarm \
    --profile "${PROFILE}" \
    --region "${REGION}" \
    --alarm-name "SystemStatusCheck-${INSTANCE_ID}" \
    --alarm-description "Alerts when EC2 system status check fails (AWS infrastructure issues). Triggers automatic restart." \
    --metric-name "StatusCheckFailed_System" \
    --namespace "AWS/EC2" \
    --statistic "Maximum" \
    --period 60 \
    --evaluation-periods 2 \
    --threshold 1 \
    --comparison-operator "GreaterThanOrEqualToThreshold" \
    --alarm-actions $(IFS=' '; echo "${ALARM_ACTIONS[*]}") \
    --treat-missing-data "breaching" \
    --dimensions Name=InstanceId,Value="${INSTANCE_ID}" \
    > /dev/null 2>&1

if [ $? -eq 0 ]; then
    echo "  ✓ Created SystemStatusCheck-${INSTANCE_ID}"
else
    echo "  ⚠️  Alarm may already exist, updating..."
    aws cloudwatch put-metric-alarm \
        --profile "${PROFILE}" \
        --region "${REGION}" \
        --alarm-name "SystemStatusCheck-${INSTANCE_ID}" \
        --alarm-description "Alerts when EC2 system status check fails (AWS infrastructure issues). Triggers automatic restart." \
        --metric-name "StatusCheckFailed_System" \
        --namespace "AWS/EC2" \
        --statistic "Maximum" \
        --period 60 \
        --evaluation-periods 2 \
        --threshold 1 \
        --comparison-operator "GreaterThanOrEqualToThreshold" \
        --alarm-actions $(IFS=' '; echo "${ALARM_ACTIONS[*]}") \
        --treat-missing-data "breaching" \
        --dimensions Name=InstanceId,Value="${INSTANCE_ID}" \
        && echo "  ✓ Updated SystemStatusCheck-${INSTANCE_ID}"
fi

# Create OOM Kill Alarm (requires log metric filter - may not work immediately)
echo "Creating OOM Kill Alarm..."
aws cloudwatch put-metric-alarm \
    --profile "${PROFILE}" \
    --region "${REGION}" \
    --alarm-name "OOMKillDetected-${INSTANCE_ID}" \
    --alarm-description "Alerts when Out-of-Memory killer terminates processes. Triggers automatic restart." \
    --metric-name "oom_kills" \
    --namespace "EC2" \
    --statistic "Sum" \
    --period 60 \
    --evaluation-periods 1 \
    --threshold 0 \
    --comparison-operator "GreaterThanThreshold" \
    --alarm-actions $(IFS=' '; echo "${ALARM_ACTIONS[*]}") \
    --treat-missing-data "notBreaching" \
    > /dev/null 2>&1

if [ $? -eq 0 ]; then
    echo "  ✓ Created OOMKillDetected-${INSTANCE_ID}"
    echo "  ⚠️  Note: This alarm requires a log metric filter to work"
    echo "     The metric will only appear after OOM kills occur in syslog"
else
    echo "  ⚠️  Alarm may already exist, updating..."
    aws cloudwatch put-metric-alarm \
        --profile "${PROFILE}" \
        --region "${REGION}" \
        --alarm-name "OOMKillDetected-${INSTANCE_ID}" \
        --alarm-description "Alerts when Out-of-Memory killer terminates processes. Triggers automatic restart." \
        --metric-name "oom_kills" \
        --namespace "EC2" \
        --statistic "Sum" \
        --period 60 \
        --evaluation-periods 1 \
        --threshold 0 \
        --comparison-operator "GreaterThanThreshold" \
        --alarm-actions $(IFS=' '; echo "${ALARM_ACTIONS[*]}") \
        --treat-missing-data "notBreaching" \
        && echo "  ✓ Updated OOMKillDetected-${INSTANCE_ID}"
fi

echo ""
echo "=========================================="
echo "Alarm Creation Complete!"
echo "=========================================="
echo ""
echo "✅ Alarms created/updated successfully"
echo "✅ All alarms are wired to trigger automatic restart"
echo ""
echo "Summary:"
echo "  - Instance Status Check Alarm: Created/Updated"
echo "  - System Status Check Alarm: Created/Updated"
echo "  - OOM Kill Alarm: Created/Updated"
echo ""
echo "⚠️  IMPORTANT:"
echo "  - No instance redeployment required"
echo "  - Instance continues running normally"
echo "  - Alarms will trigger Lambda on failures"
echo ""
echo "To verify alarms:"
echo "  aws cloudwatch describe-alarms --alarm-names InstanceStatusCheck-${INSTANCE_ID} --query 'MetricAlarms[0].{Name:AlarmName,State:StateValue,Actions:AlarmActions}'"
echo ""














