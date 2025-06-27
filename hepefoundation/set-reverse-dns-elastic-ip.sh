#!/bin/bash

# Set reverse DNS for Elastic IP script for hepefoundation.org
# This script invokes the main set-reverse-dns-elastic-ip.sh with the hepefoundation.org domain

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ADMIN_DIR="${SCRIPT_DIR}/../administration"

echo "Setting reverse DNS for Elastic IP for hepefoundation.org..."
echo "Invoking set-reverse-dns-elastic-ip.sh from administration folder..."

# Call the main set-reverse-dns-elastic-ip.sh script with hepefoundation.org domain
exec "${ADMIN_DIR}/set-reverse-dns-elastic-ip.sh" "hepefoundation.org" 