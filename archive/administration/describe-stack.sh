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

# Determine repository root and per-domain backup directory
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
STACK_BACKUP_DIR="${ROOT_DIR}/backups/${DOMAIN_NAME}/stack"

# Create per-domain stack backup directory
mkdir -p "${STACK_BACKUP_DIR}"

# Get current timestamp
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")

echo "Using domain name: ${DOMAIN_NAME}"
echo "Stack name: ${STACK_NAME}"

# Log stack resources
echo "Describing stack resources..."
aws cloudformation describe-stacks \
    --profile hepe-admin-mfa \
    --stack-name "${STACK_NAME}" \
    --output json > "${STACK_BACKUP_DIR}/stack_resources_${TIMESTAMP}.json"

echo "Stack resources logged to ${STACK_BACKUP_DIR}/stack_resources_${TIMESTAMP}.json"

# Log stack events
echo -e "\nDescribing stack events..."
aws cloudformation describe-stack-events \
    --profile hepe-admin-mfa \
    --stack-name "${STACK_NAME}" \
    --output json > "${STACK_BACKUP_DIR}/stack_events_${TIMESTAMP}.json"

echo "Stack events logged to ${STACK_BACKUP_DIR}/stack_events_${TIMESTAMP}.json"

# Also display the latest events in the terminal
echo -e "\nLatest stack events:"
aws cloudformation describe-stack-events \
    --profile hepe-admin-mfa \
    --stack-name "${STACK_NAME}" \
    --query 'StackEvents[0:5]' \
    --output table