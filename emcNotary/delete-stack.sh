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

# Get the Elastic IP allocation ID from the stack
echo "Getting Elastic IP allocation ID..."
EIP_ALLOCATION_ID=$(aws ec2 describe-addresses \
    --profile hepe-admin-mfa \
    --filters "Name=tag:MAILSERVER,Values=${DOMAIN_NAME}" \
    --query "Addresses[0].AllocationId" \
    --output text)

if [ ! -z "$EIP_ALLOCATION_ID" ] && [ "$EIP_ALLOCATION_ID" != "None" ]; then
    echo "Found Elastic IP allocation ID: ${EIP_ALLOCATION_ID}"
    
    # Get the association ID
    ASSOCIATION_ID=$(aws ec2 describe-addresses \
        --profile hepe-admin-mfa \
        --allocation-ids "${EIP_ALLOCATION_ID}" \
        --query "Addresses[0].AssociationId" \
        --output text)
    
    if [ ! -z "$ASSOCIATION_ID" ] && [ "$ASSOCIATION_ID" != "None" ]; then
        echo "Disassociating Elastic IP..."
        aws ec2 disassociate-address \
            --profile hepe-admin-mfa \
            --association-id "${ASSOCIATION_ID}" || {
            echo "Failed to disassociate Elastic IP. Continuing..."
        }
    fi
    
    # Remove PTR record if it exists
    echo "Removing PTR record for Elastic IP..."
    aws ec2 modify-address-attribute \
        --profile hepe-admin-mfa \
        --allocation-id "${EIP_ALLOCATION_ID}" \
        --domain-name "" || {
        echo "Failed to remove PTR record. Please check permissions or AWS console."
        exit 1
    }
    
    # Wait for PTR record removal to complete
    echo "Waiting for PTR record removal to complete..."
    MAX_RETRIES=30
    RETRY_COUNT=0
    while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
        PTR_STATUS=$(aws ec2 describe-addresses \
            --profile hepe-admin-mfa \
            --allocation-ids "${EIP_ALLOCATION_ID}" \
            --query "Addresses[0].DomainName" \
            --output text)
        
        if [ -z "$PTR_STATUS" ] || [ "$PTR_STATUS" = "None" ]; then
            echo "PTR record successfully removed"
            break
        fi
        
        echo "PTR record removal still pending... (attempt $((RETRY_COUNT + 1))/$MAX_RETRIES)"
        sleep 10
        RETRY_COUNT=$((RETRY_COUNT + 1))
    done
    
    if [ $RETRY_COUNT -eq $MAX_RETRIES ]; then
        echo "Error: PTR record removal timed out after $MAX_RETRIES attempts"
        exit 1
    fi
    
    # Release the Elastic IP
    echo "Releasing Elastic IP..."
    aws ec2 release-address \
        --profile hepe-admin-mfa \
        --allocation-id "${EIP_ALLOCATION_ID}" || {
        echo "Failed to release Elastic IP. Please check manually."
        exit 1
    }
else
    echo "No Elastic IP found for stack ${STACK_NAME}, skipping EIP release..."
fi

# Empty the backup bucket if it exists
echo "Emptying backup bucket: ${DOMAIN_NAME}-backup"
if aws s3 ls "s3://${DOMAIN_NAME}-backup" --profile hepe-admin-mfa 2>/dev/null; then
    aws s3 rm "s3://${DOMAIN_NAME}-backup" \
        --profile hepe-admin-mfa \
        --recursive || {
        echo "Failed to empty backup bucket. Continuing..."
    }
else
    echo "Backup bucket ${DOMAIN_NAME}-backup does not exist, skipping..."
fi

# Empty the nextcloud bucket if it exists
echo "Emptying nextcloud bucket: ${DOMAIN_NAME}-nextcloud"
if aws s3 ls "s3://${DOMAIN_NAME}-nextcloud" --profile hepe-admin-mfa 2>/dev/null; then
    aws s3 rm "s3://${DOMAIN_NAME}-nextcloud" \
        --profile hepe-admin-mfa \
        --recursive || {
        echo "Failed to empty nextcloud bucket. Continuing..."
    }
else
    echo "Nextcloud bucket ${DOMAIN_NAME}-nextcloud does not exist, skipping..."
fi

# Delete the CloudFormation stack
echo "Initiating stack deletion..."
aws cloudformation delete-stack \
    --profile hepe-admin-mfa \
    --stack-name "${STACK_NAME}" || {
    echo "Failed to initiate stack deletion. Please check CloudFormation console for details."
    exit 1
}

echo "Stack deletion initiated. You can monitor the deletion progress using the describe-stack.sh script."