#!/bin/bash

# Exit on error
set -e

# Default domain name
DEFAULT_DOMAIN="askdaokapra.com"

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

echo "Finalizing mailbox upload for domain: ${DOMAIN_NAME}"
echo "Stack name: ${STACK_NAME}"
echo "Region: ${REGION}"

# Check if AWS CLI is installed
if ! command -v aws &> /dev/null; then
    echo "Error: AWS CLI is not installed"
    exit 1
fi

# Get stack outputs
echo "Retrieving stack outputs..."
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

# Get instance information
INSTANCE_ID=$(aws cloudformation describe-stacks \
    --profile hepe-admin-mfa \
    --region "${REGION}" \
    --stack-name "${STACK_NAME}" \
    --query 'Stacks[0].Outputs[?OutputKey==`RestorePrefix`].OutputValue' \
    --output text)

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

# Get KeyPairId from stack outputs
KEY_PAIR_ID=$(echo "$STACK_OUTPUTS" | jq -r '.[] | select(.OutputKey=="KeyPairId") | .OutputValue')

if [ -z "$KEY_PAIR_ID" ]; then
    echo "Error: Could not retrieve KeyPairId from stack outputs"
    exit 1
fi

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

# Test SSH connection with retries
echo "Testing SSH connection to server..."
MAX_RETRIES=5
RETRY_COUNT=0

while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
    if ssh -i "$KEY_FILE" -o StrictHostKeyChecking=no -o ConnectTimeout=15 "ubuntu@${INSTANCE_IP}" "echo 'SSH connection successful'" 2>/dev/null; then
        echo "SSH connection established successfully"
        break
    else
        RETRY_COUNT=$((RETRY_COUNT + 1))
        echo "SSH connection failed (attempt $RETRY_COUNT/$MAX_RETRIES)"
        if [ $RETRY_COUNT -lt $MAX_RETRIES ]; then
            echo "Waiting 10 seconds before retry..."
            sleep 10
        else
            echo "Error: Could not establish SSH connection to ubuntu@${INSTANCE_IP} after $MAX_RETRIES attempts"
            echo "Please check if the server is running and accessible"
            exit 1
        fi
    fi
done

# Check if uploaded files exist
echo "Checking if uploaded mailboxes exist..."
if ! ssh -i "$KEY_FILE" -o StrictHostKeyChecking=no "ubuntu@${INSTANCE_IP}" "test -d /tmp/mailboxes-upload && [ \"\$(ls -A /tmp/mailboxes-upload)\" ]" 2>/dev/null; then
    echo "Error: No uploaded mailboxes found in /tmp/mailboxes-upload/"
    echo "Please run upload-mailboxes.sh first to upload your mailboxes"
    exit 1
fi

echo "Found uploaded mailboxes, proceeding with finalization..."

# Create temporary directory for scripts
TEMP_DIR=$(mktemp -d)
trap 'rm -rf "$TEMP_DIR"' EXIT

# Create script to finalize the upload
cat > "${TEMP_DIR}/finalize-upload.sh" << 'EOF'
#!/bin/bash
set -e

echo "Finalizing mailbox upload..."

# Check if upload directory exists
if [ ! -d "/tmp/mailboxes-upload" ]; then
    echo "Error: Upload directory /tmp/mailboxes-upload does not exist"
    exit 1
fi

# Check if upload directory has content  
if [ -z "$(ls -A /tmp/mailboxes-upload)" ]; then
    echo "Error: Upload directory /tmp/mailboxes-upload is empty"
    exit 1
fi

# Create mailboxes directory if it doesn't exist
sudo mkdir -p /home/user-data/mail/mailboxes

# Move uploaded files to proper location with correct ownership
echo "Moving mailboxes to final location..."
# Use find to handle hidden files and complex directory structures
sudo find /tmp/mailboxes-upload -mindepth 1 -maxdepth 1 -exec mv {} /home/user-data/mail/mailboxes/ \;

# Set correct ownership and permissions
echo "Setting ownership and permissions..."
sudo chown -R mail:mail /home/user-data/mail/mailboxes
sudo chmod -R 755 /home/user-data/mail/mailboxes

# Clean up temporary upload directory
echo "Cleaning up temporary files..."
sudo rm -rf /tmp/mailboxes-upload

# Restart mail services
echo "Restarting mail services..."
sudo service postfix start 2>/dev/null || echo "Warning: Could not start postfix"
sudo service dovecot start 2>/dev/null || echo "Warning: Could not start dovecot"

echo "Mailbox upload finalization completed successfully!"
echo "Mail services have been restarted."

# Show summary
echo ""
echo "Summary:"
echo "- Mailboxes moved to: /home/user-data/mail/mailboxes/"
echo "- Ownership set to: mail:mail"
echo "- Permissions set to: 755"
echo "- Temporary files cleaned up"
echo "- Mail services restarted"
EOF

chmod +x "${TEMP_DIR}/finalize-upload.sh"

# Copy finalization script and execute
echo "Copying finalization script to server..."
scp -i "$KEY_FILE" -o StrictHostKeyChecking=no "${TEMP_DIR}/finalize-upload.sh" "ubuntu@${INSTANCE_IP}:~/"

echo "Executing finalization script..."
ssh -i "$KEY_FILE" -o StrictHostKeyChecking=no "ubuntu@${INSTANCE_IP}" "~/finalize-upload.sh"

echo ""
echo "✅ Mailbox upload finalization completed successfully!"
echo "Upload finalized at: $(date)"
echo "Server: ubuntu@${INSTANCE_IP}"
echo ""
echo "Your mail server should now have all your previous mailboxes."
echo "You can test email functionality to ensure everything is working correctly." 