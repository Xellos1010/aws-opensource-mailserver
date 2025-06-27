#!/bin/bash

# Print SES DNS records script for telassistmd.com
# This script invokes the main print-ses-dns-records.sh with the telassistmd.com domain

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ADMIN_DIR="${SCRIPT_DIR}/../administration"

echo "Printing SES DNS records for telassistmd.com..."
echo "Invoking print-ses-dns-records.sh from administration folder..."

# Call the main print-ses-dns-records.sh script with telassistmd.com domain
exec "${ADMIN_DIR}/print-ses-dns-records.sh" "telassistmd.com" 