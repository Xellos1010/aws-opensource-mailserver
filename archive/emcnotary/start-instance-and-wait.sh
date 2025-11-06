#!/bin/bash

# Start instance and wait script for emcnotary.com
# This script invokes the main start-instance-and-wait.sh with the emcnotary.com domain

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ADMIN_DIR="${SCRIPT_DIR}/../administration"

echo "Starting instance and waiting for emcnotary.com mailserver..."
echo "Invoking start-instance-and-wait.sh from administration folder..."

# Call the main start-instance-and-wait.sh script with emcnotary.com domain
exec "${ADMIN_DIR}/start-instance-and-wait.sh" "emcnotary.com"






