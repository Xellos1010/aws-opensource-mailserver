#!/usr/bin/env bash
set -Eeuo pipefail
IFS=$'\n\t'

# Deploy system stats reporting Lambda for hepefoundation.org

DOMAIN_NAME="hepefoundation.org"
STACK_NAME="hepefoundation-org-system-stats"
LEGACY_STACK_NAME="hepefoundation-org-mailserver"
REGION="us-east-1"
PROFILE="hepe-admin-mfa"
TEMPLATE_FILE="system-stats-lambda.yaml"

echo "=========================================="
echo "Deploying System Stats Lambda"
echo "=========================================="
echo "Domain: ${DOMAIN_NAME}"
echo "Stack: ${STACK_NAME}"
echo "Template: ${TEMPLATE_FILE}"
echo "=========================================="
echo ""

# Get instance ID from mailserver stack
echo "📋 Getting Instance ID from mailserver stack..."
INSTANCE_ID=$(aws cloudformation describe-stacks \
    --profile "${PROFILE}" \
    --region "${REGION}" \
    --stack-name "${LEGACY_STACK_NAME}" \
    --query 'Stacks[0].Outputs[?OutputKey==`InstanceId`].OutputValue' \
    --output text 2>/dev/null)

if [ -z "$INSTANCE_ID" ] || [ "$INSTANCE_ID" = "None" ]; then
    INSTANCE_ID=$(aws cloudformation describe-stacks \
        --profile "${PROFILE}" \
        --region "${REGION}" \
        --stack-name "${LEGACY_STACK_NAME}" \
        --query 'Stacks[0].Outputs[?OutputKey==`RestorePrefix`].OutputValue' \
        --output text 2>/dev/null)
fi

if [ -z "$INSTANCE_ID" ] || [ "$INSTANCE_ID" = "None" ]; then
    echo "❌ Error: Could not find instance ID from stack ${LEGACY_STACK_NAME}"
    exit 1
fi

echo "✓ Instance ID: ${INSTANCE_ID}"
echo ""

# Check if stack exists
STACK_EXISTS=$(aws cloudformation describe-stacks \
    --profile "${PROFILE}" \
    --region "${REGION}" \
    --stack-name "${STACK_NAME}" \
    --query 'Stacks[0].StackName' \
    --output text 2>/dev/null || echo "")

if [ -n "$STACK_EXISTS" ]; then
    echo "📋 Stack exists, updating..."
    OPERATION="update"
else
    echo "📋 Stack does not exist, creating..."
    OPERATION="create"
fi

# Deploy stack
echo "📋 Deploying CloudFormation stack..."
aws cloudformation ${OPERATION}-stack \
    --profile "${PROFILE}" \
    --region "${REGION}" \
    --stack-name "${STACK_NAME}" \
    --template-body "file://${TEMPLATE_FILE}" \
    --parameters \
        ParameterKey=InstanceId,ParameterValue="${INSTANCE_ID}" \
        ParameterKey=Region,ParameterValue="${REGION}" \
    --capabilities CAPABILITY_NAMED_IAM \
    --tags \
        Key=Domain,Value="${DOMAIN_NAME}" \
        Key=Purpose,Value="SystemStats" \
        Key=ManagedBy,Value="CloudFormation"

echo ""
echo "⏳ Waiting for stack ${OPERATION} to complete..."
aws cloudformation wait stack-${OPERATION}-complete \
    --profile "${PROFILE}" \
    --region "${REGION}" \
    --stack-name "${STACK_NAME}"

echo ""
echo "=========================================="
echo "✅ Stack ${OPERATION} completed successfully"
echo "=========================================="
echo ""

# Get Lambda function name
LAMBDA_FUNCTION_NAME=$(aws cloudformation describe-stacks \
    --profile "${PROFILE}" \
    --region "${REGION}" \
    --stack-name "${STACK_NAME}" \
    --query 'Stacks[0].Outputs[?OutputKey==`LambdaFunctionName`].OutputValue' \
    --output text 2>/dev/null)

LAMBDA_FUNCTION_ARN=$(aws cloudformation describe-stacks \
    --profile "${PROFILE}" \
    --region "${REGION}" \
    --stack-name "${STACK_NAME}" \
    --query 'Stacks[0].Outputs[?OutputKey==`LambdaFunctionArn`].OutputValue' \
    --output text 2>/dev/null)

echo "Lambda Function Name: ${LAMBDA_FUNCTION_NAME}"
echo "Lambda Function ARN: ${LAMBDA_FUNCTION_ARN}"
echo ""
echo "To get system stats:"
echo "  aws lambda invoke --function-name ${LAMBDA_FUNCTION_NAME} --profile ${PROFILE} --region ${REGION} /tmp/stats.json && cat /tmp/stats.json | jq -r '.body' | jq ."
echo ""
echo "To get formatted stats:"
echo "  aws lambda invoke --function-name ${LAMBDA_FUNCTION_NAME} --profile ${PROFILE} --region ${REGION} /tmp/stats.json && cat /tmp/stats.json | jq -r '.body' | jq -r '.stats' | jq ."
echo ""









