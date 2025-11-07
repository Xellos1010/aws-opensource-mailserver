#!/bin/bash

# Get SES config script for askdaokapra.com
# This script invokes the main get-ses-config.sh with the askdaokapra.com domain

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ADMIN_DIR="${SCRIPT_DIR}/../administration"

echo "Getting SES configuration for askdaokapra.com..."
echo "Invoking get-ses-config.sh from administration folder..."

# Call the main get-ses-config.sh script with askdaokapra.com domain
exec "${ADMIN_DIR}/get-ses-config.sh" "askdaokapra.com" 