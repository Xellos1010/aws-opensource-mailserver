#!/bin/bash

# Describe stack script for hepefoundation.org
# This script invokes the main describe-stack.sh with the hepefoundation.org domain

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ADMIN_DIR="${SCRIPT_DIR}/../administration"

echo "Describing mailserver infrastructure for hepefoundation.org..."
echo "Invoking describe-stack.sh from administration folder..."

# Call the main describe-stack.sh script with hepefoundation.org domain
exec "${ADMIN_DIR}/describe-stack.sh" "hepefoundation.org" 