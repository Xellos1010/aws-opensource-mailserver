#!/bin/bash

# Get admin password script for hepefoundation.org
# This script invokes the main get-admin-password.sh with the hepefoundation.org domain

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ADMIN_DIR="${SCRIPT_DIR}/../administration"

echo "Getting admin password for hepefoundation.org..."
echo "Invoking get-admin-password.sh from administration folder..."

# Call the main get-admin-password.sh script with hepefoundation.org domain
exec "${ADMIN_DIR}/get-admin-password.sh" "hepefoundation.org" 