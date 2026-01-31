#!/bin/bash

# Print SES DNS records script for k3frame.com
# This script invokes the main print-ses-dns-records.sh with the k3frame.com domain

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ADMIN_DIR="${SCRIPT_DIR}/../administration"

echo "Printing SES DNS records for k3frame.com..."
echo "Invoking print-ses-dns-records.sh from administration folder..."

# Call the main print-ses-dns-records.sh script with k3frame.com domain
exec "${ADMIN_DIR}/print-ses-dns-records.sh" "k3frame.com" 