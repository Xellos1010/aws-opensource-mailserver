#!/bin/bash

# Generate SES SMTP credentials script for k3frame.com
# This script invokes the main generate_ses_smtp_credentials.py with the k3frame.com domain

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ADMIN_DIR="${SCRIPT_DIR}/../administration"

echo "Generating SES SMTP credentials for k3frame.com..."
echo "Invoking generate_ses_smtp_credentials.py from administration folder..."

# Call the main generate_ses_smtp_credentials.py script with k3frame.com domain
exec python3 "${ADMIN_DIR}/generate_ses_smtp_credentials.py" --domain "k3frame.com" 