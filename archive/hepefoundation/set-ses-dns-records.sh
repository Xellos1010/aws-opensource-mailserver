#!/bin/bash

# Set SES DNS records script for hepefoundation.org
# This script invokes the main set-ses-dns-records.sh with the hepefoundation.org domain

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ADMIN_DIR="${SCRIPT_DIR}/../administration"

echo "Setting SES DNS records for hepefoundation.org..."
echo "Invoking set-ses-dns-records.sh from administration folder..."

# Call the main set-ses-dns-records.sh script with hepefoundation.org domain
exec "${ADMIN_DIR}/set-ses-dns-records.sh" "hepefoundation.org" 