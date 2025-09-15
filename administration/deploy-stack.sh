#!/bin/bash

# Default domain name
DEFAULT_DOMAIN="emcnotary.com"

# Check if domain name was provided as first argument, otherwise use default
DOMAIN_NAME=${1:-$DEFAULT_DOMAIN}

# Validate domain name format
if ! [[ $DOMAIN_NAME =~ ^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$ ]]; then
    echo "Error: Invalid domain name format. Must match pattern: ^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$"
    echo "Example: example.com"
    exit 1
fi

# Create stack name from domain (remove dots, ensure it starts with a letter, and add a suffix)
STACK_NAME=$(echo "${DOMAIN_NAME}" | sed 's/\./-/g')-mailserver

echo "Using domain name: ${DOMAIN_NAME}"
echo "Stack will be created with name: ${STACK_NAME}"

# Check if stack exists and its status
STACK_STATUS=$(aws cloudformation describe-stacks \
    --profile hepe-admin-mfa \
    --stack-name "${STACK_NAME}" \
    --query 'Stacks[0].StackStatus' \
    --output text 2>/dev/null || echo "STACK_NOT_FOUND")

if [ "$STACK_STATUS" = "DELETE_IN_PROGRESS" ]; then
    echo "Error: Stack ${STACK_NAME} is currently being deleted. Please wait for deletion to complete before deploying again."
    exit 1
elif [ "$STACK_STATUS" = "STACK_NOT_FOUND" ]; then
    echo "Stack ${STACK_NAME} does not exist. Proceeding with deployment..."
else
    echo "Stack ${STACK_NAME} exists with status: ${STACK_STATUS}"
fi

# Deploy the CloudFormation stack for mailserver infrastructure
if ! aws cloudformation deploy \
    --profile hepe-admin-mfa \
    --template-file ../mailserver-infrastructure-mvp.yaml \
    --stack-name "${STACK_NAME}" \
    --capabilities CAPABILITY_NAMED_IAM \
    --parameter-overrides DomainName="${DOMAIN_NAME}"; then
    echo "Error: Stack deployment failed. Check the CloudFormation console for details."
    exit 1
fi

echo "Stack deployment initiated with name: ${STACK_NAME}"
echo "You can monitor the deployment progress using the describe-stack.sh script." 