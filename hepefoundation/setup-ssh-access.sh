#!/bin/bash

# Setup SSH access script for hepefoundation.org
# This script invokes the main setup-ssh-access.sh with the hepefoundation.org domain

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ADMIN_DIR="${SCRIPT_DIR}/../administration"

echo "Setting up SSH access for hepefoundation.org..."
echo "Invoking setup-ssh-access.sh from administration folder..."

# Call the main setup-ssh-access.sh script with hepefoundation.org domain
exec "${ADMIN_DIR}/setup-ssh-access.sh" "hepefoundation.org" 