#!/usr/bin/env bash
set -Eeuo pipefail
IFS=$'\n\t'

# Mail send/receive smoke test for Mail-in-a-Box
# - Sends a test email to admin@{domain} via on-box sendmail
# - Checks mail logs for delivery and scans admin mailbox for the message

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

DEFAULT_DOMAIN="emcnotary.com"
DOMAIN_NAME="${1:-$DEFAULT_DOMAIN}"

if ! [[ $DOMAIN_NAME =~ ^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$ ]]; then
  echo "Error: Invalid domain: $DOMAIN_NAME" >&2
  exit 1
fi

case "$DOMAIN_NAME" in
  askdaokapra.com) SUBPROJECT="askdaokapra" ;;
  emcnotary.com) SUBPROJECT="emcnotary" ;;
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
KEY_FILE="$HOME/.ssh/${DOMAIN_NAME}-keypair.pem"

if [ ! -f "$IP_FILE" ]; then echo "Error: Missing $IP_FILE" >&2; exit 1; fi
if [ ! -f "$KEY_FILE" ]; then echo "Error: Missing $KEY_FILE" >&2; exit 1; fi
chmod 400 "$KEY_FILE"

INSTANCE_IP="$(cat "$IP_FILE" | tr -d '\n\r' | xargs)"
TEST_ID="SMOKE-$(date +%s)"
FROM="admin@${DOMAIN_NAME}"
TO="admin@${DOMAIN_NAME}"
SUBJECT="MIAB Smoke Test ${TEST_ID}"
BODY="This is a MIAB smoke test ${TEST_ID} for ${DOMAIN_NAME}."

echo "Sending test email to ${TO} on ${DOMAIN_NAME} (ID: ${TEST_ID})"

# Compose email locally and pipe into sendmail on the server to avoid quoting issues
{
  printf 'From: %s\n' "$FROM"
  printf 'To: %s\n' "$TO"
  printf 'Subject: %s\n' "$SUBJECT"
  printf '\n'
  printf '%s\n' "$BODY"
} | ssh -i "$KEY_FILE" -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null "ubuntu@${INSTANCE_IP}" "/usr/sbin/sendmail -t"

echo "Waiting for delivery..."
sleep 8

echo "Checking mail logs for test ID..."
ssh -i "$KEY_FILE" -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null "ubuntu@${INSTANCE_IP}" /bin/bash -s -- "$TEST_ID" <<'EOSSH'
set -e
TID="$1"
sudo grep -F "$TID" /var/log/mail.log /var/log/syslog 2>/dev/null | tail -n 50 || true
EOSSH

echo "Scanning admin mailbox for the message..."
ssh -i "$KEY_FILE" -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null "ubuntu@${INSTANCE_IP}" /bin/bash -s -- "$DOMAIN_NAME" "$TEST_ID" <<'EOSSH'
set -e
DOMAIN="$1"
TID="$2"
BASE="/home/user-data/mail/mailboxes/${DOMAIN}/admin"
for D in cur new; do
  MAILDIR="$BASE/$D"
  if [ -d "$MAILDIR" ]; then
    echo "Searching $MAILDIR..."
    grep -RIl "$TID" "$MAILDIR" | head -n 5 || true
  fi
done
EOSSH

echo "Smoke test completed for ${DOMAIN_NAME}. Review logs above for delivery confirmation."

