#!/bin/bash

# Get SES config script for k3frame.com
# This script invokes the main get-ses-config.sh with the k3frame.com domain

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ADMIN_DIR="${SCRIPT_DIR}/../administration"

echo "Getting SES configuration for k3frame.com..."
echo "Invoking get-ses-config.sh from administration folder..."

# Call the main get-ses-config.sh script with k3frame.com domain
exec "${ADMIN_DIR}/get-ses-config.sh" "k3frame.com" 