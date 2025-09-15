#!/usr/bin/env bash
set -Eeuo pipefail

# Master Download Mailboxes Script
# Downloads mailboxes from any mail server subproject
# Usage: ./administration/master-download-mailboxes.sh <domain> [backup-name]

# Default domain name
DEFAULT_DOMAIN="askdaokapra.com"

# Check if domain name was provided as first argument, otherwise use default
DOMAIN_NAME=${1:-$DEFAULT_DOMAIN}
BACKUP_NAME=${2:-""}

# Create stack name from domain
STACK_NAME=$(echo "${DOMAIN_NAME}" | sed 's/\./-/g')-mailserver
REGION="us-east-1"

echo "Master Download Mailboxes Script"
echo "Domain: ${DOMAIN_NAME}"
echo "Stack: ${STACK_NAME}"
echo "Region: ${REGION}"
echo "----------------------------------------"

# Map domain to subproject directory
case "$DOMAIN_NAME" in
  askdaokapra.com)
    SUBPROJECT="askdaokapra"
    ;;
  emcnotary.com)
    SUBPROJECT="emcnotary"
    ;;
  hepefoundation.org)
    SUBPROJECT="hepefoundation"
    ;;
  telassistmd.com)
    SUBPROJECT="telassistmd"
    ;;
  *)
    echo "Error: Unknown domain $DOMAIN_NAME. Supported domains: askdaokapra.com, emcnotary.com, hepefoundation.org, telassistmd.com"
    exit 1
    ;;
esac

# Get the root directory
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# Check if subproject directory exists
if [ ! -d "$ROOT/$SUBPROJECT" ]; then
  echo "Error: Subproject directory $ROOT/$SUBPROJECT not found"
  exit 1
fi

# Determine script directory based on subproject
if [ "$SUBPROJECT" = "hepefoundation" ]; then
  SCRIPT_DIR="$ROOT/$SUBPROJECT/hepeFoundation-Mail-Server-Files"
else
  SCRIPT_DIR="$ROOT/$SUBPROJECT"
fi

if [ ! -d "$SCRIPT_DIR" ]; then
  echo "Error: Script directory $SCRIPT_DIR not found"
  exit 1
fi

# Check if download script exists
if [ ! -f "$SCRIPT_DIR/download-mailboxes.sh" ]; then
  echo "Error: download-mailboxes.sh not found in $SCRIPT_DIR"
  exit 1
fi

# Check if IP file exists
IP_FILE="$SCRIPT_DIR/ec2_ipaddress.txt"
if [ ! -f "$IP_FILE" ]; then
  echo "Error: IP address file not found at ${IP_FILE}"
  echo "Please run the deployment first to create the IP file"
  exit 1
fi

# Get instance IP
INSTANCE_IP=$(cat "$IP_FILE" | tr -d '\n\r' | xargs)
if [ -z "$INSTANCE_IP" ]; then
  echo "Error: Could not read IP address from ${IP_FILE}"
  exit 1
fi

echo "Instance IP: ${INSTANCE_IP}"

# Create backup directory name
if [ -n "$BACKUP_NAME" ]; then
  BACKUP_DIR="$SCRIPT_DIR/mailboxes-backup-${BACKUP_NAME}"
else
  TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
  BACKUP_DIR="$SCRIPT_DIR/mailboxes-backup-${TIMESTAMP}"
fi

echo "Backup directory: ${BACKUP_DIR}"

# Create backup directory
echo "Creating backup directory..."
mkdir -p "$BACKUP_DIR"

# Set up key file path
KEY_FILE="${HOME}/.ssh/${DOMAIN_NAME}-keypair.pem"

# Check if key file exists
if [ ! -f "$KEY_FILE" ]; then
  echo "Error: PEM key file not found at ${KEY_FILE}"
  echo "Please run setup-ssh-access.sh first to retrieve the key"
  exit 1
fi

# Set correct permissions for the key file
chmod 400 "$KEY_FILE"

# Verify the key file format
if ! ssh-keygen -l -f "$KEY_FILE" > /dev/null 2>&1; then
  echo "Error: Key file is not in a valid format"
  exit 1
fi

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
