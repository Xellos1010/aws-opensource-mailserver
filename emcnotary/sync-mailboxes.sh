#!/bin/bash

# Exit on error, undefined variables, and pipe failures
set -Eeuo pipefail
IFS=$'\n\t'

# Trap errors to show line numbers
trap 'echo "Error on line $LINENO: $BASH_COMMAND"' ERR

# Domain configuration
DOMAIN_NAME="emcnotary.com"
STACK_NAME="emcnotary-com-mailserver"
REGION="us-east-1"
AWS_PROFILE="hepe-admin-mfa"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

# Script configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TEMP_DIR=$(mktemp -d)
BACKUP_DIR="${ROOT_DIR}/backups/${DOMAIN_NAME}/mailboxes"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")

# Cleanup function
cleanup() {
    if [ -d "$TEMP_DIR" ]; then
        log_info "Cleaning up temporary directory: $TEMP_DIR"
        rm -rf "$TEMP_DIR"
    fi
}
trap cleanup EXIT

# Get instance information
get_instance_info() {
    log_info "Getting instance information for ${DOMAIN_NAME}..."

    # Get stack outputs
    STACK_OUTPUTS=$(aws cloudformation describe-stacks \
        --profile "${AWS_PROFILE}" \
        --region "${REGION}" \
        --stack-name "${STACK_NAME}" \
        --query 'Stacks[0].Outputs' \
        --output json 2>/dev/null)

    if [ $? -ne 0 ] || [ -z "$STACK_OUTPUTS" ]; then
        log_error "Could not retrieve stack outputs for ${STACK_NAME}"
        return 1
    fi

    # Get instance ID
    INSTANCE_ID=$(echo "$STACK_OUTPUTS" | jq -r '.[] | select(.OutputKey=="RestorePrefix") | .OutputValue')

    if [ -z "$INSTANCE_ID" ] || [ "$INSTANCE_ID" = "null" ]; then
        log_error "Could not find EC2 instance ID in the stack outputs"
        return 1
    fi

    # Get instance public IP
    INSTANCE_IP=$(aws ec2 describe-instances \
        --profile "${AWS_PROFILE}" \
        --region "${REGION}" \
        --instance-ids "${INSTANCE_ID}" \
        --query 'Reservations[0].Instances[0].PublicIpAddress' \
        --output text 2>/dev/null)

    if [ -z "$INSTANCE_IP" ]; then
        log_error "Could not get instance IP address"
        return 1
    fi

    # Get instance key pair name
    INSTANCE_KEY_NAME=$(aws ec2 describe-instances \
        --profile "${AWS_PROFILE}" \
        --region "${REGION}" \
        --instance-ids "${INSTANCE_ID}" \
        --query 'Reservations[0].Instances[0].KeyName' \
        --output text 2>/dev/null)

    if [ -z "$INSTANCE_KEY_NAME" ]; then
        log_error "Could not get instance key pair name"
        return 1
    fi

    # Get KeyPairId from stack outputs
    KEY_PAIR_ID=$(echo "$STACK_OUTPUTS" | jq -r '.[] | select(.OutputKey=="KeyPairId") | .OutputValue')

    if [ -z "$KEY_PAIR_ID" ] || [ "$KEY_PAIR_ID" = "null" ]; then
        log_error "Could not retrieve KeyPairId from stack outputs"
        return 1
    fi

    # Setup SSH key
    KEY_FILE="${HOME}/.ssh/${INSTANCE_KEY_NAME}.pem"
    if [ ! -f "$KEY_FILE" ]; then
        log_info "Retrieving private key from SSM Parameter Store..."
        mkdir -p "${HOME}/.ssh"

        aws ssm get-parameter \
            --profile "${AWS_PROFILE}" \
            --region "${REGION}" \
            --name "/ec2/keypair/${KEY_PAIR_ID}" \
            --with-decryption \
            --query 'Parameter.Value' \
            --output text > "${KEY_FILE}"

        if [ $? -ne 0 ]; then
            log_error "Failed to retrieve private key from SSM Parameter Store"
            return 1
        fi

        log_success "Successfully retrieved private key and saved to ${KEY_FILE}"
    fi

    # Set correct permissions for the key file
    chmod 400 "$KEY_FILE"

    # Verify the key file format
    if ! ssh-keygen -l -f "$KEY_FILE" > /dev/null 2>&1; then
        log_error "Key file is not in a valid format"
        return 1
    fi

    # Test SSH connection
    log_info "Testing SSH connection to ${INSTANCE_IP}..."
    if ! ssh -i "$KEY_FILE" -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o ConnectTimeout=10 "ubuntu@${INSTANCE_IP}" "echo 'SSH connection successful'" > /dev/null 2>&1; then
        log_error "Could not establish SSH connection to ubuntu@${INSTANCE_IP}"
        return 1
    fi

    log_success "Connected to instance: ${INSTANCE_ID} (${INSTANCE_IP})"
    return 0
}

