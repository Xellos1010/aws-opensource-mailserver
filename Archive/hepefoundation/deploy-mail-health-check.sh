#!/bin/bash

# Deploy script for hepefoundation.org mail health check Lambda
# This Lambda checks mail service health before allowing restarts

set -Eeuo pipefail
IFS=$'\n\t'

# Default values
DOMAIN_NAME="hepefoundation.org"
STACK_NAME="hepefoundation-org-mail-health-check"
LEGACY_STACK_NAME="hepefoundation-org-mailserver"
REGION="us-east-1"
AWS_PROFILE="hepe-admin-mfa"

echo "Deploying mail health check Lambda for ${DOMAIN_NAME}..."
echo "Stack name: ${STACK_NAME}"
echo "Mail server stack: ${LEGACY_STACK_NAME}"
echo "Region: ${REGION}"
echo "AWS Profile: ${AWS_PROFILE}"
echo "----------------------------------------"

# Get instance ID from legacy stack
echo "Getting instance ID from legacy stack..."
INSTANCE_ID=$(aws cloudformation describe-stacks \
    --profile "${AWS_PROFILE}" \
    --region "${REGION}" \
    --stack-name "${LEGACY_STACK_NAME}" \
    --query 'Stacks[0].Outputs[?OutputKey==`InstanceId`].OutputValue' \
    --output text 2>/dev/null)

if [ -z "$INSTANCE_ID" ] || [ "$INSTANCE_ID" = "None" ]; then
    INSTANCE_ID=$(aws cloudformation describe-stacks \
        --profile "${AWS_PROFILE}" \
        --region "${REGION}" \
        --stack-name "${LEGACY_STACK_NAME}" \
        --query 'Stacks[0].Outputs[?OutputKey==`RestorePrefix`].OutputValue' \
        --output text 2>/dev/null)
fi

if [ -z "$INSTANCE_ID" ] || [ "$INSTANCE_ID" = "None" ]; then
    echo "Error: Could not find instance ID in legacy stack"
    exit 1
fi

echo "✓ Found instance ID: ${INSTANCE_ID}"
echo ""

# Deploy the CloudFormation stack
if ! aws cloudformation deploy \
    --profile "${AWS_PROFILE}" \
    --region "${REGION}" \
    --template-file mail-health-check-lambda.yaml \
    --stack-name "${STACK_NAME}" \
    --capabilities CAPABILITY_NAMED_IAM \
    --parameter-overrides \
        InstanceId="${INSTANCE_ID}" \
        Region="${REGION}"; then
    echo "Error: Stack deployment failed. Check the CloudFormation console for details."
    exit 1
fi

echo "----------------------------------------"
echo "✅ Mail health check Lambda deployed successfully!"
echo "Stack: ${STACK_NAME}"
echo "Lambda Function: mail-health-check-${STACK_NAME}"
echo ""
echo "To test the Lambda:"
echo "  aws lambda invoke \\"
echo "    --function-name mail-health-check-${STACK_NAME} \\"
echo "    --profile ${AWS_PROFILE} \\"
echo "    --region ${REGION} \\"
echo "    response.json"
echo "  cat response.json | jq '.'"


