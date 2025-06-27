#!/bin/bash

# Get SES config script for telassistmd.com
# This script invokes the main get-ses-config.sh with the telassistmd.com domain

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ADMIN_DIR="${SCRIPT_DIR}/../administration"

echo "Getting SES configuration for telassistmd.com..."
echo "Invoking get-ses-config.sh from administration folder..."

# Call the main get-ses-config.sh script with telassistmd.com domain
exec "${ADMIN_DIR}/get-ses-config.sh" "telassistmd.com" 