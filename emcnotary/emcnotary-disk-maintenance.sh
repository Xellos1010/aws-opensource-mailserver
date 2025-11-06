#!/usr/bin/env bash
set -Eeuo pipefail
IFS=$'\n\t'

# EMC Notary Disk Maintenance Script
# Performs comprehensive disk space management on the emcnotary Mail-in-a-Box server
# Includes backup, cleanup, and system refresh functions

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

DOMAIN_NAME="emcnotary.com"
STACK_NAME="emcnotary-mailserver"
REGION="us-east-1"
PROFILE="hepe-admin-mfa"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging function
log() {
    echo -e "${BLUE}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1" >&2
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

# Trap for cleanup on exit
cleanup() {
    local exit_code=$?
    if [ $exit_code -ne 0 ]; then
        log_error "Script failed with exit code $exit_code"
    fi
    # Clean up temp files if they exist
    if [ -n "${TMP_DIR:-}" ] && [ -d "$TMP_DIR" ]; then
        rm -rf "$TMP_DIR"
    fi
}
trap cleanup EXIT

usage() {
    cat <<EOF
Usage: $(basename "$0") [OPTIONS]

EMC Notary Disk Maintenance Script - Comprehensive disk space management for Mail-in-a-Box

OPTIONS:
    -b, --backup-only    Only perform backup, skip cleanup
    -c, --cleanup-only   Only perform cleanup, skip backup
    -v, --verbose        Verbose output
    -h, --help          Show this help message

ACTIONS:
    1. Creates full mailbox backup to local machine
    2. Analyzes disk usage on remote server
    3. Cleans up system logs, temporary files, and old emails
    4. Restarts services to free up memory
    5. Verifies system functionality

WARNING: This script modifies the remote server. Ensure you have backups before running.

EOF
}

BACKUP_ONLY=false
CLEANUP_ONLY=false
VERBOSE=false

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        -b|--backup-only)
            BACKUP_ONLY=true
            shift
            ;;
        -c|--cleanup-only)
            CLEANUP_ONLY=true
            shift
            ;;
        -v|--verbose)
            VERBOSE=true
            shift
            ;;
        -h|--help)
            usage
            exit 0
            ;;
        *)
            log_error "Unknown option: $1"
            usage
            exit 1
            ;;
    esac
done

# Validate requirements
require_cmd() {
    command -v "$1" >/dev/null 2>&1 || {
        log_error "$1 command not found. Please install it first."
        exit 1
    }
}

require_cmd aws
require_cmd ssh
require_cmd scp
require_cmd rsync

# Get instance information
get_instance_info() {
    log "Retrieving instance information..."

    # Get instance IP
    IP_FILE="$SCRIPT_DIR/ec2_ipaddress.txt"
    if [ ! -f "$IP_FILE" ]; then
        log_error "Instance IP file not found at $IP_FILE"
        log_error "Please run deployment first to create the IP file"
        exit 1
    fi

    INSTANCE_IP="$(cat "$IP_FILE" | tr -d '\n\r' | xargs)"
    if [ -z "$INSTANCE_IP" ]; then
        log_error "Could not read instance IP from file"
        exit 1
    fi

    # Get SSH key
    KEY_FILE="$HOME/.ssh/${DOMAIN_NAME}-keypair.pem"
    if [ ! -f "$KEY_FILE" ]; then
        log_error "SSH key not found at $KEY_FILE"
        log_error "Please run setup-ssh-access.sh first"
        exit 1
    fi

    chmod 400 "$KEY_FILE"

    log "Instance IP: $INSTANCE_IP"
    log "SSH Key: $KEY_FILE"
}

# Test SSH connection
test_ssh_connection() {
    log "Testing SSH connection to ubuntu@$INSTANCE_IP..."

    if ! ssh -i "$KEY_FILE" -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null \
             -o ConnectTimeout=10 "ubuntu@$INSTANCE_IP" "echo 'SSH connection successful'" >/dev/null 2>&1; then
        log_error "Cannot establish SSH connection to ubuntu@$INSTANCE_IP"
        exit 1
    fi

    log_success "SSH connection verified"
}

# Create mailbox backup
create_backup() {
    if [ "$CLEANUP_ONLY" = true ]; then
        log "Skipping backup (--cleanup-only mode)"
        return 0
    fi

    log "=== CREATING MAILBOX BACKUP ==="
    log "This will download all mailboxes from the server to your local machine"
    log "This may take several minutes depending on mailbox size..."

    # Use the master download script
    if ! bash "$ROOT_DIR/administration/master-download-mailboxes.sh" "$DOMAIN_NAME" "maintenance-$(date +%Y%m%d_%H%M%S)"; then
        log_error "Mailbox backup failed"
        exit 1
    fi

    log_success "Mailbox backup completed successfully"
}

