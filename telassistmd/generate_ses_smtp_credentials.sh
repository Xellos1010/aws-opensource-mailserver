#!/bin/bash

# Generate SES SMTP credentials script for telassistmd.com
# This script invokes the main generate_ses_smtp_credentials.py with the telassistmd.com domain

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ADMIN_DIR="${SCRIPT_DIR}/../administration"

echo "Generating SES SMTP credentials for telassistmd.com..."
echo "Invoking generate_ses_smtp_credentials.py from administration folder..."

# Call the main generate_ses_smtp_credentials.py script with telassistmd.com domain
exec python3 "${ADMIN_DIR}/generate_ses_smtp_credentials.py" --domain "telassistmd.com" 