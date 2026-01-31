#!/bin/bash

# Cleanup keys script for k3frame.com
# This script invokes the main cleanup-keys.sh with the k3frame.com domain

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ADMIN_DIR="${SCRIPT_DIR}/../administration"

echo "Cleaning up keys for k3frame.com..."
echo "Invoking cleanup-keys.sh from administration folder..."

# Call the main cleanup-keys.sh script with k3frame.com domain
exec "${ADMIN_DIR}/cleanup-keys.sh" "k3frame.com" 