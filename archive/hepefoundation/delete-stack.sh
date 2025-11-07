#!/bin/bash

# Delete stack script for hepefoundation.org
# This script invokes the main delete-stack.sh with the hepefoundation.org domain

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ADMIN_DIR="${SCRIPT_DIR}/../administration"

echo "Deleting mailserver infrastructure for hepefoundation.org..."
echo "Invoking delete-stack.sh from administration folder..."

# Call the main delete-stack.sh script with hepefoundation.org domain
exec "${ADMIN_DIR}/delete-stack.sh" "hepefoundation.org" 