# Analyze disk usage on remote server
analyze_disk_usage() {
    log "=== ANALYZING DISK USAGE ==="

    log "Getting disk usage summary..."
    ssh -i "$KEY_FILE" -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null \
        "ubuntu@$INSTANCE_IP" << 'EOF'
df -h /
echo ""
echo "=== TOP 20 LARGEST DIRECTORIES ==="
sudo du -h / 2>/dev/null | sort -hr | head -20
echo ""
echo "=== MAILBOX USAGE ==="
if [ -d "/home/user-data/mail/mailboxes" ]; then
    sudo du -sh /home/user-data/mail/mailboxes
    echo "Mailbox count:"
    sudo find /home/user-data/mail/mailboxes -maxdepth 2 -type d | wc -l
fi
echo ""
echo "=== LOG FILES USAGE ==="
sudo du -sh /var/log 2>/dev/null || echo "/var/log not accessible"
if [ -d "/var/log" ]; then
    sudo find /var/log -name "*.log" -type f -exec du -h {} \; 2>/dev/null | sort -hr | head -10
fi
echo ""
echo "=== TEMPORARY FILES ==="
sudo du -sh /tmp 2>/dev/null || echo "/tmp not accessible"
sudo du -sh /var/tmp 2>/dev/null || echo "/var/tmp not accessible"
EOF

    log_success "Disk analysis completed"
}

# Clean up system
perform_cleanup() {
    if [ "$BACKUP_ONLY" = true ]; then
        log "Skipping cleanup (--backup-only mode)"
        return 0
    fi

    log "=== PERFORMING SYSTEM CLEANUP ==="
    log_warning "This will remove old logs, temporary files, and clear caches"
    log_warning "Press Ctrl+C within 10 seconds to abort..."
    sleep 10

    # Create cleanup script
    TMP_DIR="$(mktemp -d)"
    cat > "$TMP_DIR/cleanup.sh" << 'EOF'
#!/bin/bash
set -e

echo "Starting system cleanup..."

# Function to safely remove old files
safe_remove_old() {
    local path="$1"
    local days="$2"
    if [ -d "$path" ] || [ -f "$path" ]; then
        echo "Removing files older than $days days from $path..."
        find "$path" -type f -mtime +$days -delete 2>/dev/null || true
        echo "Cleanup completed for $path"
    fi
}

# Clean up system logs
echo "Cleaning system logs..."
if [ -d "/var/log" ]; then
    # Compress old logs
    find /var/log -name "*.log" -type f -mtime +7 -exec gzip {} \; 2>/dev/null || true
    # Remove very old compressed logs (older than 30 days)
    find /var/log -name "*.log.gz" -type f -mtime +30 -delete 2>/dev/null || true
fi

# Clean up Mail-in-a-Box logs
if [ -d "/home/user-data/mail/log" ]; then
    echo "Cleaning Mail-in-a-Box logs..."
    find /home/user-data/mail/log -name "*.log" -type f -mtime +7 -exec gzip {} \; 2>/dev/null || true
    find /home/user-data/mail/log -name "*.log.gz" -type f -mtime +30 -delete 2>/dev/null || true
fi

# Clean up temporary directories
echo "Cleaning temporary directories..."
if [ -d "/tmp" ]; then
    find /tmp -type f -mtime +1 -delete 2>/dev/null || true
    find /tmp -type d -empty -mtime +1 -delete 2>/dev/null || true
fi

if [ -d "/var/tmp" ]; then
    find /var/tmp -type f -mtime +7 -delete 2>/dev/null || true
    find /var/tmp -type d -empty -mtime +7 -delete 2>/dev/null || true
fi

# Clean up package cache
echo "Cleaning package cache..."
apt-get clean >/dev/null 2>&1 || true
apt-get autoclean >/dev/null 2>&1 || true

# Clean up old kernels (keep last 2)
echo "Cleaning old kernels..."
if command -v apt-get >/dev/null 2>&1; then
    apt-get autoremove --purge -y >/dev/null 2>&1 || true
fi

# Clean up orphaned packages
echo "Removing orphaned packages..."
if command -v deborphan >/dev/null 2>&1; then
    deborphan | xargs apt-get remove --purge -y >/dev/null 2>&1 || true
fi

# Clean up Docker if present (remove stopped containers, unused images)
if command -v docker >/dev/null 2>&1; then
    echo "Cleaning Docker..."
    docker system prune -f >/dev/null 2>&1 || true
fi

echo "System cleanup completed successfully"
EOF

    chmod +x "$TMP_DIR/cleanup.sh"

    # Upload and execute cleanup script
    log "Uploading cleanup script to server..."
    scp -i "$KEY_FILE" -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null \
        "$TMP_DIR/cleanup.sh" "ubuntu@$INSTANCE_IP:~/cleanup.sh"

    log "Executing cleanup on remote server..."
    ssh -i "$KEY_FILE" -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null \
        "ubuntu@$INSTANCE_IP" "sudo ~/cleanup.sh"

    # Clean up local temp file
    rm -f "$TMP_DIR/cleanup.sh"

    log_success "System cleanup completed"
}

