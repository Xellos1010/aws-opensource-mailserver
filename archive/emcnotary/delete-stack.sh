#!/bin/bash

# Delete script for emcnotary.com
# This script invokes the main delete-stack.sh with the emcnotary.com domain

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ADMIN_DIR="${SCRIPT_DIR}/../administration"

echo "Deleting mailserver infrastructure for emcnotary.com..."
echo "Invoking delete-stack.sh from administration folder..."

# Call the main delete-stack.sh script with emcnotary.com domain
exec "${ADMIN_DIR}/delete-stack.sh" "emcnotary.com" 