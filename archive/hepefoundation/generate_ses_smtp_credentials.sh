#!/bin/bash

# Generate SES SMTP credentials script for hepefoundation.org
# This script invokes the main generate_ses_smtp_credentials.py with the hepefoundation.org domain

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ADMIN_DIR="${SCRIPT_DIR}/../administration"

echo "Generating SES SMTP credentials for hepefoundation.org..."
echo "Invoking generate_ses_smtp_credentials.py from administration folder..."

# Call the main generate_ses_smtp_credentials.py script with hepefoundation.org domain
exec python3 "${ADMIN_DIR}/generate_ses_smtp_credentials.py" --domain "hepefoundation.org" 