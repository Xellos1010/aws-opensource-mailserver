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

# Deploy the CloudFormation stack for emcnotary infrastructure
aws cloudformation deploy \
    --profile hepe-admin-mfa \
    --template-file mailserver-infrastructure-mvp.yaml \
    --stack-name "${STACK_NAME}" \
    --capabilities CAPABILITY_NAMED_IAM \
    --parameter-overrides DomainName="${DOMAIN_NAME}"

echo "Stack deployment initiated with name: ${STACK_NAME}"
echo "You can monitor the deployment progress using the describe-stack.sh script." 