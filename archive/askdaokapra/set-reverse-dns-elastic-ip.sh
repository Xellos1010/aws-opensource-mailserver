#!/bin/bash

# Set reverse DNS for Elastic IP script for askdaokapra.com
# This script invokes the main set-reverse-dns-elastic-ip.sh with the askdaokapra.com domain

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ADMIN_DIR="${SCRIPT_DIR}/../administration"

echo "Setting reverse DNS for Elastic IP for askdaokapra.com..."
echo "Invoking set-reverse-dns-elastic-ip.sh from administration folder..."

# Call the main set-reverse-dns-elastic-ip.sh script with askdaokapra.com domain
exec "${ADMIN_DIR}/set-reverse-dns-elastic-ip.sh" "askdaokapra.com" 