# Download current mailboxes from server
download_current_mailboxes() {
    log_info "Downloading current mailboxes from server (this includes your new emails)..."

    # Create download script
    cat > "${TEMP_DIR}/download-current.sh" << 'EOF'
#!/bin/bash
set -e

echo "Preparing to download current mailboxes..."

# Stop mail services to ensure consistency
sudo service postfix stop 2>/dev/null || true
sudo service dovecot stop 2>/dev/null || true

# Create temporary directory for download
TEMP_DOWNLOAD="/tmp/mailboxes-current"
sudo mkdir -p "$TEMP_DOWNLOAD"

# Copy current mailboxes with proper structure
if [ -d "/home/user-data/mail/mailboxes" ]; then
    echo "Copying current mailboxes..."
    sudo cp -r /home/user-data/mail/mailboxes "$TEMP_DOWNLOAD/"
    sudo chown -R ubuntu:ubuntu "$TEMP_DOWNLOAD"
    sudo chmod -R 755 "$TEMP_DOWNLOAD"
    echo "Current mailboxes copied successfully"
else
    echo "No existing mailboxes found on server"
fi

# Restart mail services
sudo service postfix start 2>/dev/null || true
sudo service dovecot start 2>/dev/null || true

echo "Download preparation complete"
EOF

    chmod +x "${TEMP_DIR}/download-current.sh"

    # Copy and execute preparation script
    log_info "Preparing server for download..."
    scp -i "$KEY_FILE" -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null "${TEMP_DIR}/download-current.sh" "ubuntu@${INSTANCE_IP}:~/"
    ssh -i "$KEY_FILE" -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null "ubuntu@${INSTANCE_IP}" "~/download-current.sh"

    # Download current mailboxes
    CURRENT_BACKUP_DIR="${BACKUP_DIR}/current-mailboxes-${TIMESTAMP}"
    mkdir -p "$CURRENT_BACKUP_DIR"

    log_info "Downloading current mailboxes to: ${CURRENT_BACKUP_DIR}"
    rsync -avz --progress \
        -e "ssh -i ${KEY_FILE} -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null" \
        "ubuntu@${INSTANCE_IP}:/tmp/mailboxes-current/" \
        "${CURRENT_BACKUP_DIR}/"

    if [ $? -ne 0 ]; then
        log_error "Failed to download current mailboxes"
        return 1
    fi

    log_success "Current mailboxes downloaded to: ${CURRENT_BACKUP_DIR}"
    return 0
}

