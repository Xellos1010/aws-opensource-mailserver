#!/bin/bash

# Exit on error
set -e

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

# Create stack name from domain
STACK_NAME=$(echo "${DOMAIN_NAME}" | sed 's/\./-/g')-mailserver
REGION="us-east-1"  # Adjust if your stack is in a different region

echo "Retrieving SES configuration settings for domain: ${DOMAIN_NAME}"
echo "Stack name: ${STACK_NAME}"
echo "Region: ${REGION}"

# Check if AWS CLI is installed
if ! command -v aws &> /dev/null; then
    echo "Error: AWS CLI is not installed"
    exit 1
fi

# Check if jq is installed
if ! command -v jq &> /dev/null; then
    echo "Error: jq is not installed"
    exit 1
fi

# Get SMTP credentials from SSM Parameter Store
echo "Retrieving SMTP credentials from SSM Parameter Store..."
SMTP_USERNAME=$(aws ssm get-parameter \
    --profile hepe-admin-mfa \
    --region "${REGION}" \
    --name "/smtp-username-${STACK_NAME}" \
    --with-decryption \
    --query Parameter.Value \
    --output text)

SMTP_PASSWORD=$(aws ssm get-parameter \
    --profile hepe-admin-mfa \
    --region "${REGION}" \
    --name "/smtp-password-${STACK_NAME}" \
    --with-decryption \
    --query Parameter.Value \
    --output text)

if [ -z "$SMTP_USERNAME" ] || [ -z "$SMTP_PASSWORD" ]; then
    echo "Error: Could not retrieve SMTP credentials from SSM Parameter Store"
    exit 1
fi

# Define SES SMTP settings
SMTP_RELAY_HOST="email-smtp.${REGION}.amazonaws.com"
SMTP_RELAY_PORT="587"

# Output configuration settings
echo "SES Configuration Settings for Mail-in-a-Box:"
echo "-------------------------------------------"
echo "SMTP Relay Enable: true"
echo "SMTP Relay Host: ${SMTP_RELAY_HOST}"
echo "SMTP Relay Port: ${SMTP_RELAY_PORT}"
echo "SMTP Relay Username: ${SMTP_USERNAME}"
echo "SMTP Relay Password: ${SMTP_PASSWORD}"
echo "Sender Domain: ${DOMAIN_NAME}"

# Generate MIAB configuration file content
CONFIG_CONTENT="[mail]
smtp_relay_enable = true
smtp_relay_host = ${SMTP_RELAY_HOST}
smtp_relay_port = ${SMTP_RELAY_PORT}
smtp_relay_username = ${SMTP_USERNAME}
smtp_relay_password = ${SMTP_PASSWORD}"

# Save configuration to a temporary file for manual application
TEMP_DIR=$(mktemp -d)
trap 'rm -rf "$TEMP_DIR"' EXIT

CONFIG_FILE="${TEMP_DIR}/mail-config"
echo "$CONFIG_CONTENT" > "$CONFIG_FILE"

echo "-------------------------------------------"
echo "Configuration file content saved to: ${CONFIG_FILE}"
echo "To apply these settings to Mail-in-a-Box:"
echo "1. SSH into your EC2 instance:"
echo "   ssh -i ~/.ssh/${DOMAIN_NAME}-keypair.pem ubuntu@<INSTANCE_IP>"
echo "2. Copy the configuration file to the instance:"
echo "   scp -i ~/.ssh/${DOMAIN_NAME}-keypair.pem ${CONFIG_FILE} ubuntu@<INSTANCE_IP>:~/mail-config"
echo "3. Move the file to the correct location:"
echo "   sudo mv ~/mail-config /home/user-data/mail/config"
echo "4. Restart the MIAB daemon:"
echo "   sudo /opt/mailinabox/management/mailinabox-daemon restart"
echo "5. Verify in the MIAB admin UI (https://box.${DOMAIN_NAME}/admin) under System > System Status Checks."

# Optionally, retrieve instance IP for convenience
INSTANCE_ID=$(aws cloudformation describe-stacks \
    --profile hepe-admin-mfa \
    --region "${REGION}" \
    --stack-name "${STACK_NAME}" \
    --query 'Stacks[0].Outputs[?OutputKey==`RestorePrefix`].OutputValue' \
    --output text 2>/dev/null)

if [ ! -z "$INSTANCE_ID" ]; then
    INSTANCE_IP=$(aws ec2 describe-instances \
        --profile hepe-admin-mfa \
        --region "${REGION}" \
        --instance-ids "${INSTANCE_ID}" \
        --query 'Reservations[0].Instances[0].PublicIpAddress' \
        --output text 2>/dev/null)
    if [ ! -z "$INSTANCE_IP" ]; then
        echo "Instance IP: ${INSTANCE_IP}"
        echo "You can use this IP for SSH/SCP commands above."
    fi
fi

echo "Next steps:"
echo "- Ensure SES DNS records (CNAME, MX, TXT) are set using your previous script."
echo "- Verify domain in SES Console (https://console.aws.amazon.com/ses)."
echo "- Test sending emails from the MIAB webmail (https://box.${DOMAIN_NAME}/mail)."
echo "- If in SES sandbox mode, verify recipient email addresses or request production access."