#!/bin/bash

# Check memory and stop instance script for emcnotary.com
# This script invokes the main check-memory-and-stop-instance.sh with the emcnotary.com domain

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ADMIN_DIR="${SCRIPT_DIR}/../administration"

echo "Checking memory and stopping instance for emcnotary.com mailserver..."
echo "Invoking check-memory-and-stop-instance.sh from administration folder..."

# Call the main check-memory-and-stop-instance.sh script with emcnotary.com domain
exec "${ADMIN_DIR}/check-memory-and-stop-instance.sh" "emcnotary.com"






