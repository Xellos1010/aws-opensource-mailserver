#!/usr/bin/env bash
set -Eeuo pipefail
IFS=$'\n\t'

# Deploy Emergency Monitoring Stack for HEPE Foundation Legacy Stack
# This deploys a CDK stack that monitors the legacy CloudFormation stack
# and automatically restarts the instance on critical failures

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/../.." && pwd)"

DOMAIN_NAME="hepefoundation.org"
LEGACY_STACK_NAME="hepefoundation-org-mailserver"
REGION="us-east-1"
PROFILE="hepe-admin-mfa"

echo "=========================================="
echo "Deploying Emergency Monitoring Stack"
echo "=========================================="
echo "Domain: ${DOMAIN_NAME}"
echo "Legacy Stack: ${LEGACY_STACK_NAME}"
echo "Region: ${REGION}"
echo "Profile: ${PROFILE}"
echo "=========================================="
echo ""

# Verify legacy stack exists
echo "Verifying legacy stack exists..."
STACK_STATUS=$(aws cloudformation describe-stacks \
    --profile "${PROFILE}" \
    --region "${REGION}" \
    --stack-name "${LEGACY_STACK_NAME}" \
    --query 'Stacks[0].StackStatus' \
    --output text 2>/dev/null || echo "STACK_NOT_FOUND")

if [ "$STACK_STATUS" = "STACK_NOT_FOUND" ]; then
    echo "Error: Legacy stack ${LEGACY_STACK_NAME} not found"
    echo "Please deploy the mailserver stack first using deploy-stack.sh"
    exit 1
fi

echo "✓ Legacy stack found with status: ${STACK_STATUS}"
echo ""

# Get instance ID from legacy stack to verify
echo "Getting instance ID from legacy stack..."
INSTANCE_ID=$(aws cloudformation describe-stacks \
    --profile "${PROFILE}" \
    --region "${REGION}" \
    --stack-name "${LEGACY_STACK_NAME}" \
    --query 'Stacks[0].Outputs[?OutputKey==`RestorePrefix`].OutputValue' \
    --output text 2>/dev/null)

if [ -z "$INSTANCE_ID" ]; then
    # Try InstanceId output instead
    INSTANCE_ID=$(aws cloudformation describe-stacks \
        --profile "${PROFILE}" \
        --region "${REGION}" \
        --stack-name "${LEGACY_STACK_NAME}" \
        --query 'Stacks[0].Outputs[?OutputKey==`InstanceId`].OutputValue' \
        --output text 2>/dev/null)
fi

if [ -z "$INSTANCE_ID" ] || [ "$INSTANCE_ID" = "None" ]; then
    echo "⚠️  Warning: Could not find instance ID in stack outputs"
    echo "   The Lambda will discover it at runtime"
else
    echo "✓ Found instance ID: ${INSTANCE_ID}"
fi
echo ""

# Check for existing SNS topic from legacy stack
echo "Checking for existing SNS topic..."
ALARMS_TOPIC_ARN=$(aws cloudformation describe-stacks \
    --profile "${PROFILE}" \
    --region "${REGION}" \
    --stack-name "${LEGACY_STACK_NAME}" \
    --query 'Stacks[0].Outputs[?OutputKey==`AlertTopicArn`].OutputValue' \
    --output text 2>/dev/null || echo "")

if [ -n "$ALARMS_TOPIC_ARN" ] && [ "$ALARMS_TOPIC_ARN" != "None" ]; then
    echo "✓ Found existing SNS topic: ${ALARMS_TOPIC_ARN}"
    export ALARMS_TOPIC_ARN
else
    echo "ℹ️  No existing SNS topic found, will create new one"
fi
echo ""

# Deploy the emergency monitoring stack
echo "Deploying emergency monitoring CDK stack..."
echo ""

cd "${ROOT_DIR}"

# Set AWS profile and region
export AWS_PROFILE="${PROFILE}"
export AWS_REGION="${REGION}"
export CDK_DEFAULT_REGION="${REGION}"
export CDK_DEFAULT_ACCOUNT=$(aws sts get-caller-identity \
    --profile "${PROFILE}" \
    --query Account \
    --output text)

# Deploy using Nx
pnpm nx run cdk-emcnotary-instance:emergency-monitoring-legacy:deploy \
    DOMAIN="${DOMAIN_NAME}" \
    LEGACY_STACK_NAME="${LEGACY_STACK_NAME}" \
    ${ALARMS_TOPIC_ARN:+ALARMS_TOPIC_ARN="${ALARMS_TOPIC_ARN}"}

echo ""
echo "=========================================="
echo "Deployment Complete!"
echo "=========================================="
echo ""
echo "Next steps:"
echo "1. Update existing CloudWatch alarms to include Lambda action"
echo "2. Subscribe to SNS topic for notifications"
echo "3. Test the monitoring by checking instance health"
echo ""
echo "To update alarms, run:"
echo "  ./Archive/hepefoundation/update-alarms-with-lambda.sh"
echo ""
echo "To check instance health:"
echo "  ./Archive/hepefoundation/check-instance-health.sh"
echo ""














