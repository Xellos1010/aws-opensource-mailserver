#!/bin/bash

# Setup SSH access script for k3frame.com
# This script invokes the main setup-ssh-access.sh with the k3frame.com domain

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ADMIN_DIR="${SCRIPT_DIR}/../administration"

echo "Setting up SSH access for k3frame.com..."
echo "Invoking setup-ssh-access.sh from administration folder..."

# Call the main setup-ssh-access.sh script with k3frame.com domain
exec "${ADMIN_DIR}/setup-ssh-access.sh" "k3frame.com" 