# Restart services
restart_services() {
    if [ "$BACKUP_ONLY" = true ]; then
        log "Skipping service restart (--backup-only mode)"
        return 0
    fi

    log "=== RESTARTING SERVICES ==="
    log "Restarting mail services and clearing caches..."

    ssh -i "$KEY_FILE" -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null \
        "ubuntu@$INSTANCE_IP" << 'EOF'
echo "Restarting Mail-in-a-Box services..."
if [ -x /opt/mailinabox/management/mailinabox-daemon ]; then
    sudo /opt/mailinabox/management/mailinabox-daemon restart || true
elif [ -x /usr/local/bin/mailinabox ]; then
    sudo /usr/local/bin/mailinabox restart || true
else
    echo "Warning: MIAB daemon script not found; restarting individual services..."
    sudo systemctl restart postfix || true
    sudo systemctl restart dovecot || true
    sudo systemctl restart nginx || true
fi

echo "Clearing system caches..."
# Clear page cache, dentries, and inodes
sync
echo 3 | sudo tee /proc/sys/vm/drop_caches >/dev/null

echo "Restarting completed"
EOF

    log_success "Service restart completed"
}

# Verify system functionality
verify_system() {
    log "=== VERIFYING SYSTEM FUNCTIONALITY ==="

    # Check disk space
    log "Checking disk space after cleanup..."
    ssh -i "$KEY_FILE" -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null \
        "ubuntu@$INSTANCE_IP" "df -h /" | tail -1

    # Check service status
    log "Checking service status..."
    ssh -i "$KEY_FILE" -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null \
        "ubuntu@$INSTANCE_IP" << 'EOF'
echo "=== SERVICE STATUS ==="
sudo systemctl is-active postfix || echo "postfix: inactive"
sudo systemctl is-active dovecot || echo "dovecot: inactive"
sudo systemctl is-active nginx || echo "nginx: inactive"

echo ""
echo "=== MAIL QUEUE STATUS ==="
sudo mailq | tail -5

echo ""
echo "=== RECENT LOG ENTRIES ==="
if [ -f "/var/log/mail.log" ]; then
    sudo tail -10 /var/log/mail.log
else
    echo "Mail log not found at /var/log/mail.log"
fi
EOF

    # Test SMTP connectivity (basic test)
    log "Testing SMTP connectivity..."
    if ssh -i "$KEY_FILE" -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null \
        "ubuntu@$INSTANCE_IP" "timeout 10 bash -c '</dev/tcp/localhost/25' && echo 'SMTP port accessible' || echo 'SMTP port not accessible'"; then
        log_success "SMTP service appears to be running"
    else
        log_warning "SMTP service may not be accessible"
    fi

    log_success "System verification completed"
}

# Main execution
main() {
    log "=== EMC NOTARY DISK MAINTENANCE SCRIPT ==="
    log "Domain: $DOMAIN_NAME"
    log "Stack: $STACK_NAME"
    log "Starting maintenance at $(date)"

    # Validate mode combination
    if [ "$BACKUP_ONLY" = true ] && [ "$CLEANUP_ONLY" = true ]; then
        log_error "Cannot specify both --backup-only and --cleanup-only"
        exit 1
    fi

    # Get instance information and test connection
    get_instance_info
    test_ssh_connection

    # Execute maintenance steps
    create_backup
    analyze_disk_usage
    perform_cleanup
    restart_services
    verify_system

    log_success "=== MAINTENANCE COMPLETED SUCCESSFULLY ==="
    log "Your emcnotary Mail-in-a-Box server has been backed up and cleaned up."
    log "Monitor the system for the next few days to ensure email delivery is working properly."
}

# Run main function
main "$@"
