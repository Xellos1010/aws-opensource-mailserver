#!/bin/bash

# Describe stack script for telassistmd.com
# This script invokes the main describe-stack.sh with the telassistmd.com domain

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ADMIN_DIR="${SCRIPT_DIR}/../administration"

echo "Describing mailserver infrastructure for telassistmd.com..."
echo "Invoking describe-stack.sh from administration folder..."

# Call the main describe-stack.sh script with telassistmd.com domain
exec "${ADMIN_DIR}/describe-stack.sh" "telassistmd.com" 