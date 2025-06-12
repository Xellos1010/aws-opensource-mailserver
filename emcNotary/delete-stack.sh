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
echo "Stack name: ${STACK_NAME}"

# Empty the backup bucket
echo "Emptying backup bucket: ${DOMAIN_NAME}-backup"
aws s3 rm "s3://${DOMAIN_NAME}-backup" \
    --profile hepe-admin-mfa \
    --recursive

# Empty the nextcloud bucket
echo "Emptying nextcloud bucket: ${DOMAIN_NAME}-nextcloud"
aws s3 rm "s3://${DOMAIN_NAME}-nextcloud" \
    --profile hepe-admin-mfa \
    --recursive

# Delete the CloudFormation stack
echo "Initiating stack deletion..."
aws cloudformation delete-stack \
    --profile hepe-admin-mfa \
    --stack-name "${STACK_NAME}"

echo "Stack deletion initiated. You can monitor the deletion progress using the describe-stack.sh script." 