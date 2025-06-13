#!/bin/bash

# Exit on error
set -e

# Configuration
DOMAIN_NAME=${1:-"emcnotary.com"}
STACK_NAME=$(echo "${DOMAIN_NAME}" | sed 's/\./-/g')-mailserver
REGION="us-east-1"

echo "Cleaning up local key files for stack: ${STACK_NAME}"
echo "Domain: ${DOMAIN_NAME}"
echo "Region: ${REGION}"

# Check if AWS CLI is installed
if ! command -v aws &> /dev/null; then
    echo "Error: AWS CLI is not installed"
    exit 1
fi

# Get instance ID from the stack
INSTANCE_ID=$(aws cloudformation describe-stacks \
    --profile hepe-admin-mfa \
    --stack-name "${STACK_NAME}" \
    --region "${REGION}" \
    --query 'Stacks[0].Outputs[?OutputKey==`RestorePrefix`].OutputValue' \
    --output text)

if [ -z "$INSTANCE_ID" ]; then
    echo "Error: Could not find EC2 instance in the stack"
    exit 1
fi

# Get the actual key pair name from the instance
KEY_PAIR_NAME=$(aws ec2 describe-instances \
    --profile hepe-admin-mfa \
    --region "${REGION}" \
    --instance-ids "${INSTANCE_ID}" \
    --query 'Reservations[0].Instances[0].KeyName' \
    --output text)

if [ -z "$KEY_PAIR_NAME" ]; then
    echo "Error: Could not get key pair name from instance"
    exit 1
fi

echo "Found key pair name: ${KEY_PAIR_NAME}"

# Remove the local key file
KEY_FILE="${HOME}/.ssh/${KEY_PAIR_NAME}.pem"
if [ -f "$KEY_FILE" ]; then
    echo "Removing local key file: ${KEY_FILE}"
    # Force remove even if permissions are incorrect
    rm -f "$KEY_FILE"
    echo "Successfully removed local key file"
else
    echo "Local key file not found: ${KEY_FILE}"
fi

# Clean up known_hosts entries
KNOWN_HOSTS="${HOME}/.ssh/known_hosts"
if [ -f "$KNOWN_HOSTS" ]; then
    echo "Cleaning up known_hosts file..."
    
    # Get instance IP from the stack
    INSTANCE_IP=$(aws cloudformation describe-stacks \
        --profile hepe-admin-mfa \
        --stack-name "${STACK_NAME}" \
        --region "${REGION}" \
        --query 'Stacks[0].Outputs[?OutputKey==`ElasticIPAddress`].OutputValue' \
        --output text)
    
    if [ ! -z "$INSTANCE_IP" ]; then
        # Remove by IP
        ssh-keygen -R "$INSTANCE_IP" 2>/dev/null || true
        echo "Removed instance IP from known_hosts"
        
        # Remove by hostname
        HOSTNAME="${DOMAIN_NAME}"
        ssh-keygen -R "$HOSTNAME" 2>/dev/null || true
        echo "Removed hostname from known_hosts"
        
        # Remove by box subdomain
        BOX_HOSTNAME="box.${DOMAIN_NAME}"
        ssh-keygen -R "$BOX_HOSTNAME" 2>/dev/null || true
        echo "Removed box subdomain from known_hosts"
    fi
fi

# Clean up any temporary key files that might have been created
TEMP_KEY_FILES=(
    "${HOME}/.ssh/${KEY_PAIR_NAME}.pem.tmp"
    "${HOME}/.ssh/${KEY_PAIR_NAME}.tmp"
    "${HOME}/.ssh/${DOMAIN_NAME}-keypair.pem.tmp"
    "${HOME}/.ssh/${DOMAIN_NAME}-keypair.tmp"
)

for temp_file in "${TEMP_KEY_FILES[@]}"; do
    if [ -f "$temp_file" ]; then
        echo "Removing temporary key file: ${temp_file}"
        rm -f "$temp_file"
    fi
done

echo "Local cleanup completed successfully!"
echo "Note: AWS resources (key pairs, instances, etc.) are managed by CloudFormation and were not modified." 