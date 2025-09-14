#!/bin/bash

# Deploy script for askdaokapra.com
# This script invokes the main deploy-stack.sh with the askdaokapra.com domain

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ADMIN_DIR="${SCRIPT_DIR}/../administration"

echo "Deploying mailserver infrastructure for askdaokapra.com..."
echo "Invoking deploy-stack.sh from administration folder..."

# Call the main deploy-stack.sh script with askdaokapra.com domain
exec "${ADMIN_DIR}/deploy-stack.sh" "askdaokapra.com" 