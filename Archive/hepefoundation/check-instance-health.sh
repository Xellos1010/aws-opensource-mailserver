#!/usr/bin/env bash
# Check instance health script for hepefoundation.org
# This script invokes the main check-instance-health.sh with the hepefoundation.org domain

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ADMIN_DIR="${SCRIPT_DIR}/../administration"

echo "Checking instance health for hepefoundation.org..."
echo "Invoking check-instance-health.sh from administration folder..."

# Call the main check-instance-health.sh script with hepefoundation.org domain
exec "${ADMIN_DIR}/check-instance-health.sh" "hepefoundation.org" "$@"














