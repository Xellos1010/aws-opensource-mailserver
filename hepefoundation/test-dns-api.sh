#!/bin/bash

# Test DNS API script for hepefoundation.org
# This script invokes the main test-dns-api.sh with the hepefoundation.org domain

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ADMIN_DIR="${SCRIPT_DIR}/../administration"

echo "Testing DNS API for hepefoundation.org..."
echo "Invoking test-dns-api.sh from administration folder..."

# Call the main test-dns-api.sh script with hepefoundation.org domain
exec "${ADMIN_DIR}/test-dns-api.sh" "hepefoundation.org" 