#!/bin/bash

# Restart EC2 instance script for hepefoundation.org
# This script invokes the main restart-ec2-instance.sh with the hepefoundation.org domain

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ADMIN_DIR="${SCRIPT_DIR}/../administration"

echo "Restarting EC2 instance for hepefoundation.org mailserver..."
echo "Invoking restart-ec2-instance.sh from administration folder..."

# Call the main restart-ec2-instance.sh script with hepefoundation.org domain
exec "${ADMIN_DIR}/restart-ec2-instance.sh" "hepefoundation.org"











