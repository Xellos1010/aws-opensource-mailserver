#!/bin/bash

# Restart EC2 instance script for k3frame.com
# This script invokes the main restart-ec2-instance.sh with the k3frame.com domain

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ADMIN_DIR="${SCRIPT_DIR}/../administration"

echo "Restarting EC2 instance for k3frame.com mailserver..."
echo "Invoking restart-ec2-instance.sh from administration folder..."

# Call the main restart-ec2-instance.sh script with k3frame.com domain
exec "${ADMIN_DIR}/restart-ec2-instance.sh" "k3frame.com"











