#!/bin/bash

# Delete stack script for telassistmd.com
# This script invokes the main delete-stack.sh with the telassistmd.com domain

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ADMIN_DIR="${SCRIPT_DIR}/../administration"

echo "Deleting mailserver infrastructure for telassistmd.com..."
echo "Invoking delete-stack.sh from administration folder..."

# Call the main delete-stack.sh script with telassistmd.com domain
exec "${ADMIN_DIR}/delete-stack.sh" "telassistmd.com" 