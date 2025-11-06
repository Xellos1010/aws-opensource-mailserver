#!/bin/bash

# Get SES config script for hepefoundation.org
# This script invokes the main get-ses-config.sh with the hepefoundation.org domain

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ADMIN_DIR="${SCRIPT_DIR}/../administration"

echo "Getting SES configuration for hepefoundation.org..."
echo "Invoking get-ses-config.sh from administration folder..."

# Call the main get-ses-config.sh script with hepefoundation.org domain
exec "${ADMIN_DIR}/get-ses-config.sh" "hepefoundation.org" 