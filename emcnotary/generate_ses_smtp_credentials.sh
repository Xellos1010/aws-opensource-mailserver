#!/bin/bash

# Generate SES SMTP credentials script for emcnotary.com
# This script invokes the main generate_ses_smtp_credentials.sh with the emcnotary.com domain

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ADMIN_DIR="${SCRIPT_DIR}/../administration"

echo "Generating SES SMTP credentials for emcnotary.com..."
echo "Invoking generate_ses_smtp_credentials.sh from administration folder..."

# Call the main generate_ses_smtp_credentials.sh script with emcnotary.com domain
exec "${ADMIN_DIR}/generate_ses_smtp_credentials.sh" "emcnotary.com" 