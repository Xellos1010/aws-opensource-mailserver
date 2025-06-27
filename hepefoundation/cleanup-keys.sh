#!/bin/bash

# Cleanup keys script for hepefoundation.org
# This script invokes the main cleanup-keys.sh with the hepefoundation.org domain

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ADMIN_DIR="${SCRIPT_DIR}/../administration"

echo "Cleaning up keys for hepefoundation.org..."
echo "Invoking cleanup-keys.sh from administration folder..."

# Call the main cleanup-keys.sh script with hepefoundation.org domain
exec "${ADMIN_DIR}/cleanup-keys.sh" "hepefoundation.org" 