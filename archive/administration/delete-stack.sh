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
    PTR_REMOVAL_ATTEMPTED=false
    
    # Check if PTR record exists before attempting removal
    CURRENT_PTR=$(aws ec2 describe-addresses \
        --profile hepe-admin-mfa \
        --allocation-ids "${EIP_ALLOCATION_ID}" \
        --query "Addresses[0].PtrRecord" \
        --output text)
    
    if [ "$CURRENT_PTR" != "None" ] && [ ! -z "$CURRENT_PTR" ]; then
        echo "Found PTR record: ${CURRENT_PTR}, removing..."
        aws ec2 reset-address-attribute \
            --profile hepe-admin-mfa \
            --allocation-id "${EIP_ALLOCATION_ID}" \
            --attribute domain-name 2>/dev/null && {
            PTR_REMOVAL_ATTEMPTED=true
            echo "PTR record removal initiated successfully"
        } || {
            echo "Failed to initiate PTR record removal. Please check permissions or AWS console."
            exit 1
        }
    else
        echo "No PTR record found, skipping removal..."
    fi
    
    # Wait for PTR record removal to complete if we attempted removal
    if [ "$PTR_REMOVAL_ATTEMPTED" = true ]; then
        echo "Waiting for PTR record removal to complete..."
        MAX_RETRIES=60  # Increased to 10 minutes (60 * 10 seconds)
        RETRY_COUNT=0
        
        while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
            PTR_STATUS=$(aws ec2 describe-addresses \
                --profile hepe-admin-mfa \
                --allocation-ids "${EIP_ALLOCATION_ID}" \
                --query "Addresses[0].PtrRecordUpdate.Status" \
                --output text 2>/dev/null)
            
            if [ "$PTR_STATUS" = "None" ] || [ "$PTR_STATUS" = "COMPLETED" ] || [ "$PTR_STATUS" = "SUCCESS" ]; then
                echo "PTR record removal completed successfully"
                break
            elif [ "$PTR_STATUS" = "PENDING" ]; then
                echo "PTR record removal still pending... (attempt $((RETRY_COUNT + 1))/$MAX_RETRIES)"
                sleep 10
                RETRY_COUNT=$((RETRY_COUNT + 1))
            else
                echo "PTR record removal failed with status: ${PTR_STATUS}"
                break
            fi
        done
        
        if [ $RETRY_COUNT -eq $MAX_RETRIES ]; then
            echo "Error: PTR record removal timed out after $MAX_RETRIES attempts"
            echo "You may need to wait longer or check the AWS console manually"
            exit 1
        fi
    fi
    
    # Release the Elastic IP with retry logic
    echo "Releasing Elastic IP..."
    MAX_RETRIES=10
    RETRY_COUNT=0
    
    while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
        if aws ec2 release-address \
            --profile hepe-admin-mfa \
            --allocation-id "${EIP_ALLOCATION_ID}" 2>/dev/null; then
            echo "Elastic IP released successfully"
            break
        else
            RETRY_COUNT=$((RETRY_COUNT + 1))
            echo "Failed to release Elastic IP (attempt $RETRY_COUNT/$MAX_RETRIES)"
            
            if [ $RETRY_COUNT -lt $MAX_RETRIES ]; then
                echo "Waiting 30 seconds before retry..."
                sleep 30
            else
                echo "Error: Failed to release Elastic IP after $MAX_RETRIES attempts"
                echo "Please check the AWS console manually for the Elastic IP: ${EIP_ALLOCATION_ID}"
                exit 1
            fi
        fi
    done
else
    echo "No Elastic IP found for stack ${STACK_NAME}, skipping EIP release..."
fi

# Empty the backup bucket if it exists
echo "Emptying backup bucket: ${DOMAIN_NAME}-backup"
if aws s3 ls "s3://${DOMAIN_NAME}-backup" --profile hepe-admin-mfa 2>/dev/null; then
    MAX_RETRIES=5
    RETRY_COUNT=0
    
    while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
        if aws s3 rm "s3://${DOMAIN_NAME}-backup" \
            --profile hepe-admin-mfa \
            --recursive 2>/dev/null; then
            echo "Backup bucket emptied successfully"
            break
        else
            RETRY_COUNT=$((RETRY_COUNT + 1))
            echo "Failed to empty backup bucket (attempt $RETRY_COUNT/$MAX_RETRIES)"
            
            if [ $RETRY_COUNT -lt $MAX_RETRIES ]; then
                echo "Waiting 10 seconds before retry..."
                sleep 10
            else
                echo "Warning: Failed to empty backup bucket after $MAX_RETRIES attempts. Continuing..."
            fi
        fi
    done
else
    echo "Backup bucket ${DOMAIN_NAME}-backup does not exist, skipping..."
fi

# Empty the nextcloud bucket if it exists
echo "Emptying nextcloud bucket: ${DOMAIN_NAME}-nextcloud"
if aws s3 ls "s3://${DOMAIN_NAME}-nextcloud" --profile hepe-admin-mfa 2>/dev/null; then
    MAX_RETRIES=5
    RETRY_COUNT=0
    
    while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
        if aws s3 rm "s3://${DOMAIN_NAME}-nextcloud" \
            --profile hepe-admin-mfa \
            --recursive 2>/dev/null; then
            echo "Nextcloud bucket emptied successfully"
            break
        else
            RETRY_COUNT=$((RETRY_COUNT + 1))
            echo "Failed to empty nextcloud bucket (attempt $RETRY_COUNT/$MAX_RETRIES)"
            
            if [ $RETRY_COUNT -lt $MAX_RETRIES ]; then
                echo "Waiting 10 seconds before retry..."
                sleep 10
            else
                echo "Warning: Failed to empty nextcloud bucket after $MAX_RETRIES attempts. Continuing..."
            fi
        fi
    done
else
    echo "Nextcloud bucket ${DOMAIN_NAME}-nextcloud does not exist, skipping..."
fi

# Delete the CloudFormation stack with retry logic
echo "Initiating stack deletion..."
MAX_RETRIES=5
RETRY_COUNT=0

while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
    if aws cloudformation delete-stack \
        --profile hepe-admin-mfa \
        --stack-name "${STACK_NAME}" 2>/dev/null; then
        echo "Stack deletion initiated successfully"
        break
    else
        RETRY_COUNT=$((RETRY_COUNT + 1))
        echo "Failed to initiate stack deletion (attempt $RETRY_COUNT/$MAX_RETRIES)"
        
        if [ $RETRY_COUNT -lt $MAX_RETRIES ]; then
            echo "Waiting 15 seconds before retry..."
            sleep 15
        else
            echo "Error: Failed to initiate stack deletion after $MAX_RETRIES attempts"
            echo "Please check CloudFormation console for details: ${STACK_NAME}"
            exit 1
        fi
    fi
done

echo "Stack deletion initiated successfully. You can monitor the deletion progress using the describe-stack.sh script."