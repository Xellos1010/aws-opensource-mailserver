#!/bin/bash

# Get admin password script for telassistmd.com
# This script invokes the main get-admin-password.sh with the telassistmd.com domain

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ADMIN_DIR="${SCRIPT_DIR}/../administration"

echo "Getting admin password for telassistmd.com..."
echo "Invoking get-admin-password.sh from administration folder..."

# Call the main get-admin-password.sh script with telassistmd.com domain
exec "${ADMIN_DIR}/get-admin-password.sh" "telassistmd.com" 