# Merge mailboxes
merge_mailboxes() {
    local current_backup="$1"
    local existing_backup="$2"
    local merged_backup="$3"

    log_info "Merging mailboxes..."
    log_info "Current server backup: ${current_backup}"
    log_info "Existing backup: ${existing_backup}"
    log_info "Merged result: ${merged_backup}"

    # Create merged backup directory
    mkdir -p "$merged_backup"

    # Function to merge two maildir directories
    merge_maildir() {
        local src1="$1"
        local src2="$2"
        local dest="$3"

        if [ ! -d "$src1" ] && [ ! -d "$src2" ]; then
            return 0
        fi

        mkdir -p "$dest"

        # Copy from first source if it exists
        if [ -d "$src1" ]; then
            cp -r "$src1"/* "$dest/" 2>/dev/null || true
        fi

        # Copy from second source if it exists, overwriting any duplicates
        if [ -d "$src2" ]; then
            cp -r "$src2"/* "$dest/" 2>/dev/null || true
        fi
    }

    # Merge domain directories
    for domain_dir in "$current_backup" "$existing_backup"; do
        if [ -d "$domain_dir" ]; then
            for domain in "$domain_dir"/*; do
                if [ -d "$domain" ]; then
                    domain_name=$(basename "$domain")
                    merge_maildir "$current_backup/$domain_name" "$existing_backup/$domain_name" "$merged_backup/$domain_name"
                fi
            done
        fi
    done

    log_success "Mailboxes merged successfully"
    return 0
}

# Upload merged mailboxes
upload_merged_mailboxes() {
    local merged_backup="$1"

    log_info "Uploading merged mailboxes to server..."

    # Create upload preparation script
    cat > "${TEMP_DIR}/prepare-upload.sh" << 'EOF'
#!/bin/bash
set -e

echo "Preparing server for merged mailbox upload..."

# Stop mail services to prevent conflicts
sudo service postfix stop 2>/dev/null || true
sudo service dovecot stop 2>/dev/null || true

# Backup existing mailboxes if they exist
if [ -d "/home/user-data/mail/mailboxes" ]; then
    echo "Backing up existing mailboxes before upload..."
    sudo cp -r /home/user-data/mail/mailboxes /home/user-data/mail/mailboxes.backup.$(date +%Y%m%d_%H%M%S)
    sudo rm -rf /home/user-data/mail/mailboxes
fi

# Create mailboxes directory with proper permissions
sudo mkdir -p /home/user-data/mail/mailboxes
sudo chown mail:mail /home/user-data/mail/mailboxes
sudo chmod 755 /home/user-data/mail/mailboxes

echo "Server prepared for merged mailbox upload"
EOF

    chmod +x "${TEMP_DIR}/prepare-upload.sh"

    # Copy and execute preparation script
    log_info "Preparing server for upload..."
    scp -i "$KEY_FILE" -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null "${TEMP_DIR}/prepare-upload.sh" "ubuntu@${INSTANCE_IP}:~/"
    ssh -i "$KEY_FILE" -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null "ubuntu@${INSTANCE_IP}" "~/prepare-upload.sh"

    # Upload merged mailboxes
    log_info "Uploading merged mailboxes (this may take a while)..."
    rsync -avz --progress \
        -e "ssh -i ${KEY_FILE} -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null" \
        "${merged_backup}/" \
        "ubuntu@${INSTANCE_IP}:/tmp/mailboxes-merged/"

    if [ $? -ne 0 ]; then
        log_error "Failed to upload merged mailboxes"
        return 1
    fi

    # Create finalization script
    cat > "${TEMP_DIR}/finalize-merged-upload.sh" << 'EOF'
#!/bin/bash
set -e

echo "Finalizing merged mailbox upload..."

# Move uploaded files to proper location with correct ownership
sudo find /tmp/mailboxes-merged -mindepth 1 -maxdepth 1 -exec mv {} /home/user-data/mail/mailboxes/ \;
sudo chown -R mail:mail /home/user-data/mail/mailboxes
sudo chmod -R 755 /home/user-data/mail/mailboxes

# Clean up temporary upload directory
sudo rm -rf /tmp/mailboxes-merged

# Restart mail services
sudo service postfix start
sudo service dovecot start

echo "Merged mailbox upload completed successfully!"
echo "Mail services have been restarted."
EOF

    chmod +x "${TEMP_DIR}/finalize-merged-upload.sh"

    # Copy and execute finalization script
    log_info "Finalizing upload..."
    scp -i "$KEY_FILE" -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null "${TEMP_DIR}/finalize-merged-upload.sh" "ubuntu@${INSTANCE_IP}:~/"
    ssh -i "$KEY_FILE" -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null "ubuntu@${INSTANCE_IP}" "~/finalize-merged-upload.sh"

    log_success "Merged mailboxes uploaded and synchronized successfully!"
    return 0
}

# Main execution
main() {
    echo "=========================================="
    echo "EMCNotary Mail-in-a-Box Synchronization"
    echo "=========================================="
    echo "Domain: ${DOMAIN_NAME}"
    echo "Time: $(date)"
    echo "=========================================="

    # Check prerequisites
    if ! command -v aws &> /dev/null; then
        log_error "AWS CLI is not installed"
        exit 1
    fi

    if ! command -v jq &> /dev/null; then
        log_error "jq is not installed"
        exit 1
    fi

    if ! command -v rsync &> /dev/null; then
        log_error "rsync is not installed"
        exit 1
    fi

    # Get instance information
    if ! get_instance_info; then
        log_error "Failed to get instance information"
        exit 1
    fi

    # Find existing backup
    EXISTING_BACKUP=$(ls -d "${BACKUP_DIR}/mailboxes-backup-"* 2>/dev/null | sort -r | head -n 1 || true)

    if [ -z "$EXISTING_BACKUP" ]; then
        log_error "No existing backup found in ${BACKUP_DIR}"
        log_error "Available backups:"
        ls -la "${BACKUP_DIR}" || true
        exit 1
    fi

    log_success "Found existing backup: ${EXISTING_BACKUP}"

    # Download current mailboxes
    if ! download_current_mailboxes; then
        log_error "Failed to download current mailboxes"
        exit 1
    fi

    # Find the current backup we just downloaded
    CURRENT_BACKUP=$(ls -d "${BACKUP_DIR}/current-mailboxes-"* 2>/dev/null | sort -r | head -n 1)

    if [ -z "$CURRENT_BACKUP" ]; then
        log_error "Current backup not found after download"
        exit 1
    fi

    # Merge mailboxes
    MERGED_BACKUP="${BACKUP_DIR}/merged-mailboxes-${TIMESTAMP}"
    if ! merge_mailboxes "$CURRENT_BACKUP" "$EXISTING_BACKUP" "$MERGED_BACKUP"; then
        log_error "Failed to merge mailboxes"
        exit 1
    fi

    # Upload merged mailboxes
    if ! upload_merged_mailboxes "$MERGED_BACKUP"; then
        log_error "Failed to upload merged mailboxes"
        exit 1
    fi

    # Summary
    echo ""
    echo "=========================================="
    log_success "SYNCHRONIZATION COMPLETED!"
    echo "=========================================="
    echo "Current server backup: ${CURRENT_BACKUP}"
    echo "Existing backup: ${EXISTING_BACKUP}"
    echo "Merged backup: ${MERGED_BACKUP}"
    echo ""
    echo "Your server now has:"
    echo "✅ All your old emails (from existing backup)"
    echo "✅ All your new emails (from current server)"
    echo "✅ Properly synchronized mail directories"
    echo "✅ Mail services restarted and ready"
    echo ""
    echo "You can test email functionality to ensure everything is working correctly."
    echo "=========================================="
}

# Run main function
main "$@"











