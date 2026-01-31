#!/bin/bash

# Delete stack script for k3frame.com
# This script invokes the main delete-stack.sh with the k3frame.com domain

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ADMIN_DIR="${SCRIPT_DIR}/../administration"

echo "Deleting mailserver infrastructure for k3frame.com..."
echo "Invoking delete-stack.sh from administration folder..."

# Call the main delete-stack.sh script with k3frame.com domain
exec "${ADMIN_DIR}/delete-stack.sh" "k3frame.com" 