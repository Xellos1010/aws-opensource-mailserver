#!/bin/bash

# Setup SSH access script for askdaokapra.com
# This script invokes the main setup-ssh-access.sh with the askdaokapra.com domain

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ADMIN_DIR="${SCRIPT_DIR}/../administration"

echo "Setting up SSH access for askdaokapra.com..."
echo "Invoking setup-ssh-access.sh from administration folder..."

# Call the main setup-ssh-access.sh script with askdaokapra.com domain
exec "${ADMIN_DIR}/setup-ssh-access.sh" "askdaokapra.com" 