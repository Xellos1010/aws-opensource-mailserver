#!/usr/bin/env bash
set -Eeuo pipefail
IFS=$'\n\t'

# Enforce Mail-in-a-Box settings for SES relay and basic mail readiness
# - Retrieves SMTP relay creds from SSM (per stack)
# - SSH to instance, writes /home/user-data/mail/config, restarts MIAB
# - Verifies DNS records via local dns-admin.sh verify

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

DEFAULT_DOMAIN="emcnotary.com"
DEFAULT_REGION="us-east-1"
DEFAULT_PROFILE="hepe-admin-mfa"

DOMAIN_NAME="$DEFAULT_DOMAIN"
REGION="$DEFAULT_REGION"
PROFILE="$DEFAULT_PROFILE"
VERBOSE=false

usage() {
  cat <<EOF
Usage: $(basename "$0") [-d domain] [-r region] [-p profile]

Options:
  -d DOMAIN   Domain (default: ${DEFAULT_DOMAIN})
  -r REGION   AWS region (default: ${DEFAULT_REGION})
  -p PROFILE  AWS CLI profile (default: ${DEFAULT_PROFILE})
  -h          Help

Actions:
  - Retrieves SMTP relay creds from SSM for stack {domain}-mailserver
  - Writes MIAB mail/config on the instance and restarts daemon
  - Runs dns verification via dns-admin.sh verify
EOF
}

while getopts ":d:r:p:hv" opt; do
  case ${opt} in
    d) DOMAIN_NAME="$OPTARG" ;;
    r) REGION="$OPTARG" ;;
    p) PROFILE="$OPTARG" ;;
    v) VERBOSE=true ;;
    h) usage; exit 0 ;;
    :) echo "Error: -$OPTARG requires an argument" >&2; usage; exit 1 ;;
    \?) echo "Error: Invalid option -$OPTARG" >&2; usage; exit 1 ;;
  esac
done

if ! [[ $DOMAIN_NAME =~ ^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$ ]]; then
  echo "Error: Invalid domain name format: $DOMAIN_NAME" >&2
  exit 1
fi

STACK_NAME="$(echo "$DOMAIN_NAME" | sed 's/\./-/g')-mailserver"

echo "Domain: $DOMAIN_NAME"
echo "Stack:  $STACK_NAME"
echo "Region: $REGION"

require_cmd() { command -v "$1" >/dev/null 2>&1 || { echo "Error: $1 not found" >&2; exit 1; }; }
require_cmd aws
require_cmd ssh
require_cmd scp

# Locate subproject directory and IP file similar to master scripts
case "$DOMAIN_NAME" in
  askdaokapra.com) SUBPROJECT="askdaokapra" ;;
  emcnotary.com)   SUBPROJECT="emcnotary" ;;
  hepefoundation.org) SUBPROJECT="hepefoundation" ;;
  telassistmd.com) SUBPROJECT="telassistmd" ;;
  *) echo "Error: Unknown domain $DOMAIN_NAME" >&2; exit 1 ;;
esac

if [ "$SUBPROJECT" = "hepefoundation" ]; then
  SUB_DIR="$ROOT_DIR/$SUBPROJECT/hepeFoundation-Mail-Server-Files"
else
  SUB_DIR="$ROOT_DIR/$SUBPROJECT"
fi

IP_FILE="$SUB_DIR/ec2_ipaddress.txt"
if [ ! -f "$IP_FILE" ]; then
  echo "Error: Instance IP file not found at $IP_FILE" >&2
  exit 1
fi
INSTANCE_IP="$(cat "$IP_FILE" | tr -d '\n\r' | xargs)"
if [ -z "$INSTANCE_IP" ]; then
  echo "Error: Could not read instance IP" >&2
  exit 1
fi

KEY_FILE="$HOME/.ssh/${DOMAIN_NAME}-keypair.pem"
if [ ! -f "$KEY_FILE" ]; then
  echo "Error: SSH key not found at $KEY_FILE. Run setup-ssh-access.sh first." >&2
  exit 1
fi
chmod 400 "$KEY_FILE"

echo "Retrieving SMTP relay credentials from SSM..."
SMTP_USERNAME=$(aws ssm get-parameter \
  --profile "$PROFILE" \
  --region "$REGION" \
  --name "/smtp-username-${STACK_NAME}" \
  --with-decryption \
  --query Parameter.Value \
  --output text)

SMTP_PASSWORD=$(aws ssm get-parameter \
  --profile "$PROFILE" \
  --region "$REGION" \
  --name "/smtp-password-${STACK_NAME}" \
  --with-decryption \
  --query Parameter.Value \
  --output text)

if [ -z "$SMTP_USERNAME" ] || [ -z "$SMTP_PASSWORD" ]; then
  echo "Error: Failed to retrieve SMTP credentials from SSM" >&2
  exit 1
fi

SMTP_RELAY_HOST="email-smtp.${REGION}.amazonaws.com"
SMTP_RELAY_PORT="587"

TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

cat >"$TMP_DIR/mail-config" <<EOF
[mail]
smtp_relay_enable = true
smtp_relay_host = ${SMTP_RELAY_HOST}
smtp_relay_port = ${SMTP_RELAY_PORT}
smtp_relay_username = ${SMTP_USERNAME}
smtp_relay_password = ${SMTP_PASSWORD}
EOF

echo "Uploading and applying MIAB mail/config..."
scp -i "$KEY_FILE" -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null "$TMP_DIR/mail-config" "ubuntu@${INSTANCE_IP}:~/mail-config"

ssh -i "$KEY_FILE" -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null "ubuntu@${INSTANCE_IP}" <<'EOSSH'
set -e
sudo mkdir -p /home/user-data/mail
sudo mv ~/mail-config /home/user-data/mail/config
sudo chown root:root /home/user-data/mail/config
sudo chmod 600 /home/user-data/mail/config
if [ -x /opt/mailinabox/management/mailinabox-daemon ]; then
  sudo /opt/mailinabox/management/mailinabox-daemon restart || true
elif [ -x /usr/local/bin/mailinabox ]; then
  sudo /usr/local/bin/mailinabox restart || true
else
  echo "Warning: MIAB daemon script not found; please restart services manually" >&2
fi
EOSSH

echo "Verification: running dns-admin verify..."
"${SCRIPT_DIR}/dns-admin.sh" -d "$DOMAIN_NAME" verify || {
  echo "Warning: DNS verification reported issues" >&2
}

echo "MIAB settings enforcement completed for $DOMAIN_NAME"

