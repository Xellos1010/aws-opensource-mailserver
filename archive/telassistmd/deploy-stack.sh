#!/bin/bash

# Deploy script for telassistmd.com
# This script invokes the main deploy-stack.sh with the telassistmd.com domain

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ADMIN_DIR="${SCRIPT_DIR}/../administration"

echo "Deploying mailserver infrastructure for telassistmd.com..."
echo "Invoking deploy-stack.sh from administration folder..."

# Call the main deploy-stack.sh script with telassistmd.com domain
exec "${ADMIN_DIR}/deploy-stack.sh" "telassistmd.com" 