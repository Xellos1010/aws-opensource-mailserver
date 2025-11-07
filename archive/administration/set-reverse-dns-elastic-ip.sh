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

# Get the Elastic IP address and allocation ID from the stack
echo "Getting Elastic IP address..."
EIP_INFO=$(aws ec2 describe-addresses \
    --profile hepe-admin-mfa \
    --filters "Name=tag:MAILSERVER,Values=${DOMAIN_NAME}" \
    --query "Addresses[0].[PublicIp,AllocationId]" \
    --output text)

if [ -z "$EIP_INFO" ] || [ "$EIP_INFO" = "None" ]; then
    echo "Error: Could not find Elastic IP address for domain ${DOMAIN_NAME}"
    exit 1
fi

# Split the output into IP and allocation ID
read -r EIP_ADDRESS EIP_ALLOCATION_ID <<< "$EIP_INFO"

echo "Found Elastic IP address: ${EIP_ADDRESS}"
echo "Allocation ID: ${EIP_ALLOCATION_ID}"

# Set the reverse DNS record
PTR_RECORD="box.${DOMAIN_NAME}"

echo "Setting reverse DNS record to: ${PTR_RECORD}"
aws ec2 modify-address-attribute \
    --profile hepe-admin-mfa \
    --allocation-id "${EIP_ALLOCATION_ID}" \
    --domain-name "${PTR_RECORD}"

if [ $? -eq 0 ]; then
    echo "Successfully set reverse DNS record for ${EIP_ADDRESS} to ${PTR_RECORD}"
else
    echo "Error: Failed to set reverse DNS record"
    exit 1
fi
