#!/bin/bash

# Exit on error
set -e

# Default domain name
DEFAULT_DOMAIN="emcnotary.com"

# Check if domain name was provided as first argument, otherwise use default
DOMAIN_NAME=${1:-$DEFAULT_DOMAIN}

# Create stack name from domain
STACK_NAME=$(echo "${DOMAIN_NAME}" | sed 's/\./-/g')-mailserver
REGION="us-east-1"  # Adjust if your stack is in a different region

echo "Setting up SSH access for domain: ${DOMAIN_NAME}"
echo "Stack name: ${STACK_NAME}"
echo "Region: ${REGION}"
echo "----------------------------------------"

# Get stack outputs
STACK_OUTPUTS=$(aws cloudformation describe-stacks \
    --profile hepe-admin-mfa \
    --region "${REGION}" \
    --stack-name "${STACK_NAME}" \
    --query 'Stacks[0].Outputs' \
    --output json)

if [ -z "$STACK_OUTPUTS" ]; then
    echo "Error: Could not retrieve stack outputs for ${STACK_NAME}"
    exit 1
fi

# Get KeyPairId from stack outputs
KEY_PAIR_ID=$(echo "$STACK_OUTPUTS" | jq -r '.[] | select(.OutputKey=="KeyPairId") | .OutputValue')

if [ -z "$KEY_PAIR_ID" ]; then
    echo "Error: Could not retrieve KeyPairId from stack outputs"
    exit 1
fi

# Get instance information
INSTANCE_ID=$(echo "$STACK_OUTPUTS" | jq -r '.[] | select(.OutputKey=="RestorePrefix") | .OutputValue')

if [ -z "$INSTANCE_ID" ]; then
    echo "Error: Could not find EC2 instance ID in the stack outputs"
    exit 1
fi

# Get instance public IP
INSTANCE_IP=$(aws ec2 describe-instances \
    --profile hepe-admin-mfa \
    --region "${REGION}" \
    --instance-ids "${INSTANCE_ID}" \
    --query 'Reservations[0].Instances[0].PublicIpAddress' \
    --output text)

if [ -z "$INSTANCE_IP" ]; then
    echo "Error: Could not get instance IP address"
    exit 1
fi

# Get instance key pair name
INSTANCE_KEY_NAME=$(aws ec2 describe-instances \
    --profile hepe-admin-mfa \
    --region "${REGION}" \
    --instance-ids "${INSTANCE_ID}" \
    --query 'Reservations[0].Instances[0].KeyName' \
    --output text)

if [ -z "$INSTANCE_KEY_NAME" ]; then
    echo "Error: Could not get instance key pair name"
    exit 1
fi

echo "Instance ID: ${INSTANCE_ID}"
echo "Instance IP: ${INSTANCE_IP}"
echo "Key Pair: ${INSTANCE_KEY_NAME}"

# Check if key file exists and create directory if needed
KEY_FILE="${HOME}/.ssh/${INSTANCE_KEY_NAME}.pem"
if [ ! -f "$KEY_FILE" ]; then
    echo "Key file not found at ${KEY_FILE}"
    mkdir -p "${HOME}/.ssh"
    
    echo "Retrieving private key from SSM Parameter Store..."
    aws ssm get-parameter \
        --profile hepe-admin-mfa \
        --region "${REGION}" \
        --name "/ec2/keypair/${KEY_PAIR_ID}" \
        --with-decryption \
        --query 'Parameter.Value' \
        --output text > "${KEY_FILE}"
    
    if [ $? -ne 0 ]; then
        echo "Error: Failed to retrieve private key from SSM Parameter Store."
        exit 1
    fi
    
    echo "Successfully retrieved private key and saved to ${KEY_FILE}"
fi

# Set correct permissions for the key file
chmod 400 "$KEY_FILE"

# Verify the key file format
if ! ssh-keygen -l -f "$KEY_FILE" > /dev/null 2>&1; then
    echo "Error: Key file is not in a valid format"
    echo "Please delete the key file and try again:"
    echo "rm ${KEY_FILE}"
    exit 1
fi

# Add host to known_hosts if not already present
KNOWN_HOSTS_FILE="${HOME}/.ssh/known_hosts"
if ! grep -q "${INSTANCE_IP}" "${KNOWN_HOSTS_FILE}" 2>/dev/null; then
    echo "Adding host to known_hosts..."
    ssh-keyscan -H "${INSTANCE_IP}" >> "${KNOWN_HOSTS_FILE}" 2>/dev/null
fi

echo "----------------------------------------"
echo "SSH access has been set up successfully!"
echo
echo "To connect to your instance, use:"
echo "ssh -i ${KEY_FILE} ubuntu@${INSTANCE_IP}"
echo
echo "Or create an SSH config entry by adding these lines to ~/.ssh/config:"
echo "Host ${DOMAIN_NAME}"
echo "    HostName ${INSTANCE_IP}"
echo "    User ubuntu"
echo "    IdentityFile ${KEY_FILE}"
echo "    StrictHostKeyChecking no"
echo
echo "Then you can simply connect using:"
echo "ssh ${DOMAIN_NAME}" 