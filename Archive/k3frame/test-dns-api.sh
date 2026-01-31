#!/bin/bash

# Test DNS API script for k3frame.com
# This script invokes the main test-dns-api.sh with the k3frame.com domain

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ADMIN_DIR="${SCRIPT_DIR}/../administration"

echo "Testing DNS API for k3frame.com..."
echo "Invoking test-dns-api.sh from administration folder..."

# Call the main test-dns-api.sh script with k3frame.com domain
exec "${ADMIN_DIR}/test-dns-api.sh" "k3frame.com" 