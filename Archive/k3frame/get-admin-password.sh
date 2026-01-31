#!/bin/bash

# Get admin password script for k3frame.com
# This script invokes the main get-admin-password.sh with the k3frame.com domain

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ADMIN_DIR="${SCRIPT_DIR}/../administration"

echo "Getting admin password for k3frame.com..."
echo "Invoking get-admin-password.sh from administration folder..."

# Call the main get-admin-password.sh script with k3frame.com domain
exec "${ADMIN_DIR}/get-admin-password.sh" "k3frame.com" 