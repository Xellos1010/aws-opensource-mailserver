#!/bin/bash

# Set SES DNS records script for askdaokapra.com
# This script invokes the main set-ses-dns-records.sh with the askdaokapra.com domain

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ADMIN_DIR="${SCRIPT_DIR}/../administration"

echo "Setting SES DNS records for askdaokapra.com..."
echo "Invoking set-ses-dns-records.sh from administration folder..."

# Call the main set-ses-dns-records.sh script with askdaokapra.com domain
exec "${ADMIN_DIR}/set-ses-dns-records.sh" "askdaokapra.com" 