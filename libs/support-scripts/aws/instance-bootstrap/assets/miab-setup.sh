#!/bin/bash -xe

# Mail-in-a-Box bootstrap script (idempotent, SSM-executable)
# This script can be run multiple times safely - it checks for existing state before making changes

# Required environment variables (set by bootstrap runner):
# DOMAIN_NAME, INSTANCE_DNS, REGION, STACK_NAME, BACKUP_BUCKET, NEXTCLOUD_BUCKET
# Optional: EIP_ALLOCATION_ID, SES_IDENTITY_ARN, RESTORE_PREFIX, REBOOT_AFTER_SETUP

LOGFILE="/var/log/mailinabox_setup.log"
# Setup logging - use a function to handle both file and syslog
log_and_echo() {
  echo "$@" | tee -a "$LOGFILE" | logger -t mailinabox_setup
}

# Redirect stdout and stderr to log file, also send to syslog via function
exec > >(while IFS= read -r line; do echo "$line" | tee -a "$LOGFILE" | logger -t mailinabox_setup; done) 2>&1 || {
  # Fallback if process substitution doesn't work: simple redirection
  exec >> "$LOGFILE" 2>&1
  logger -t mailinabox_setup "Starting Mail-in-a-Box bootstrap (fallback logging)"
}

echo "=========================================="
echo "MIAB Bootstrap Script"
echo "Started at: $(date)"
echo "Domain: ${DOMAIN_NAME}"
echo "Instance DNS: ${INSTANCE_DNS}.${DOMAIN_NAME}"
echo "=========================================="

# ==========================================
# AWS CLI Installation (idempotent - do this early)
# ==========================================
if ! command -v aws >/dev/null 2>&1; then
  echo "Installing AWS CLI..."
  apt-get update -qq
  apt-get install -y jq curl unzip
  curl -sSL "https://awscli.amazonaws.com/awscli-exe-linux-$(uname -m).zip" -o /tmp/awscliv2.zip
  unzip -q /tmp/awscliv2.zip -d /tmp && /tmp/aws/install
  rm -rf /tmp/awscliv2.zip /tmp/aws
else
  echo "AWS CLI already installed"
fi

# Resolve Elastic IP from AllocationId (works even if EIP not yet attached)
ELASTIC_IP=""
if [[ -n "${EIP_ALLOCATION_ID:-}" ]]; then
  echo "Resolving Elastic IP from AllocationId: ${EIP_ALLOCATION_ID}"
  ELASTIC_IP=$(aws ec2 describe-addresses --allocation-ids "${EIP_ALLOCATION_ID}" --region "${REGION}" \
    --query 'Addresses[0].PublicIp' --output text 2>/dev/null || echo "")
fi

