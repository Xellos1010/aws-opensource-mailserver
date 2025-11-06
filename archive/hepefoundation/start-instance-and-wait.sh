#!/bin/bash

# Start instance and wait script for hepefoundation.org
# This script invokes the main start-instance-and-wait.sh with the hepefoundation.org domain

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ADMIN_DIR="${SCRIPT_DIR}/../administration"

echo "Starting instance and waiting for hepefoundation.org mailserver..."
echo "Invoking start-instance-and-wait.sh from administration folder..."

# Call the main start-instance-and-wait.sh script with hepefoundation.org domain
exec "${ADMIN_DIR}/start-instance-and-wait.sh" "hepefoundation.org"






