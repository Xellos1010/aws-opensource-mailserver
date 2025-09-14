#!/bin/bash

# Deploy script for emcnotary.com
# This script invokes the main deploy-stack.sh with the emcnotary.com domain

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ADMIN_DIR="${SCRIPT_DIR}/../administration"

echo "Deploying mailserver infrastructure for emcnotary.com..."
echo "Invoking deploy-stack.sh from administration folder..."

# Call the main deploy-stack.sh script with emcnotary.com domain
exec "${ADMIN_DIR}/deploy-stack.sh" "emcnotary.com" 