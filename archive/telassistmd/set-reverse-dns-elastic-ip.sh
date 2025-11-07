#!/bin/bash

# Set reverse DNS for Elastic IP script for telassistmd.com
# This script invokes the main set-reverse-dns-elastic-ip.sh with the telassistmd.com domain

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ADMIN_DIR="${SCRIPT_DIR}/../administration"

echo "Setting reverse DNS for Elastic IP for telassistmd.com..."
echo "Invoking set-reverse-dns-elastic-ip.sh from administration folder..."

# Call the main set-reverse-dns-elastic-ip.sh script with telassistmd.com domain
exec "${ADMIN_DIR}/set-reverse-dns-elastic-ip.sh" "telassistmd.com" 