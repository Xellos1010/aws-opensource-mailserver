#!/bin/bash

# Describe stack script for emcnotary.com
# This script invokes the main describe-stack.sh with the emcnotary.com domain

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ADMIN_DIR="${SCRIPT_DIR}/../administration"

echo "Describing mailserver infrastructure for emcnotary.com..."
echo "Invoking describe-stack.sh from administration folder..."

# Call the main describe-stack.sh script with emcnotary.com domain
exec "${ADMIN_DIR}/describe-stack.sh" "emcnotary.com" 