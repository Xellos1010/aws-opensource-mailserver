#!/bin/bash

# Start instance and wait script for k3frame.com
# This script invokes the main start-instance-and-wait.sh with the k3frame.com domain

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ADMIN_DIR="${SCRIPT_DIR}/../administration"

echo "Starting instance and waiting for k3frame.com mailserver..."
echo "Invoking start-instance-and-wait.sh from administration folder..."

# Call the main start-instance-and-wait.sh script with k3frame.com domain
exec "${ADMIN_DIR}/start-instance-and-wait.sh" "k3frame.com"






