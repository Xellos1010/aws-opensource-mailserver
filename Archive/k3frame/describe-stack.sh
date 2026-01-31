#!/bin/bash

# Describe stack script for k3frame.com
# This script invokes the main describe-stack.sh with the k3frame.com domain

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ADMIN_DIR="${SCRIPT_DIR}/../administration"

echo "Describing mailserver infrastructure for k3frame.com..."
echo "Invoking describe-stack.sh from administration folder..."

# Call the main describe-stack.sh script with k3frame.com domain
exec "${ADMIN_DIR}/describe-stack.sh" "k3frame.com" 