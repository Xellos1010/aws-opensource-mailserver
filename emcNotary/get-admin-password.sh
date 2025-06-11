#!/bin/bash

# Default domain name
DEFAULT_DOMAIN="emcnotary.com"

# Check if domain name was provided as first argument, otherwise use default
DOMAIN_NAME=${1:-$DEFAULT_DOMAIN}

# Create stack name from domain (remove dots, ensure it starts with a letter, and add a suffix)
STACK_NAME=$(echo "${DOMAIN_NAME}" | sed 's/\./-/g')-mailserver

# Get the admin password from SSM Parameter Store
echo "Retrieving admin password for domain: ${DOMAIN_NAME}"
echo "Stack name: ${STACK_NAME}"

PASSWORD=$(aws ssm get-parameter \
    --profile hepe-admin-mfa \
    --name "/MailInABoxAdminPassword-${STACK_NAME}" \
    --with-decryption \
    --query 'Parameter.Value' \
    --output text)

if [ $? -eq 0 ]; then
    echo -e "\nAdmin credentials for Mail-in-a-Box:"
    echo "Username: admin@${DOMAIN_NAME}"
    echo "Password: ${PASSWORD}"
    echo -e "\nYou can access the admin interface at: https://${DOMAIN_NAME}/admin"
else
    echo "Error: Could not retrieve password. Make sure the stack is deployed and the parameter exists."
    exit 1
fi 