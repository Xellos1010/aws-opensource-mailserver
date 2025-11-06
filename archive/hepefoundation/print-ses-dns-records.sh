#!/bin/bash

# Print SES DNS records script for hepefoundation.org
# This script invokes the main print-ses-dns-records.sh with the hepefoundation.org domain

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ADMIN_DIR="${SCRIPT_DIR}/../administration"

echo "Printing SES DNS records for hepefoundation.org..."
echo "Invoking print-ses-dns-records.sh from administration folder..."

# Call the main print-ses-dns-records.sh script with hepefoundation.org domain
exec "${ADMIN_DIR}/print-ses-dns-records.sh" "hepefoundation.org" 