#!/bin/bash -xe

# Mail-in-a-Box bootstrap script (idempotent, SSM-executable)
# This script can be run multiple times safely - it checks for existing state before making changes

# Required environment variables (set by bootstrap runner):
# DOMAIN_NAME, INSTANCE_DNS, REGION, STACK_NAME, BACKUP_BUCKET, NEXTCLOUD_BUCKET
# Optional: EIP_ALLOCATION_ID, SES_IDENTITY_ARN, RESTORE_PREFIX, REBOOT_AFTER_SETUP

LOGFILE="/var/log/mailinabox_setup.log"
exec > >(tee -a "$LOGFILE" | logger -t mailinabox_setup) 2>&1

echo "=========================================="
echo "MIAB Bootstrap Script"
echo "Started at: $(date)"
echo "Domain: ${DOMAIN_NAME}"
echo "Instance DNS: ${INSTANCE_DNS}.${DOMAIN_NAME}"
echo "=========================================="

# Resolve Elastic IP from AllocationId (works even if EIP not yet attached)
ELASTIC_IP=""
if [[ -n "${EIP_ALLOCATION_ID}" ]]; then
  echo "Resolving Elastic IP from AllocationId: ${EIP_ALLOCATION_ID}"
  
  # Ensure AWS CLI is available
  if ! command -v aws >/dev/null 2>&1; then
    echo "Installing AWS CLI..."
    sudo apt-get update -y
    sudo apt-get install -y jq curl unzip
    curl -sSL "https://awscli.amazonaws.com/awscli-exe-linux-$(uname -m).zip" -o /tmp/awscliv2.zip
    unzip -q /tmp/awscliv2.zip -d /tmp && sudo /tmp/aws/install
    rm -rf /tmp/awscliv2.zip /tmp/aws
  fi

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
# System Updates & Prerequisites (idempotent)
# ==========================================
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
    if [[ -z "${RESTORE_PREFIX}" ]]; then
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
MIAB_TAG="${MAILINABOX_VERSION:-v64.0}"

if [ ! -d "/opt/mailinabox" ]; then
  echo "Cloning Mail-in-a-Box repository..."
  git clone "${MIAB_REPO}" /opt/mailinabox
else
  echo "Mail-in-a-Box repository already exists, updating..."
fi

cd /opt/mailinabox
git fetch --all -q
CURRENT_TAG=$(git describe --tags --exact-match 2>/dev/null || echo "")

if [ "${CURRENT_TAG}" != "${MIAB_TAG}" ]; then
  echo "Checking out Mail-in-a-Box version: ${MIAB_TAG}"
  git checkout "${MIAB_TAG}" -q
else
  echo "Already on correct version: ${MIAB_TAG}"
fi

# ==========================================
# Optional Backup Restore (idempotent)
# ==========================================
if [[ -n "${RESTORE_PREFIX}" ]]; then
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
echo "Running Mail-in-a-Box installer..."
cd /opt/mailinabox
bash -x setup/start.sh 2>&1 | tee /tmp/mailinabox_debug.log || {
  echo "Warning: MIAB installer encountered errors. Check /tmp/mailinabox_debug.log"
}

# ==========================================
# SES Relay Configuration (idempotent)
# ==========================================
if [[ "${SES_RELAY}" == "true" ]]; then
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
    
    # Update hosts file
    if ! grep -q "${PRIMARY_HOSTNAME}" /etc/hosts; then
      echo "127.0.0.1 ${PRIMARY_HOSTNAME}" >> /etc/hosts
    fi
    
    echo "SES relay configuration complete"
  else
    echo "Warning: SES SMTP credentials not found in SSM. Skipping relay configuration."
  fi
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
if ! command -v duplicity >/dev/null 2>&1 || ! duplicity --version | grep -q "duplicity"; then
  echo "Installing duplicity via snap..."
  apt-get remove -y duplicity || true
  rm -f /etc/apt/sources.list.d/duplicity-team-ubuntu-duplicity-release-git-jammy.list || true
  apt-get update -qq
  snap install duplicity --classic || true
  ln -sf /snap/bin/duplicity /usr/bin/duplicity || true
fi

# Run initial backup if MIAB is configured
if [ -f "/opt/mailinabox/management/backup.py" ]; then
  echo "Running initial backup..."
  /opt/mailinabox/management/backup.py || echo "Warning: Initial backup failed or skipped"
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
fi