# Fallback to current public IP if EIP not resolved yet
PUBLIC_IP=${ELASTIC_IP:-$(curl -s http://169.254.169.254/latest/meta-data/public-ipv4 2>/dev/null || echo "")}
PRIVATE_IP=$(curl -s http://169.254.169.254/latest/meta-data/local-ipv4 2>/dev/null || echo "")

echo "Public IP: ${PUBLIC_IP}"
echo "Private IP: ${PRIVATE_IP}"

# Set MIAB environment variables
export NONINTERACTIVE=1
export DEBIAN_FRONTEND=noninteractive
export TERM=xterm
export SKIP_NETWORK_CHECKS=true
export STORAGE_ROOT=/home/user-data
export STORAGE_USER=user-data
export PRIMARY_HOSTNAME="${INSTANCE_DNS}.${DOMAIN_NAME}"
export DEFAULT_PRIMARY_HOSTNAME="${PRIMARY_HOSTNAME}"
export DEFAULT_PUBLIC_IP="${PUBLIC_IP}"

# ==========================================
# Stage 0: Preflight Configuration (CRITICAL - BEFORE MIAB)
# ==========================================
# These operations MUST happen before MIAB installer runs to avoid:
# - sudo: unable to resolve host errors
# - Postfix DNS resolution failures
# - fail2ban startup failures due to missing log files
PREFLIGHT_MARKER="/root/.preflight_complete"
if [ ! -f "${PREFLIGHT_MARKER}" ]; then
  echo "=========================================="
  echo "Stage 0: Preflight Configuration"
  echo "=========================================="

  # 0.1 - Set hostname before anything else
  echo "Setting hostname to ${PRIMARY_HOSTNAME}..."
  hostnamectl set-hostname "${PRIMARY_HOSTNAME}" || hostname "${PRIMARY_HOSTNAME}"

  # 0.2 - Add /etc/hosts entry (CRITICAL - before MIAB)
  # This prevents "sudo: unable to resolve host" and Postfix DNS errors
  if ! grep -q "${PRIMARY_HOSTNAME}" /etc/hosts; then
    echo "Adding ${PRIMARY_HOSTNAME} to /etc/hosts..."
    echo "127.0.0.1 ${PRIMARY_HOSTNAME}" >> /etc/hosts
    echo "::1 ${PRIMARY_HOSTNAME}" >> /etc/hosts
  else
    echo "/etc/hosts already contains ${PRIMARY_HOSTNAME}"
  fi

  # 0.3 - Validate hostname resolves
  if getent hosts "${PRIMARY_HOSTNAME}" >/dev/null 2>&1; then
    echo "Hostname ${PRIMARY_HOSTNAME} resolves correctly"
  else
    echo "WARNING: ${PRIMARY_HOSTNAME} does not resolve, forcing /etc/hosts..."
    echo "127.0.0.1 ${PRIMARY_HOSTNAME}" >> /etc/hosts
  fi

  # 0.4 - Pre-create munin log to prevent fail2ban failure
  # fail2ban's miab-munin jail fails if /var/log/munin/munin-node.log doesn't exist
  echo "Pre-creating munin directories and log files..."
  mkdir -p /var/log/munin
  touch /var/log/munin/munin-node.log
  chmod 640 /var/log/munin/munin-node.log

  touch "${PREFLIGHT_MARKER}"
  echo "Preflight configuration complete"
else
  echo "Preflight already completed (marker exists)"
  # Re-verify /etc/hosts on rerun (in case of reboot or manual cleanup)
  if ! grep -q "${PRIMARY_HOSTNAME}" /etc/hosts; then
    echo "Re-adding ${PRIMARY_HOSTNAME} to /etc/hosts..."
    echo "127.0.0.1 ${PRIMARY_HOSTNAME}" >> /etc/hosts
  fi
fi

# ==========================================
# System Updates & Prerequisites (idempotent)
# ==========================================
PACKAGES_MARKER="/root/.miab_packages_installed"
if [ -f "${PACKAGES_MARKER}" ]; then
  echo "System packages already installed (marker file exists)"
  echo "Skipping package installation to avoid duplicate operations"
else
  echo "Updating system packages..."
  apt-get update -qq

  # Check if upgrade is needed (idempotent)
  if [ -z "$(apt list --upgradable 2>/dev/null | grep -v 'Listing...')" ]; then
    echo "System packages are up to date"
  else
    echo "Upgrading system packages..."
    DEBIAN_FRONTEND=noninteractive apt-get upgrade -o DPkg::Lock::Timeout=120 -y -qq
  fi

  # Install required packages (idempotent - apt handles duplicates)
  echo "Installing prerequisites..."
  apt-get install -y dialog librsync-dev python3-setuptools python3-pip python3-boto3 unzip intltool python-is-python3 git

  # CloudFormation helpers (optional, harmless if not used)
  if ! python3 -c "import cfnbootstrap" 2>/dev/null; then
    pip3 install https://s3.amazonaws.com/cloudformation-examples/aws-cfn-bootstrap-py3-latest.tar.gz || true
  fi
  
  # Mark packages as installed
  touch "${PACKAGES_MARKER}"
fi

# ==========================================
# Swap File (idempotent)
# ==========================================
SWAP_SIZE="${SWAP_SIZE_GIB:-2}G"
if ! swapon --summary | grep -q '/swapfile'; then
  echo "Creating swap file (${SWAP_SIZE})..."
  fallocate -l "${SWAP_SIZE}" /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  if ! grep -q '/swapfile' /etc/fstab; then
    echo '/swapfile none swap sw 0 0' >> /etc/fstab
  fi
else
  echo "Swap file already exists"
fi

# Configure swappiness (idempotent)
if ! grep -q '^vm.swappiness=60' /etc/sysctl.conf; then
  sysctl -w vm.swappiness=60
  echo 'vm.swappiness=60' >> /etc/sysctl.conf
fi

# ==========================================
# Service Memory Limits (idempotent)
# ==========================================
echo "Configuring service memory limits..."
for svc in php8.0-fpm rspamd spamassassin named dovecot; do
  if systemctl list-unit-files | grep -q "^${svc}"; then
    systemctl set-property "${svc}.service" MemoryMax=400M || true
  fi
done
systemctl daemon-reload || true

# ==========================================
# Admin Password (idempotent)
# ==========================================
EMAIL_ADDR="admin@${DOMAIN_NAME}"
ADMIN_PASSWORD_PARAM="${ADMIN_PASSWORD_PARAM:-/MailInABoxAdminPassword-${STACK_NAME}}"

# Check if ADMIN_PASSWORD is set (handle unset variable with set -u)
if [[ -z "${ADMIN_PASSWORD:-}" ]]; then
  # Check if password already exists in SSM
  if aws ssm get-parameter --region "${REGION}" --name "${ADMIN_PASSWORD_PARAM}" --with-decryption >/dev/null 2>&1; then
    echo "Admin password already exists in SSM (${ADMIN_PASSWORD_PARAM})"
    EMAIL_PW=$(aws ssm get-parameter --region "${REGION}" --name "${ADMIN_PASSWORD_PARAM}" --with-decryption --query Parameter.Value --output text)
  else
    # Generate new password
    EMAIL_PW=$(tr -dc A-Za-z0-9 </dev/urandom | head -c 16 ; echo '')
    if [[ -z "${RESTORE_PREFIX:-}" ]]; then
      echo "Storing admin password in SSM..."
      aws ssm put-parameter --region "${REGION}" --overwrite \
        --name "${ADMIN_PASSWORD_PARAM}" --type SecureString --value "${EMAIL_PW}" || true
    fi
  fi
else
  EMAIL_PW="${ADMIN_PASSWORD}"
fi

# ==========================================
# User & Storage Setup (idempotent)
# ==========================================
if ! id -u "${STORAGE_USER}" >/dev/null 2>&1; then
  echo "Creating user: ${STORAGE_USER}"
  useradd -m "${STORAGE_USER}"
else
  echo "User ${STORAGE_USER} already exists"
fi

mkdir -p "${STORAGE_ROOT}"

# ==========================================
# Mail-in-a-Box Clone/Checkout (idempotent)
# ==========================================
MIAB_REPO="${MAILINABOX_CLONE_URL:-https://github.com/mail-in-a-box/mailinabox.git}"
MIAB_TAG="${MAILINABOX_VERSION}"

# Validate that MAILINABOX_VERSION is set (required, no default)
if [ -z "${MIAB_TAG}" ]; then
  echo "ERROR: MAILINABOX_VERSION environment variable is not set!"
  echo "Mail-in-a-Box version must be provided via MAILINABOX_VERSION environment variable."
  echo "This should be set by the bootstrap script. If you see this error, it indicates"
  echo "a problem with the bootstrap process."
  exit 1
fi

if [ ! -d "/opt/mailinabox" ]; then
  echo "Cloning Mail-in-a-Box repository..."
  git clone "${MIAB_REPO}" /opt/mailinabox
else
  echo "Mail-in-a-Box repository already exists, updating..."
fi

cd /opt/mailinabox
# Fix git ownership/permissions issues (common when repo was cloned as root)
# Ensure git can access its own files
if [ -d .git ]; then
  # Fix ownership if needed (git operations may fail due to permission issues)
  if ! git rev-parse --git-dir >/dev/null 2>&1; then
    echo "Fixing git directory permissions..."
    chown -R root:root .git 2>/dev/null || true
    chmod -R u+rwX .git 2>/dev/null || true
  fi
  # Add safe directory to avoid ownership warnings
  git config --global --add safe.directory /opt/mailinabox 2>/dev/null || true
fi

# Fetch all branches and tags
git fetch --all --tags -q 2>&1 || {
  echo "Warning: git fetch failed, trying to fix permissions and retry..."
  chown -R root:root .git 2>/dev/null || true
  chmod -R u+rwX .git 2>/dev/null || true
  git fetch --all --tags -q 2>&1 || true
}

# Get current tag/commit
CURRENT_TAG=$(git describe --tags --exact-match 2>/dev/null || git rev-parse --short HEAD 2>/dev/null || echo "")

if [ "${CURRENT_TAG}" != "${MIAB_TAG}" ]; then
  echo "Checking out Mail-in-a-Box version: ${MIAB_TAG}"
  # Try to checkout tag, if it doesn't exist try as branch or commit
  if git checkout "${MIAB_TAG}" -q 2>/dev/null; then
    echo "Successfully checked out ${MIAB_TAG}"
  else
    echo "Tag ${MIAB_TAG} not found, trying to fetch and checkout..."
    git fetch origin tag "${MIAB_TAG}" -q 2>/dev/null || true
    if git checkout "${MIAB_TAG}" -q 2>/dev/null; then
      echo "Successfully checked out ${MIAB_TAG} after fetch"
    else
      echo "Warning: Could not checkout ${MIAB_TAG}, trying to find latest stable tag..."
      # Extract major version (e.g., "73" from "v73")
      MAJOR_VERSION=$(echo "${MIAB_TAG}" | sed 's/^v//' | cut -d. -f1)
      # Try to find the latest tag matching the major version (e.g., v73.*)
      LATEST_TAG=$(git tag -l "v${MAJOR_VERSION}.*" | sort -V | tail -1 2>/dev/null || echo "")
      if [ -n "${LATEST_TAG}" ]; then
        echo "Found latest v${MAJOR_VERSION} tag: ${LATEST_TAG}, checking out..."
        git checkout "${LATEST_TAG}" -q 2>/dev/null || {
          echo "Warning: Could not checkout ${LATEST_TAG}, trying to find any tag with management directory..."
          # Try to find any tag that has the management directory
          for tag in $(git tag -l "v*" | sort -V -r | head -10); do
            if git checkout "${tag}" -q 2>/dev/null && [ -d "management" ]; then
              echo "Found working tag: ${tag}"
              break
            fi
          done
          # If still no management directory, fall back to main
          if [ ! -d "management" ]; then
            echo "Warning: No tag found with management directory, using main branch"
            git checkout main -q || git checkout master -q || true
          fi
        }
      else
        echo "Warning: No v${MAJOR_VERSION} tags found, trying to find any tag with management directory..."
        # Try to find any tag that has the management directory
        for tag in $(git tag -l "v*" | sort -V -r | head -10); do
          if git checkout "${tag}" -q 2>/dev/null && [ -d "management" ]; then
            echo "Found working tag: ${tag}"
            break
          fi
        done
        # If still no management directory, fall back to main
        if [ ! -d "management" ]; then
          echo "Warning: No tag found with management directory, using main branch"
          git checkout main -q || git checkout master -q || true
        fi
      fi
    fi
  fi
  
  # Verify management directory exists after checkout
  if [ ! -d "management" ]; then
    echo "ERROR: management directory not found after checkout!"
    echo "Current branch/tag: $(git rev-parse --abbrev-ref HEAD 2>/dev/null || git describe --tags 2>/dev/null || echo 'unknown')"
    # Extract major version for context
    MAJOR_VERSION=$(echo "${MIAB_TAG}" | sed 's/^v//' | cut -d. -f1)
    echo "Available v${MAJOR_VERSION}.* tags: $(git tag -l "v${MAJOR_VERSION}.*" | head -5 | tr '\n' ' ')"
    echo "Trying to find a tag with management directory..."
    # Try to find any tag that has the management directory
    for tag in $(git tag -l "v*" | sort -V -r | head -10); do
      if git checkout "${tag}" -q 2>/dev/null && [ -d "management" ]; then
        echo "Found working tag: ${tag}"
        break
      fi
    done
  fi
else
  echo "Already on correct version: ${MIAB_TAG}"
fi

# Final verification that management directory exists
if [ ! -d "management" ]; then
  echo "ERROR: management directory still not found!"
  echo "This is a critical error - Mail-in-a-Box cannot function without management scripts"
  echo "Current directory contents:"
  ls -la | head -20
  exit 1
fi

# ==========================================
# Optional Backup Restore (idempotent)
# ==========================================
if [[ -n "${RESTORE_PREFIX:-}" ]]; then
  echo "Restore prefix specified: ${RESTORE_PREFIX}"
  
  # Ensure duplicity is available via snap
  if ! command -v duplicity >/dev/null 2>&1; then
    echo "Installing duplicity via snap..."
    apt-get remove -y duplicity || true
    snap install duplicity --classic || true
    ln -sf /snap/bin/duplicity /usr/bin/duplicity || true
  fi

  echo "Restoring from backup: s3://${BACKUP_BUCKET}/${RESTORE_PREFIX}"
  duplicity restore --force "s3://${BACKUP_BUCKET}/${RESTORE_PREFIX}" "${STORAGE_ROOT}" || {
    echo "Warning: Backup restore failed or backup not found"
  }
  mkdir -p "${STORAGE_ROOT}/backup"
fi

# ==========================================
# Run MIAB Installer (idempotent - MIAB handles re-runs)
# ==========================================
MIAB_COMPLETE_MARKER="/home/user-data/.miab_setup_complete"
MIAB_INSTALLING_MARKER="/home/user-data/.miab_installing"

# Check if MIAB setup is already complete
if [ -f "${MIAB_COMPLETE_MARKER}" ]; then
  echo "Mail-in-a-Box setup already completed (marker file exists)"
  echo "Skipping MIAB installer to avoid duplicate operations"
else
  # Check if installation is in progress (from previous failed run)
  if [ -f "${MIAB_INSTALLING_MARKER}" ]; then
    echo "Previous MIAB installation may have been interrupted"
    echo "Removing stale marker and continuing..."
    rm -f "${MIAB_INSTALLING_MARKER}"
  fi
  
  # Check if MIAB is already configured (check for key files/directories)
  if [ -f "/etc/mailinabox.conf" ] || [ -d "/home/user-data/ssl" ]; then
    echo "Mail-in-a-Box appears to be already configured"
    echo "Checking if setup completed successfully..."
    
    # Verify key services are running (check each service individually)
    if systemctl is-active --quiet postfix 2>/dev/null && \
       systemctl is-active --quiet dovecot 2>/dev/null && \
       systemctl is-active --quiet nginx 2>/dev/null; then
      echo "Mail services are running - MIAB setup appears complete"
      echo "Creating completion marker..."
      touch "${MIAB_COMPLETE_MARKER}"
      chown user-data:user-data "${MIAB_COMPLETE_MARKER}"
    else
      echo "Services not running - will re-run MIAB installer"
    fi
  fi
  
  # Run installer only if not already complete
  if [ ! -f "${MIAB_COMPLETE_MARKER}" ]; then
    echo "Running Mail-in-a-Box installer..."
    touch "${MIAB_INSTALLING_MARKER}"
    chown user-data:user-data "${MIAB_INSTALLING_MARKER}"

    cd /opt/mailinabox
    INSTALL_EXIT_CODE=0
    bash -x setup/start.sh 2>&1 | tee /tmp/mailinabox_debug.log || INSTALL_EXIT_CODE=$?
    rm -f "${MIAB_INSTALLING_MARKER}"

    # Enhanced validation: Check services BEFORE creating completion marker
    echo "Validating MIAB installation..."
    echo "Waiting for services to stabilize..."
    sleep 10

    VALIDATION_PASSED=1
    for SERVICE in postfix dovecot nginx; do
      if ! systemctl is-active --quiet "${SERVICE}" 2>/dev/null; then
        VALIDATION_PASSED=0
        echo "WARNING: ${SERVICE} is not running"
      else
        echo "OK: ${SERVICE} is running"
      fi
    done

    # Check for API key (indicates MIAB web UI setup completed)
    API_KEY_PATH="/var/lib/mailinabox/api.key"
    if [ ! -f "${API_KEY_PATH}" ]; then
      VALIDATION_PASSED=0
      echo "WARNING: API key not found at ${API_KEY_PATH}"
    else
      echo "OK: API key exists"
    fi

    # Check for mailinabox.conf (indicates basic setup completed)
    if [ ! -f "/etc/mailinabox.conf" ]; then
      VALIDATION_PASSED=0
      echo "WARNING: mailinabox.conf not found"
    else
      echo "OK: mailinabox.conf exists"
    fi

    # Only create completion marker if ALL validations pass
    if [ ${VALIDATION_PASSED} -eq 1 ]; then
      echo "Mail-in-a-Box installation validated successfully"
      touch "${MIAB_COMPLETE_MARKER}"
      chown user-data:user-data "${MIAB_COMPLETE_MARKER}"
      echo "MIAB_INSTALL_STATUS=SUCCESS" >> "${MIAB_COMPLETE_MARKER}"
      echo "MIAB_INSTALL_TIME=$(date -u +%Y-%m-%dT%H:%M:%SZ)" >> "${MIAB_COMPLETE_MARKER}"
    else
      echo "=========================================="
      echo "WARNING: MIAB installation validation FAILED!"
      echo "Installation exit code: ${INSTALL_EXIT_CODE}"
      echo "Debug log: /tmp/mailinabox_debug.log"
      echo "=========================================="
      echo "NOT creating completion marker - bootstrap will retry on next run"
      # Do NOT exit - continue with other steps that might help
    fi
  fi
fi

# ==========================================
# Admin User Creation (idempotent)
# ==========================================
# Only create admin user if MIAB setup completed successfully
if [ -f "${MIAB_COMPLETE_MARKER}" ]; then
  ADMIN_USER_MARKER="/home/user-data/.admin_user_created"
  if [ -f "${ADMIN_USER_MARKER}" ]; then
    echo "Admin user already created (marker file exists)"
    echo "Skipping admin user creation to avoid duplicate operations"
  else
    echo "Creating admin user account..."
    
    # Get admin credentials from SSM
    ADMIN_PASSWORD_PARAM="/MailInABoxAdminPassword-${STACK_NAME}"
    EMAIL_ADDR="admin@${DOMAIN_NAME}"
    EMAIL_PW=""
    
    if aws ssm get-parameter --region "${REGION}" --name "${ADMIN_PASSWORD_PARAM}" --with-decryption >/dev/null 2>&1; then
      EMAIL_PW=$(aws ssm get-parameter --region "${REGION}" --name "${ADMIN_PASSWORD_PARAM}" --with-decryption --query Parameter.Value --output text)
    else
      echo "Warning: Admin password not found in SSM (${ADMIN_PASSWORD_PARAM})"
      echo "Skipping admin user creation - password required"
    fi
    
    if [ -n "${EMAIL_PW}" ]; then
      # Wait for API key generation (max 5 minutes, check every 10 seconds)
      API_KEY_PATH="/var/lib/mailinabox/api.key"
      MAX_WAIT=300  # 5 minutes
      CHECK_INTERVAL=10  # 10 seconds
      WAITED=0
      API_KEY_AVAILABLE=0
      
      echo "Waiting for API key generation..."
      while [ ${WAITED} -lt ${MAX_WAIT} ]; do
        if [ -f "${API_KEY_PATH}" ] && [ -r "${API_KEY_PATH}" ]; then
          API_KEY_AVAILABLE=1
          echo "API key found after ${WAITED} seconds"
          break
        fi
        sleep ${CHECK_INTERVAL}
        WAITED=$((WAITED + CHECK_INTERVAL))
        if [ $((WAITED % 30)) -eq 0 ]; then
          echo "Still waiting for API key... (${WAITED}/${MAX_WAIT} seconds)"
        fi
      done
      
      if [ ${API_KEY_AVAILABLE} -eq 0 ]; then
        echo "Warning: API key not available after ${MAX_WAIT} seconds"
        echo "Admin user creation will be skipped - API key required"
        echo "Mail-in-a-Box setup may still be in progress"
      else
        # Check if admin user exists (idempotent check)
        USER_EXISTS=0
        RETRY_COUNT=0
        MAX_RETRIES=3
        
        while [ ${RETRY_COUNT} -lt ${MAX_RETRIES} ]; do
          # Try cli.py first (v73+)
          if [ -f "/opt/mailinabox/management/cli.py" ]; then
            cd /opt/mailinabox
            git config --global --add safe.directory /opt/mailinabox 2>/dev/null || true
            if sudo -n -u user-data /opt/mailinabox/management/cli.py user 2>/dev/null | grep -qi "${EMAIL_ADDR}"; then
              USER_EXISTS=1
              echo "Admin user already exists: ${EMAIL_ADDR}"
              break
            fi
          fi
          
          # Try users.py (older versions)
          if [ ${USER_EXISTS} -eq 0 ] && [ -f "/opt/mailinabox/management/users.py" ]; then
            cd /opt/mailinabox
            git config --global --add safe.directory /opt/mailinabox 2>/dev/null || true
            if sudo -n -u user-data /opt/mailinabox/management/users.py list 2>/dev/null | grep -qi "${EMAIL_ADDR}"; then
              USER_EXISTS=1
              echo "Admin user already exists: ${EMAIL_ADDR}"
              break
            fi
          fi
          
          # If user doesn't exist, try to create
          if [ ${USER_EXISTS} -eq 0 ]; then
            echo "Creating admin user: ${EMAIL_ADDR} (attempt $((RETRY_COUNT + 1))/${MAX_RETRIES})"
            
            # Try cli.py first (v73+)
            if [ -f "/opt/mailinabox/management/cli.py" ]; then
              cd /opt/mailinabox
              git config --global --add safe.directory /opt/mailinabox 2>/dev/null || true
              if sudo -n -u user-data bash -c "cd /opt/mailinabox && /opt/mailinabox/management/cli.py user add \"${EMAIL_ADDR}\" \"${EMAIL_PW}\" admin" 2>&1; then
                USER_EXISTS=1
                echo "Admin user created successfully via cli.py"
                break
              else
                echo "Warning: cli.py user creation failed, will retry..."
              fi
            fi
            
            # Try users.py (older versions)
            if [ ${USER_EXISTS} -eq 0 ] && [ -f "/opt/mailinabox/management/users.py" ]; then
              cd /opt/mailinabox
              git config --global --add safe.directory /opt/mailinabox 2>/dev/null || true
              if sudo -n -u user-data bash -c "cd /opt/mailinabox && /opt/mailinabox/management/users.py add \"${EMAIL_ADDR}\" \"${EMAIL_PW}\"" 2>&1; then
                # Add admin privileges separately for older versions
                if sudo -n -u user-data bash -c "cd /opt/mailinabox && /opt/mailinabox/management/users.py privileges add \"${EMAIL_ADDR}\" admin" 2>&1; then
                  USER_EXISTS=1
                  echo "Admin user created successfully via users.py"
                  break
                fi
              else
                echo "Warning: users.py user creation failed, will retry..."
              fi
            fi
          fi
          
          RETRY_COUNT=$((RETRY_COUNT + 1))
          if [ ${RETRY_COUNT} -lt ${MAX_RETRIES} ]; then
            # Exponential backoff: wait 2^retry_count seconds
            BACKOFF=$((1 << RETRY_COUNT))
            echo "Waiting ${BACKOFF} seconds before retry..."
            sleep ${BACKOFF}
          fi
        done
        
        # Set password for me@${PRIMARY_HOSTNAME} to match admin password
        if [ ${USER_EXISTS} -eq 1 ]; then
          ME_USER="me@${PRIMARY_HOSTNAME}"
          echo "Setting password for ${ME_USER} to match admin password..."
          
          # Try cli.py first (v73+)
          if [ -f "/opt/mailinabox/management/cli.py" ]; then
            cd /opt/mailinabox
            git config --global --add safe.directory /opt/mailinabox 2>/dev/null || true
            sudo -n -u user-data bash -c "cd /opt/mailinabox && /opt/mailinabox/management/cli.py user password \"${ME_USER}\" \"${EMAIL_PW}\"" 2>&1 || echo "Warning: Failed to set ${ME_USER} password via cli.py"
          fi
          
          # Try users.py (older versions)
          if [ -f "/opt/mailinabox/management/users.py" ]; then
            cd /opt/mailinabox
            git config --global --add safe.directory /opt/mailinabox 2>/dev/null || true
            sudo -n -u user-data bash -c "cd /opt/mailinabox && /opt/mailinabox/management/users.py password \"${ME_USER}\" \"${EMAIL_PW}\"" 2>&1 || echo "Warning: Failed to set ${ME_USER} password via users.py"
          fi
          
          # Create marker file to indicate admin user was created
          touch "${ADMIN_USER_MARKER}"
          chown user-data:user-data "${ADMIN_USER_MARKER}"
          echo "Admin user creation completed successfully"
        else
          echo "Warning: Failed to create admin user after ${MAX_RETRIES} attempts"
          echo "This is non-fatal - user can be created manually later"
        fi
      fi
    fi
  fi
else
  echo "Skipping admin user creation - MIAB setup not yet complete"
fi

# ==========================================
# SES Relay Configuration (idempotent)
# ==========================================
SES_RELAY_MARKER="/home/user-data/.ses_relay_configured"
if [[ "${SES_RELAY}" == "true" ]]; then
  if [ -f "${SES_RELAY_MARKER}" ]; then
    echo "SES relay already configured (marker file exists)"
    echo "Skipping SES relay configuration to avoid duplicate operations"
  else
    echo "Configuring SES SMTP relay..."
    
    SMTP_USERNAME_PARAM="/smtp-username-${STACK_NAME}"
    SMTP_PASSWORD_PARAM="/smtp-password-${STACK_NAME}"
    
    if aws ssm get-parameter --region "${REGION}" --name "${SMTP_USERNAME_PARAM}" --with-decryption >/dev/null 2>&1 && \
       aws ssm get-parameter --region "${REGION}" --name "${SMTP_PASSWORD_PARAM}" --with-decryption >/dev/null 2>&1; then
    
    SMTP_USERNAME=$(aws ssm get-parameter --region "${REGION}" --name "${SMTP_USERNAME_PARAM}" --with-decryption --query Parameter.Value --output text)
    SMTP_PASSWORD=$(aws ssm get-parameter --region "${REGION}" --name "${SMTP_PASSWORD_PARAM}" --with-decryption --query Parameter.Value --output text)
    
    mkdir -p /home/user-data/mail
    
    # Update mail config (idempotent)
    cat >/home/user-data/mail/config <<CFG
[mail]
smtp_relay_enable = true
smtp_relay_host = email-smtp.${REGION}.amazonaws.com
smtp_relay_port = 587
smtp_relay_username = ${SMTP_USERNAME}
smtp_relay_password = ${SMTP_PASSWORD}
CFG
    chown user-data:user-data /home/user-data/mail/config
    chmod 640 /home/user-data/mail/config
    
    # Configure Postfix (idempotent)
    postconf -e "relayhost = [email-smtp.${REGION}.amazonaws.com]:587" \
             "smtp_sasl_auth_enable = yes" \
             "smtp_sasl_security_options = noanonymous" \
             "smtp_sasl_password_maps = hash:/etc/postfix/sasl_passwd" \
             "smtp_use_tls = yes" \
             "smtp_tls_security_level = encrypt" \
             "smtp_tls_note_starttls_offer = yes" \
             "smtp_tls_loglevel = 2" || true
    
    # Disable fallback relay
    sed -i 's/^[^#].*smtp_fallback_relay=/#&/' /etc/postfix/master.cf || true
    
    # Update SASL password file
    echo "[email-smtp.${REGION}.amazonaws.com]:587 ${SMTP_USERNAME}:${SMTP_PASSWORD}" >/etc/postfix/sasl_passwd
    chmod 600 /etc/postfix/sasl_passwd
    postmap hash:/etc/postfix/sasl_passwd
    chmod 600 /etc/postfix/sasl_passwd.db
    
    postconf -e 'smtp_tls_CAfile = /etc/ssl/certs/ca-certificates.crt' || true
    
    # Configure DKIM directory
    mkdir -p /home/user-data/mail/dkim
    chown -R opendkim:opendkim /home/user-data/mail/dkim || true
    chmod -R 750 /home/user-data/mail/dkim || true
    find /home/user-data/mail/dkim -type f -exec chmod 640 {} \; || true
    
    chown user-data:user-data /home/user-data /home/user-data/mail || true
    chmod 755 /home/user-data /home/user-data/mail || true
    
    # Restart services
    systemctl restart postfix || true
    systemctl reload postfix || true
    systemctl restart dovecot || true
    systemctl restart opendkim || true
    
    # Note: /etc/hosts entry now set in Stage 0 (Preflight)
    # This is a defensive re-check
    if ! grep -q "${PRIMARY_HOSTNAME}" /etc/hosts; then
      echo "Re-adding ${PRIMARY_HOSTNAME} to /etc/hosts (was removed unexpectedly)"
      echo "127.0.0.1 ${PRIMARY_HOSTNAME}" >> /etc/hosts
    fi

    # Mark SES relay as configured
    touch "${SES_RELAY_MARKER}"
    chown user-data:user-data "${SES_RELAY_MARKER}"
    
    echo "SES relay configuration complete"
    else
      echo "Warning: SES SMTP credentials not found in SSM. Skipping relay configuration."
    fi
  fi
fi

# ==========================================
# Stage 3: Service Validation
# ==========================================
SERVICE_VALIDATION_MARKER="/home/user-data/.service_validation_complete"
if [ ! -f "${SERVICE_VALIDATION_MARKER}" ]; then
  echo "=========================================="
  echo "Stage 3: Service Validation"
  echo "=========================================="

  VALIDATION_ISSUES=0

  # 3.1 - Verify all critical services are running
  echo "Checking critical services..."
  for SERVICE in postfix dovecot nginx; do
    if systemctl is-active --quiet "${SERVICE}" 2>/dev/null; then
      echo "  OK: ${SERVICE} is active"
    else
      echo "  WARN: ${SERVICE} is NOT active"
      VALIDATION_ISSUES=$((VALIDATION_ISSUES + 1))

      # Attempt to start/restart the service
      echo "  Attempting to restart ${SERVICE}..."
      systemctl restart "${SERVICE}" 2>/dev/null || true
      sleep 2

      if systemctl is-active --quiet "${SERVICE}" 2>/dev/null; then
        echo "  OK: ${SERVICE} started after restart"
        VALIDATION_ISSUES=$((VALIDATION_ISSUES - 1))
      else
        echo "  FAIL: ${SERVICE} could not be started"
      fi
    fi
  done

  # 3.2 - Check for DNS resolution errors in mail log
  echo "Checking for DNS resolution errors..."
  MAIL_LOG="/var/log/mail.log"
  if [ -f "${MAIL_LOG}" ]; then
    DNS_ERRORS=$(grep -c "Host not found" "${MAIL_LOG}" 2>/dev/null || echo "0")
    if [ "${DNS_ERRORS}" -gt 0 ]; then
      echo "  WARN: Found ${DNS_ERRORS} DNS resolution errors in mail.log"
      echo "  Recent DNS errors:"
      grep "Host not found" "${MAIL_LOG}" 2>/dev/null | tail -3 || true
    else
      echo "  OK: No DNS resolution errors found"
    fi
  else
    echo "  INFO: mail.log not found yet (may be normal for fresh install)"
  fi

  # 3.3 - Verify hostname resolution works
  echo "Verifying hostname resolution..."
  if getent hosts "${PRIMARY_HOSTNAME}" >/dev/null 2>&1; then
    echo "  OK: ${PRIMARY_HOSTNAME} resolves"
  else
    echo "  WARN: ${PRIMARY_HOSTNAME} does not resolve"
    echo "  Adding to /etc/hosts as fallback..."
    if ! grep -q "${PRIMARY_HOSTNAME}" /etc/hosts; then
      echo "127.0.0.1 ${PRIMARY_HOSTNAME}" >> /etc/hosts
    fi
    VALIDATION_ISSUES=$((VALIDATION_ISSUES + 1))
  fi

  # 3.4 - Check fail2ban status (non-critical but informative)
  echo "Checking fail2ban status..."
  if systemctl is-active --quiet fail2ban 2>/dev/null; then
    echo "  OK: fail2ban is running"
  else
    echo "  INFO: fail2ban is not running (attempting restart)"
    # Ensure munin log file exists (defensive re-check)
    if [ ! -f "/var/log/munin/munin-node.log" ]; then
      mkdir -p /var/log/munin
      touch /var/log/munin/munin-node.log
      chmod 640 /var/log/munin/munin-node.log
    fi
    systemctl restart fail2ban 2>/dev/null || true
  fi

  # Summary
  echo ""
  if [ ${VALIDATION_ISSUES} -eq 0 ]; then
    echo "Service validation passed with no issues"
  else
    echo "Service validation completed with ${VALIDATION_ISSUES} issue(s)"
    echo "These issues are logged but will not block bootstrap completion"
  fi
  touch "${SERVICE_VALIDATION_MARKER}"
  chown user-data:user-data "${SERVICE_VALIDATION_MARKER}"
  echo "VALIDATION_TIME=$(date -u +%Y-%m-%dT%H:%M:%SZ)" >> "${SERVICE_VALIDATION_MARKER}"
  echo "VALIDATION_ISSUES=${VALIDATION_ISSUES}" >> "${SERVICE_VALIDATION_MARKER}"
else
  echo "Service validation already completed (marker exists)"
fi

# ==========================================
# DNS Resolver Configuration (idempotent)
# ==========================================
IFACE=$(ip route list | awk '/default/ {print $5; exit}')
NETPLAN_FILE="/etc/netplan/99-custom-dns.yaml"

if [ ! -f "${NETPLAN_FILE}" ]; then
  echo "Configuring DNS resolver..."
  cat >"${NETPLAN_FILE}" <<EOF
network:
  version: 2
  ethernets:
    ${IFACE}:
      nameservers:
        addresses: [127.0.0.1]
      dhcp4-overrides:
        use-dns: false
EOF
  netplan apply || true
else
  echo "DNS resolver already configured"
fi

# ==========================================
# Duplicity via Snap (idempotent)
# ==========================================
DUPLICITY_MARKER="/root/.duplicity_installed"
if [ -f "${DUPLICITY_MARKER}" ]; then
  echo "Duplicity already installed (marker file exists)"
  echo "Skipping duplicity installation to avoid duplicate operations"
elif ! command -v duplicity >/dev/null 2>&1 || ! duplicity --version | grep -q "duplicity"; then
  echo "Installing duplicity via snap..."
  apt-get remove -y duplicity || true
  rm -f /etc/apt/sources.list.d/duplicity-team-ubuntu-duplicity-release-git-jammy.list || true
  apt-get update -qq
  if snap install duplicity --classic; then
    ln -sf /snap/bin/duplicity /usr/bin/duplicity || true
    touch "${DUPLICITY_MARKER}"
  fi
else
  # Duplicity already installed via snap
  touch "${DUPLICITY_MARKER}"
fi

# Run initial backup if MIAB is configured (idempotent - only once)
BACKUP_MARKER="/home/user-data/.initial_backup_complete"
if [ -f "/opt/mailinabox/management/backup.py" ] && [ ! -f "${BACKUP_MARKER}" ]; then
  echo "Running initial backup..."
  if /opt/mailinabox/management/backup.py; then
    touch "${BACKUP_MARKER}"
    chown user-data:user-data "${BACKUP_MARKER}"
    echo "Initial backup completed successfully"
  else
    echo "Warning: Initial backup failed or skipped"
  fi
elif [ -f "${BACKUP_MARKER}" ]; then
  echo "Initial backup already completed (marker file exists)"
  echo "Skipping initial backup to avoid duplicate operations"
fi

# ==========================================
# Cleanup Sensitive Files (idempotent)
# ==========================================
IID=$(curl -s http://169.254.169.254/latest/meta-data/instance-id 2>/dev/null || echo "unknown")
CLEANUP_DIR="/var/lib/cloud/instances/${IID}"

if [ -d "${CLEANUP_DIR}" ]; then
  echo "Cleaning up cloud-init sensitive files..."
  for f in "${CLEANUP_DIR}"/scripts/part-00* \
           "${CLEANUP_DIR}"/user-data.txt* \
           "${CLEANUP_DIR}"/obj.pkl; do
    [ -e "$f" ] && rm -f "$f" || true
  done
fi

# ==========================================
# Stage 4: Final Bootstrap Validation (GATED)
# ==========================================
# Only write .bootstrap_complete when ALL conditions pass:
# - .miab_setup_complete exists
# - Postfix + Dovecot are active
# - API key exists
BOOTSTRAP_COMPLETE_MARKER="/home/user-data/.bootstrap_complete"
if [ ! -f "${BOOTSTRAP_COMPLETE_MARKER}" ]; then
  echo "=========================================="
  echo "Stage 4: Final Bootstrap Validation"
  echo "=========================================="

  COMPLETION_BLOCKED=0
  COMPLETION_REASONS=""

  # Check: MIAB setup complete
  if [ -f "${MIAB_COMPLETE_MARKER}" ]; then
    echo "OK: MIAB setup complete marker exists"
  else
    echo "BLOCKED: MIAB setup complete marker NOT found"
    COMPLETION_BLOCKED=1
    COMPLETION_REASONS="${COMPLETION_REASONS}\n  - .miab_setup_complete marker missing"
  fi

  # Check: Postfix is running
  if systemctl is-active --quiet postfix 2>/dev/null; then
    echo "OK: Postfix is running"
  else
    echo "BLOCKED: Postfix is NOT running"
    COMPLETION_BLOCKED=1
    COMPLETION_REASONS="${COMPLETION_REASONS}\n  - Postfix service not active"
  fi

  # Check: Dovecot is running
  if systemctl is-active --quiet dovecot 2>/dev/null; then
    echo "OK: Dovecot is running"
  else
    echo "BLOCKED: Dovecot is NOT running"
    COMPLETION_BLOCKED=1
    COMPLETION_REASONS="${COMPLETION_REASONS}\n  - Dovecot service not active"
  fi

  # Check: API key exists
  if [ -f "/var/lib/mailinabox/api.key" ]; then
    echo "OK: API key exists"
  else
    echo "BLOCKED: API key NOT found"
    COMPLETION_BLOCKED=1
    COMPLETION_REASONS="${COMPLETION_REASONS}\n  - API key missing (/var/lib/mailinabox/api.key)"
  fi

  # Check: Admin user marker exists (informational, not blocking)
  ADMIN_USER_MARKER="/home/user-data/.admin_user_created"
  if [ -f "${ADMIN_USER_MARKER}" ]; then
    echo "OK: Admin user creation marker exists"
  else
    echo "INFO: Admin user creation marker not found (not blocking)"
  fi

  # Decision point
  echo ""
  if [ ${COMPLETION_BLOCKED} -eq 0 ]; then
    echo "=========================================="
    echo "All validation checks passed!"
    echo "Creating bootstrap completion marker..."
    echo "=========================================="

    touch "${BOOTSTRAP_COMPLETE_MARKER}"
    chown user-data:user-data "${BOOTSTRAP_COMPLETE_MARKER}"

    # Write detailed completion info
    cat >> "${BOOTSTRAP_COMPLETE_MARKER}" << EOF
Bootstrap completed successfully
Time: $(date -u +%Y-%m-%dT%H:%M:%SZ)
Hostname: ${PRIMARY_HOSTNAME}
Domain: ${DOMAIN_NAME}
MIAB Version: ${MAILINABOX_VERSION:-unknown}
Postfix: $(systemctl is-active postfix 2>/dev/null || echo "unknown")
Dovecot: $(systemctl is-active dovecot 2>/dev/null || echo "unknown")
Nginx: $(systemctl is-active nginx 2>/dev/null || echo "unknown")
API Key: $([ -f /var/lib/mailinabox/api.key ] && echo "exists" || echo "missing")
Admin Created: $([ -f ${ADMIN_USER_MARKER} ] && echo "yes" || echo "no")
EOF

    echo "Bootstrap completed at: $(date)"
  else
    echo "=========================================="
    echo "BOOTSTRAP COMPLETION BLOCKED"
    echo "=========================================="
    echo -e "The following issues prevent marking bootstrap as complete:${COMPLETION_REASONS}"
    echo ""
    echo "The bootstrap script will NOT create the .bootstrap_complete marker."
    echo "This ensures the bootstrap can be re-run to fix these issues."
    echo ""
    echo "Troubleshooting:"
    echo "  1. Check logs: /var/log/mailinabox_setup.log"
    echo "  2. Check MIAB debug: /tmp/mailinabox_debug.log"
    echo "  3. Check services: systemctl status postfix dovecot nginx"
    echo "  4. Re-run bootstrap: pnpm nx run ops-runner:instance:bootstrap"
  fi
else
  echo "Bootstrap already completed (marker exists)"
  echo "Marker contents:"
  cat "${BOOTSTRAP_COMPLETE_MARKER}" 2>/dev/null || echo "  (could not read marker)"
fi

# ==========================================
# Optional Reboot
# ==========================================
if [[ "${REBOOT_AFTER_SETUP}" == "true" ]]; then
  echo "Reboot requested after setup..."
  echo "MIAB setup complete for ${PRIMARY_HOSTNAME}"
  echo "Rebooting in 10 seconds..."
  sleep 10
  reboot
else
  echo "=========================================="
  echo "MIAB setup complete for ${PRIMARY_HOSTNAME}"
  echo "Completed at: $(date)"
  echo "=========================================="
  echo ""
  echo "✅ Bootstrap completed successfully"
  echo "   All operations completed without errors"
  echo "   Safe to re-run - script will skip completed steps"
fi
