#!/bin/bash

# Start instance and wait script for askdaokapra.com
# This script invokes the main start-instance-and-wait.sh with the askdaokapra.com domain

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ADMIN_DIR="${SCRIPT_DIR}/../administration"

echo "Starting instance and waiting for askdaokapra.com mailserver..."
echo "Invoking start-instance-and-wait.sh from administration folder..."

# Call the main start-instance-and-wait.sh script with askdaokapra.com domain
exec "${ADMIN_DIR}/start-instance-and-wait.sh" "askdaokapra.com"






