#!/bin/bash

# Get admin password script for askdaokapra.com
# This script invokes the main get-admin-password.sh with the askdaokapra.com domain

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ADMIN_DIR="${SCRIPT_DIR}/../administration"

echo "Getting admin password for askdaokapra.com..."
echo "Invoking get-admin-password.sh from administration folder..."

# Call the main get-admin-password.sh script with askdaokapra.com domain
exec "${ADMIN_DIR}/get-admin-password.sh" "askdaokapra.com" 