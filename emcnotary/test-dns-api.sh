#!/bin/bash

# Test DNS API script for emcnotary.com
# This script invokes the main test-dns-api.sh with the emcnotary.com domain

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ADMIN_DIR="${SCRIPT_DIR}/../administration"

echo "Testing DNS API for emcnotary.com..."
echo "Invoking test-dns-api.sh from administration folder..."

# Call the main test-dns-api.sh script with emcnotary.com domain
exec "${ADMIN_DIR}/test-dns-api.sh" "emcnotary.com" 