#!/bin/bash

# Cleanup keys script for askdaokapra.com
# This script invokes the main cleanup-keys.sh with the askdaokapra.com domain

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ADMIN_DIR="${SCRIPT_DIR}/../administration"

echo "Cleaning up keys for askdaokapra.com..."
echo "Invoking cleanup-keys.sh from administration folder..."

# Call the main cleanup-keys.sh script with askdaokapra.com domain
exec "${ADMIN_DIR}/cleanup-keys.sh" "askdaokapra.com" 