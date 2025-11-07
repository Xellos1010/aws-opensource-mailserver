#!/bin/bash

# Restart EC2 instance script for askdaokapra.com
# This script invokes the main restart-ec2-instance.sh with the askdaokapra.com domain

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ADMIN_DIR="${SCRIPT_DIR}/../administration"

echo "Restarting EC2 instance for askdaokapra.com mailserver..."
echo "Invoking restart-ec2-instance.sh from administration folder..."

# Call the main restart-ec2-instance.sh script with askdaokapra.com domain
exec "${ADMIN_DIR}/restart-ec2-instance.sh" "askdaokapra.com"











