#!/usr/bin/env bash
set -Eeuo pipefail

# Test Memory Alarms Script
# Simulates memory pressure to test CloudWatch alarms

# Default domain name
DEFAULT_DOMAIN="askdaokapra.com"

# Check if domain name was provided as first argument, otherwise use default
DOMAIN_NAME=${1:-$DEFAULT_DOMAIN}

# Create stack name from domain
STACK_NAME=$(echo "${DOMAIN_NAME}" | sed 's/\./-/g')-mailserver
REGION="us-east-1"

echo "Testing Memory Alarms for domain: ${DOMAIN_NAME}"
echo "Stack name: ${STACK_NAME}"
echo "Region: ${REGION}"
echo "----------------------------------------"

# Get instance IP
SUBPROJECT_DIR="/Users/evanmccall/Projects/aws-opensource-mailserver/${STACK_NAME//-com-mailserver/}"
IP_FILE="${SUBPROJECT_DIR}/ec2_ipaddress.txt"
if [ ! -f "$IP_FILE" ]; then
  echo "Error: IP address file not found at ${IP_FILE}"
  exit 1
fi

INSTANCE_IP=$(cat "$IP_FILE" | tr -d '\n\r' | xargs)
if [ -z "$INSTANCE_IP" ]; then
  echo "Error: Could not read IP address from ${IP_FILE}"
  exit 1
fi

echo "Instance IP: ${INSTANCE_IP}"

# Set up key file path
KEY_FILE="${HOME}/.ssh/${DOMAIN_NAME}-keypair.pem"

# Check if key file exists
if [ ! -f "$KEY_FILE" ]; then
  echo "Error: PEM key file not found at ${KEY_FILE}"
  echo "Please run setup-ssh-access.sh first to retrieve the key"
  exit 1
fi

# Set correct permissions for the key file
chmod 400 "$KEY_FILE"

echo "Testing SSH connection..."
if ! ssh -i "$KEY_FILE" -o StrictHostKeyChecking=no -o ConnectTimeout=10 "ubuntu@${INSTANCE_IP}" "echo 'SSH connection successful'"; then
  echo "Error: Could not establish SSH connection to ubuntu@${INSTANCE_IP}"
  exit 1
fi

echo ""
echo "⚠️  WARNING: This script will create memory pressure on your server!"
echo "This is a TEST to verify CloudWatch alarms are working."
echo "The server will consume memory temporarily and may become slow."
echo ""
read -p "Do you want to continue? (y/N): " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
  echo "Test cancelled."
  exit 0
fi

echo ""
echo "Starting memory pressure test..."

# Create a script to run on the server that will consume memory
cat > /tmp/memory_test.sh << 'EOF'
#!/bin/bash
set -e

echo "Starting memory pressure test on server..."

# Get current memory usage
echo "Current memory usage:"
free -h

# Get total memory in MB
TOTAL_MEM=$(free -m | awk 'NR==2{print $2}')
echo "Total memory: ${TOTAL_MEM}MB"

# Calculate how much memory to consume (aim for 90% usage)
TARGET_MEM=$((TOTAL_MEM * 90 / 100))
echo "Target memory usage: ${TARGET_MEM}MB"

# Create memory-consuming processes
echo "Creating memory-consuming processes..."
for i in {1..10}; do
  # Each process will consume about 10% of total memory
  MEM_PER_PROCESS=$((TOTAL_MEM / 10))
  echo "Starting process $i consuming ${MEM_PER_PROCESS}MB..."
  nohup python3 -c "
import time
import sys
mem_mb = int(sys.argv[1])
data = []
try:
    # Consume memory in chunks
    chunk_size = 1024 * 1024  # 1MB chunks
    for _ in range(mem_mb):
        data.append('x' * chunk_size)
    print(f'Process consuming {mem_mb}MB started')
    # Keep the process alive for 5 minutes
    time.sleep(300)
except KeyboardInterrupt:
    print('Process interrupted')
" ${MEM_PER_PROCESS} &
done

echo "Memory pressure test started. Processes will run for 5 minutes."
echo "Check CloudWatch console for alarm triggers."
echo "Current memory usage:"
free -h

# Wait a bit and show memory usage again
sleep 10
echo "Memory usage after 10 seconds:"
free -h

echo "Test completed. Processes will continue running for 5 minutes."
EOF

chmod +x /tmp/memory_test.sh

# Copy and run the memory test script on the server
echo "Copying memory test script to server..."
scp -i "$KEY_FILE" -o StrictHostKeyChecking=no /tmp/memory_test.sh "ubuntu@${INSTANCE_IP}:~/"

echo "Running memory pressure test on server..."
ssh -i "$KEY_FILE" -o StrictHostKeyChecking=no "ubuntu@${INSTANCE_IP}" "~/memory_test.sh"

echo ""
echo "✅ Memory pressure test completed!"
echo ""
echo "What to check next:"
echo "1. Check your email (admin@${DOMAIN_NAME}) for CloudWatch alarm notifications"
echo "2. Check CloudWatch console for alarm state changes"
echo "3. Monitor the server for 5-10 minutes to see if alarms trigger"
echo ""
echo "To stop the memory test processes early, run:"
echo "ssh -i ${KEY_FILE} ubuntu@${INSTANCE_IP} 'pkill -f memory_test'"

# Clean up local temp file
rm -f /tmp/memory_test.sh
