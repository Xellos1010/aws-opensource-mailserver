#!/bin/bash

# Check memory and stop instance script for hepefoundation.org
# This script invokes the main check-memory-and-stop-instance.sh with the hepefoundation.org domain

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ADMIN_DIR="${SCRIPT_DIR}/../administration"

echo "Checking memory and stopping instance for hepefoundation.org mailserver..."
echo "Invoking check-memory-and-stop-instance.sh from administration folder..."

# Call the main check-memory-and-stop-instance.sh script with hepefoundation.org domain
exec "${ADMIN_DIR}/check-memory-and-stop-instance.sh" "hepefoundation.org"






