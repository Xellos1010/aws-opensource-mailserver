#!/bin/bash

# Get SES config script for emcnotary.com
# This script invokes the main get-ses-config.sh with the emcnotary.com domain

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ADMIN_DIR="${SCRIPT_DIR}/../administration"

echo "Getting SES configuration for emcnotary.com..."
echo "Invoking get-ses-config.sh from administration folder..."

# Call the main get-ses-config.sh script with emcnotary.com domain
exec "${ADMIN_DIR}/get-ses-config.sh" "emcnotary.com" 