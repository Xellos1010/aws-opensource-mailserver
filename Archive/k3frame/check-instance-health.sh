#!/usr/bin/env bash
# Check instance health script for k3frame.com
# This script invokes the main check-instance-health.sh with the k3frame.com domain

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ADMIN_DIR="${SCRIPT_DIR}/../administration"

echo "Checking instance health for k3frame.com..."
echo "Invoking check-instance-health.sh from administration folder..."

# Call the main check-instance-health.sh script with k3frame.com domain
exec "${ADMIN_DIR}/check-instance-health.sh" "k3frame.com" "$@"














