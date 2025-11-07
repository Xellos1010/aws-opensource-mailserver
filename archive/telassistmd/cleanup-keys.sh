#!/bin/bash

# Cleanup keys script for telassistmd.com
# This script invokes the main cleanup-keys.sh with the telassistmd.com domain

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ADMIN_DIR="${SCRIPT_DIR}/../administration"

echo "Cleaning up keys for telassistmd.com..."
echo "Invoking cleanup-keys.sh from administration folder..."

# Call the main cleanup-keys.sh script with telassistmd.com domain
exec "${ADMIN_DIR}/cleanup-keys.sh" "telassistmd.com" 