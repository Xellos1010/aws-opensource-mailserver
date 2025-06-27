#!/bin/bash

# Setup SSH access script for telassistmd.com
# This script invokes the main setup-ssh-access.sh with the telassistmd.com domain

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ADMIN_DIR="${SCRIPT_DIR}/../administration"

echo "Setting up SSH access for telassistmd.com..."
echo "Invoking setup-ssh-access.sh from administration folder..."

# Call the main setup-ssh-access.sh script with telassistmd.com domain
exec "${ADMIN_DIR}/setup-ssh-access.sh" "telassistmd.com" 