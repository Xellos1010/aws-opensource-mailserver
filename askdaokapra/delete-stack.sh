#!/bin/bash

# Delete stack script for askdaokapra.com
# This script invokes the main delete-stack.sh with the askdaokapra.com domain

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ADMIN_DIR="${SCRIPT_DIR}/../administration"

echo "Deleting mailserver infrastructure for askdaokapra.com..."
echo "Invoking delete-stack.sh from administration folder..."

# Call the main delete-stack.sh script with askdaokapra.com domain
exec "${ADMIN_DIR}/delete-stack.sh" "askdaokapra.com" 