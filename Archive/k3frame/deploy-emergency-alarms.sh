#!/usr/bin/env bash
set -Eeuo pipefail
IFS=$'\n\t'

# Deploy Emergency Alarms Stack for HEPE Foundation
# This stack manages CloudWatch alarms that trigger automatic instance restart
# All alarms are tracked in CloudFormation - no rogue resources

DOMAIN_NAME="k3frame.com"
LEGACY_STACK_NAME="hepefoundation-org-mailserver"
STOP_START_STACK_NAME="hepefoundation-org-stop-start-helper"
ALARMS_STACK_NAME="hepefoundation-org-emergency-alarms"
REGION="us-east-1"
PROFILE="hepe-admin-mfa"

echo "=========================================="
echo "Deploying Emergency Alarms Stack"
echo "=========================================="
echo "Domain: ${DOMAIN_NAME}"
echo "Legacy Stack: ${LEGACY_STACK_NAME}"
echo "Stop-Start Stack: ${STOP_START_STACK_NAME}"
echo "Alarms Stack: ${ALARMS_STACK_NAME}"
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

# Get Lambda ARNs from various stacks
echo "Getting Lambda ARNs from stacks..."

# Stop-start Lambda
STOP_START_LAMBDA_ARN=$(aws cloudformation describe-stacks \
    --profile "${PROFILE}" \
    --region "${REGION}" \
    --stack-name "${STOP_START_STACK_NAME}" \
    --query 'Stacks[0].Outputs[?OutputKey==`LambdaFunctionArn`].OutputValue' \
    --output text 2>/dev/null)

if [ -z "$STOP_START_LAMBDA_ARN" ] || [ "$STOP_START_LAMBDA_ARN" = "None" ]; then
    echo "Error: Could not find stop-start Lambda ARN"
    echo "Please deploy the stop-start helper stack first:"
    echo "  ./Archive/hepefoundation/deploy-stop-start-helper.sh"
    exit 1
fi
echo "✓ Found stop-start Lambda ARN: ${STOP_START_LAMBDA_ARN}"

# System reset Lambda
SYSTEM_RESET_STACK_NAME="hepefoundation-org-system-reset"
SYSTEM_RESET_LAMBDA_ARN=$(aws cloudformation describe-stacks \
    --profile "${PROFILE}" \
    --region "${REGION}" \
    --stack-name "${SYSTEM_RESET_STACK_NAME}" \
    --query 'Stacks[0].Outputs[?OutputKey==`LambdaFunctionArn`].OutputValue' \
    --output text 2>/dev/null)

if [ -z "$SYSTEM_RESET_LAMBDA_ARN" ] || [ "$SYSTEM_RESET_LAMBDA_ARN" = "None" ]; then
    echo "Error: Could not find system reset Lambda ARN"
    echo "Please deploy the system reset stack first:"
    echo "  ./Archive/hepefoundation/deploy-system-reset.sh"
    exit 1
fi
echo "✓ Found system reset Lambda ARN: ${SYSTEM_RESET_LAMBDA_ARN}"

# Service restart Lambda
SERVICE_RESTART_STACK_NAME="hepefoundation-org-service-restart"
SERVICE_RESTART_LAMBDA_ARN=$(aws cloudformation describe-stacks \
    --profile "${PROFILE}" \
    --region "${REGION}" \
    --stack-name "${SERVICE_RESTART_STACK_NAME}" \
    --query 'Stacks[0].Outputs[?OutputKey==`LambdaFunctionArn`].OutputValue' \
    --output text 2>/dev/null)

if [ -z "$SERVICE_RESTART_LAMBDA_ARN" ] || [ "$SERVICE_RESTART_LAMBDA_ARN" = "None" ]; then
    echo "Error: Could not find service restart Lambda ARN"
    echo "Please deploy the service restart stack first:"
    echo "  ./Archive/hepefoundation/deploy-service-restart.sh"
    exit 1
fi
echo "✓ Found service restart Lambda ARN: ${SERVICE_RESTART_LAMBDA_ARN}"

# Mail health check Lambda
MAIL_HEALTH_CHECK_STACK_NAME="hepefoundation-org-mail-health-check"
MAIL_HEALTH_CHECK_LAMBDA_ARN=$(aws cloudformation describe-stacks \
    --profile "${PROFILE}" \
    --region "${REGION}" \
    --stack-name "${MAIL_HEALTH_CHECK_STACK_NAME}" \
    --query 'Stacks[0].Outputs[?OutputKey==`LambdaFunctionArn`].OutputValue' \
    --output text 2>/dev/null)

