#!/bin/bash

# Exit on error
set -e

# Get the directory where this script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# File paths
IP_FILE="${SCRIPT_DIR}/ec2_ipaddress.txt"
KEY_FILE="${HOME}/.ssh/askdaokapra.com-keypair.pem"

# Check if IP file exists
if [ ! -f "$IP_FILE" ]; then
    echo "Error: IP address file not found at ${IP_FILE}"
    exit 1
fi

# Check if key file exists
if [ ! -f "$KEY_FILE" ]; then
    echo "Error: PEM key file not found at ${KEY_FILE}"
    exit 1
fi

# Read IP address from file
INSTANCE_IP=$(cat "$IP_FILE" | tr -d '\n\r' | xargs)

if [ -z "$INSTANCE_IP" ]; then
    echo "Error: Could not read IP address from ${IP_FILE}"
    exit 1
fi

echo "Instance IP: ${INSTANCE_IP}"

# Set correct permissions for the key file
chmod 400 "$KEY_FILE"

# Verify the key file format
if ! ssh-keygen -l -f "$KEY_FILE" > /dev/null 2>&1; then
    echo "Error: Key file is not in a valid format"
    exit 1
fi

# Create backup directory in the same folder as this script with timestamp
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_DIR="${SCRIPT_DIR}/mailboxes-backup-${TIMESTAMP}"

echo "Creating backup directory: ${BACKUP_DIR}"
mkdir -p "$BACKUP_DIR"

# Test SSH connection first
echo "Testing SSH connection..."
if ! ssh -i "$KEY_FILE" -o StrictHostKeyChecking=no -o ConnectTimeout=10 "ubuntu@${INSTANCE_IP}" "echo 'SSH connection successful'"; then
    echo "Error: Could not establish SSH connection to ubuntu@${INSTANCE_IP}"
    exit 1
fi

# Check if mailboxes directory exists on remote server
echo "Checking if mailboxes directory exists on remote server..."
if ! ssh -i "$KEY_FILE" -o StrictHostKeyChecking=no "ubuntu@${INSTANCE_IP}" "test -d /home/user-data/mail/mailboxes"; then
    echo "Error: /home/user-data/mail/mailboxes directory does not exist on remote server"
    exit 1
fi

# Create temporary script to copy mailboxes with proper permissions
TEMP_DIR=$(mktemp -d)
trap 'rm -rf "$TEMP_DIR"' EXIT

cat > "${TEMP_DIR}/prepare-mailboxes.sh" << 'EOF'
#!/bin/bash
set -e

echo "Preparing mailboxes for download..." >&2

# Create temporary directory for mailboxes
TEMP_MAILBOXES="/tmp/mailboxes-download-$(date +%Y%m%d_%H%M%S)"
sudo mkdir -p "$TEMP_MAILBOXES"

# Copy mailboxes to temp directory with proper permissions
if [ -d "/home/user-data/mail/mailboxes" ]; then
    sudo cp -r /home/user-data/mail/mailboxes/* "$TEMP_MAILBOXES/" 2>/dev/null || true
    sudo chown -R ubuntu:ubuntu "$TEMP_MAILBOXES"
    sudo chmod -R 755 "$TEMP_MAILBOXES"
    echo "Mailboxes prepared at: $TEMP_MAILBOXES" >&2
    echo "$TEMP_MAILBOXES"
else
    echo "Error: /home/user-data/mail/mailboxes directory does not exist" >&2
    exit 1
fi
EOF

chmod +x "${TEMP_DIR}/prepare-mailboxes.sh"

# Copy preparation script to server and execute
echo "Preparing mailboxes for download on remote server..."
scp -i "$KEY_FILE" -o StrictHostKeyChecking=no "${TEMP_DIR}/prepare-mailboxes.sh" "ubuntu@${INSTANCE_IP}:~/"
REMOTE_TEMP_DIR=$(ssh -i "$KEY_FILE" -o StrictHostKeyChecking=no "ubuntu@${INSTANCE_IP}" "~/prepare-mailboxes.sh" | tail -n 1 | tr -d '\n\r' | xargs)

if [ -z "$REMOTE_TEMP_DIR" ]; then
    echo "Error: Failed to prepare mailboxes on remote server"
    exit 1
fi

echo "Remote temporary directory: ${REMOTE_TEMP_DIR}"

# Download mailboxes using rsync from temporary directory
echo "Downloading mailboxes from ubuntu@${INSTANCE_IP}:${REMOTE_TEMP_DIR}/ to ${BACKUP_DIR}/"
echo "This may take a while depending on the size of your mailboxes..."

rsync -avz --progress \
    -e "ssh -i ${KEY_FILE} -o StrictHostKeyChecking=no" \
    "ubuntu@${INSTANCE_IP}:${REMOTE_TEMP_DIR}/" \
    "${BACKUP_DIR}/"

RSYNC_EXIT_CODE=$?

# Clean up temporary directory on remote server (non-critical)
echo "Cleaning up temporary files on remote server..."
if ssh -i "$KEY_FILE" -o StrictHostKeyChecking=no -o ConnectTimeout=10 "ubuntu@${INSTANCE_IP}" "sudo rm -rf ${REMOTE_TEMP_DIR}" 2>/dev/null; then
    echo "Remote cleanup completed successfully"
else
    echo "Warning: Could not clean up remote temporary directory ${REMOTE_TEMP_DIR}"
    echo "This is not critical - the temporary files will be cleaned up automatically on reboot"
fi

if [ $RSYNC_EXIT_CODE -eq 0 ]; then
    echo ""
    echo "SUCCESS: Mailboxes downloaded successfully!"
    echo "Backup location: ${BACKUP_DIR}"
    echo "Backup completed at: $(date)"
    
    # Verify the backup directory exists and has content
    if [ -d "${BACKUP_DIR}" ] && [ "$(ls -A "${BACKUP_DIR}")" ]; then
        echo ""
        echo "Backup verification:"
        echo "✓ Backup directory exists and contains data"
        
        # Display summary of downloaded content
        echo ""
        echo "Backup summary:"
        du -sh "${BACKUP_DIR}"
        echo "Number of files/directories:"
        find "${BACKUP_DIR}" -type f | wc -l | xargs echo "Files:"
        find "${BACKUP_DIR}" -type d | wc -l | xargs echo "Directories:"
        
        echo ""
        echo "You can find your mailboxes backup at:"
        echo "${BACKUP_DIR}"
    else
        echo ""
        echo "ERROR: Backup directory is empty or missing!"
        echo "Expected location: ${BACKUP_DIR}"
        exit 1
    fi
else
    echo "Error: Failed to download mailboxes (rsync exit code: ${RSYNC_EXIT_CODE})"
    exit 1
fi 