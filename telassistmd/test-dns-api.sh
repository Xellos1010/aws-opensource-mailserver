#!/bin/bash

# Test DNS API script for telassistmd.com
# This script invokes the main test-dns-api.sh with the telassistmd.com domain

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ADMIN_DIR="${SCRIPT_DIR}/../administration"

echo "Testing DNS API for telassistmd.com..."
echo "Invoking test-dns-api.sh from administration folder..."

# Call the main test-dns-api.sh script with telassistmd.com domain
exec "${ADMIN_DIR}/test-dns-api.sh" "telassistmd.com" 