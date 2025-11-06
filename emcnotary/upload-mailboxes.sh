#!/bin/bash

# Exit on error
set -e

# Default domain name
DEFAULT_DOMAIN="emcnotary.com"

# Check if domain name was provided as first argument, otherwise use default
DOMAIN_NAME=${1:-$DEFAULT_DOMAIN}
BACKUP_DIR_INPUT=${2:-""}

# Validate domain name format
if ! [[ $DOMAIN_NAME =~ ^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$ ]]; then
    echo "Error: Invalid domain name format. Must match pattern: ^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$"
    echo "Example: example.com"
    exit 1
fi

# Create stack name from domain
STACK_NAME=$(echo "${DOMAIN_NAME}" | sed 's/\./-/g')-mailserver
REGION="us-east-1"  # Adjust if your stack is in a different region

echo "Uploading mailboxes to new server for domain: ${DOMAIN_NAME}"
echo "Stack name: ${STACK_NAME}"
echo "Region: ${REGION}"

# Check if AWS CLI is installed
if ! command -v aws &> /dev/null; then
    echo "Error: AWS CLI is not installed"
    exit 1
fi

# Determine repository root
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# Resolve backup directory
if [ -n "$BACKUP_DIR_INPUT" ]; then
    BACKUP_DIR="$BACKUP_DIR_INPUT"
else
    # Try to use the latest backup under standardized backups/{domain}/mailboxes
    MAILBOXES_DIR="${ROOT_DIR}/backups/${DOMAIN_NAME}/mailboxes"
    if [ -d "$MAILBOXES_DIR" ]; then
        BACKUP_DIR=$(ls -d "$MAILBOXES_DIR"/mailboxes-backup-* 2>/dev/null | sort -r | head -n 1 || true)
    fi
fi

if [ -z "$BACKUP_DIR" ] || [ ! -d "$BACKUP_DIR" ]; then
    echo "Error: Backup directory not found. Provide it explicitly as the second argument."
    echo "Example: $0 ${DOMAIN_NAME} ${ROOT_DIR}/backups/${DOMAIN_NAME}/mailboxes/mailboxes-backup-YYYYMMDD_HHMMSS"
    exit 1
fi

echo "Using mailboxes backup: ${BACKUP_DIR}"

# Verify backup directory contains data
if [ ! -d "$BACKUP_DIR" ] || [ -z "$(ls -A "$BACKUP_DIR")" ]; then
    echo "Error: Backup directory is empty or does not exist"
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

# Test SSH connection
echo "Testing SSH connection to new server..."
if ! ssh -i "$KEY_FILE" -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o ConnectTimeout=10 "ubuntu@${INSTANCE_IP}" "echo 'SSH connection successful'"; then
    echo "Error: Could not establish SSH connection to ubuntu@${INSTANCE_IP}"
    exit 1
fi

# Create temporary script to prepare the server
TEMP_DIR=$(mktemp -d)
trap 'rm -rf "$TEMP_DIR"' EXIT

cat > "${TEMP_DIR}/prepare-server.sh" << 'EOF'
#!/bin/bash
set -e

echo "Preparing server for mailbox upload..."

# Stop mail services to prevent conflicts
sudo service postfix stop 2>/dev/null || true
sudo service dovecot stop 2>/dev/null || true

# Create backup of existing mailboxes if they exist
if [ -d "/home/user-data/mail/mailboxes" ]; then
    echo "Backing up existing mailboxes..."
    sudo cp -r /home/user-data/mail/mailboxes /home/user-data/mail/mailboxes.backup.$(date +%Y%m%d_%H%M%S)
    sudo rm -rf /home/user-data/mail/mailboxes
fi

# Create mailboxes directory with proper permissions
sudo mkdir -p /home/user-data/mail/mailboxes
sudo chown mail:mail /home/user-data/mail/mailboxes
sudo chmod 755 /home/user-data/mail/mailboxes

echo "Server prepared for mailbox upload"
EOF

chmod +x "${TEMP_DIR}/prepare-server.sh"

# Copy preparation script to server and execute
echo "Preparing the new server..."
scp -i "$KEY_FILE" -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null "${TEMP_DIR}/prepare-server.sh" "ubuntu@${INSTANCE_IP}:~/"
ssh -i "$KEY_FILE" -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null "ubuntu@${INSTANCE_IP}" "~/prepare-server.sh"

# Upload mailboxes using rsync
echo "Uploading mailboxes from ${BACKUP_DIR} to ubuntu@${INSTANCE_IP}:/home/user-data/mail/mailboxes/"
echo "This may take a while depending on the size of your mailboxes..."

rsync -avz --progress \
    -e "ssh -i ${KEY_FILE} -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null" \
    "${BACKUP_DIR}/" \
    "ubuntu@${INSTANCE_IP}:/tmp/mailboxes-upload/"

if [ $? -ne 0 ]; then
    echo "Error: Failed to upload mailboxes"
    exit 1
fi

# Create script to finalize the upload
cat > "${TEMP_DIR}/finalize-upload.sh" << 'EOF'
#!/bin/bash
set -e

echo "Finalizing mailbox upload..."

# Move uploaded files to proper location with correct ownership
# Use find to handle hidden files and complex directory structures
sudo find /tmp/mailboxes-upload -mindepth 1 -maxdepth 1 -exec mv {} /home/user-data/mail/mailboxes/ \;
sudo chown -R mail:mail /home/user-data/mail/mailboxes
sudo chmod -R 755 /home/user-data/mail/mailboxes

# Clean up temporary upload directory
sudo rm -rf /tmp/mailboxes-upload

# Restart mail services
sudo service postfix start
sudo service dovecot start

echo "Mailbox upload completed successfully!"
echo "Mail services have been restarted."
EOF

chmod +x "${TEMP_DIR}/finalize-upload.sh"

# Copy finalization script and execute
echo "Finalizing mailbox upload..."
scp -i "$KEY_FILE" -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null "${TEMP_DIR}/finalize-upload.sh" "ubuntu@${INSTANCE_IP}:~/"
ssh -i "$KEY_FILE" -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null "ubuntu@${INSTANCE_IP}" "~/finalize-upload.sh"

echo ""
echo "Mailboxes uploaded successfully!"
echo "Upload completed at: $(date)"
echo "Source backup: ${BACKUP_DIR}"
echo "Destination server: ubuntu@${INSTANCE_IP}"
echo ""
echo "The mail server should now have all your previous mailboxes."
echo "You may want to test email functionality to ensure everything is working correctly." 