if [ -z "$MAIL_HEALTH_CHECK_LAMBDA_ARN" ] || [ "$MAIL_HEALTH_CHECK_LAMBDA_ARN" = "None" ]; then
    echo "Error: Could not find mail health check Lambda ARN"
    echo "Please deploy the mail health check stack first:"
    echo "  ./Archive/hepefoundation/deploy-mail-health-check.sh"
    exit 1
fi
echo "✓ Found mail health check Lambda ARN: ${MAIL_HEALTH_CHECK_LAMBDA_ARN}"
echo ""

# Get SNS topic ARN from legacy stack (optional)
echo "Checking for SNS topic in legacy stack..."
SNS_TOPIC_ARN=$(aws cloudformation describe-stacks \
    --profile "${PROFILE}" \
    --region "${REGION}" \
    --stack-name "${LEGACY_STACK_NAME}" \
    --query 'Stacks[0].Outputs[?OutputKey==`AlertTopicArn`].OutputValue' \
    --output text 2>/dev/null || echo "")

if [ -n "$SNS_TOPIC_ARN" ] && [ "$SNS_TOPIC_ARN" != "None" ]; then
    echo "✓ Found SNS topic: ${SNS_TOPIC_ARN}"
    SNS_PARAM="AlertTopicArn=${SNS_TOPIC_ARN}"
else
    echo "ℹ️  No SNS topic found, alarms will only trigger Lambda"
    SNS_PARAM="AlertTopicArn="
fi
echo ""

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Deploy the CloudFormation stack
echo "Deploying emergency alarms stack..."
echo ""

if ! aws cloudformation deploy \
    --profile "${PROFILE}" \
    --region "${REGION}" \
    --template-file "${SCRIPT_DIR}/emergency-alarms-stack.yaml" \
    --stack-name "${ALARMS_STACK_NAME}" \
    --capabilities CAPABILITY_NAMED_IAM \
    --parameter-overrides \
        InstanceId="${INSTANCE_ID}" \
        StopStartLambdaArn="${STOP_START_LAMBDA_ARN}" \
        SystemResetLambdaArn="${SYSTEM_RESET_LAMBDA_ARN}" \
        ServiceRestartLambdaArn="${SERVICE_RESTART_LAMBDA_ARN}" \
        MailHealthCheckLambdaArn="${MAIL_HEALTH_CHECK_LAMBDA_ARN}" \
        ${SNS_PARAM} \
        Region="${REGION}"; then
    echo "Error: Stack deployment failed. Check the CloudFormation console for details."
    exit 1
fi

echo ""
echo "=========================================="
echo "Deployment Complete!"
echo "=========================================="
echo ""
echo "✅ Emergency alarms stack deployed successfully"
echo "✅ All alarms are managed via CloudFormation"
echo ""
echo "Stack: ${ALARMS_STACK_NAME}"
echo "Alarms created:"
echo "  - InstanceStatusCheck-${INSTANCE_ID}"
echo "  - SystemStatusCheck-${INSTANCE_ID}"
echo "  - OOMKillDetected-${INSTANCE_ID}"
echo ""
echo "All alarms are wired to trigger:"
echo "  - Mail Recovery Orchestrator Lambda (checks health -> system reset -> service restart -> instance restart)"
echo "  - System Reset Lambda: ${SYSTEM_RESET_LAMBDA_ARN} (comprehensive recovery)"
echo "  - Service Restart Lambda: ${SERVICE_RESTART_LAMBDA_ARN} (simple fallback)"
echo "  - Stop-Start Lambda: ${STOP_START_LAMBDA_ARN} (last resort)"
echo "  - Mail Health Check Lambda: ${MAIL_HEALTH_CHECK_LAMBDA_ARN}"
if [ -n "$SNS_TOPIC_ARN" ] && [ "$SNS_TOPIC_ARN" != "None" ]; then
    echo "  - SNS Topic: ${SNS_TOPIC_ARN}"
fi
echo ""
echo "To verify alarms:"
echo "  aws cloudwatch describe-alarms --alarm-names InstanceStatusCheck-${INSTANCE_ID} --query 'MetricAlarms[0].{Name:AlarmName,State:StateValue,Actions:AlarmActions}'"
echo ""
echo "To delete alarms (if needed):"
echo "  aws cloudformation delete-stack --stack-name ${ALARMS_STACK_NAME}"
echo ""














