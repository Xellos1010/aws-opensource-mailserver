#!/bin/bash

# Setup SSH access script for emcnotary.com
# This script invokes the main setup-ssh-access.sh with the emcnotary.com domain

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ADMIN_DIR="${SCRIPT_DIR}/../administration"

echo "Setting up SSH access for emcnotary.com..."
echo "Invoking setup-ssh-access.sh from administration folder..."

# Call the main setup-ssh-access.sh script with emcnotary.com domain
exec "${ADMIN_DIR}/setup-ssh-access.sh" "emcnotary.com" 