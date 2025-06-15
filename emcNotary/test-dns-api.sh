#!/bin/bash

# Exit on error
set -e

# Default domain name
DEFAULT_DOMAIN="emcnotary.com"

# Check if domain name was provided as first argument, otherwise use default
DOMAIN_NAME=${1:-$DEFAULT_DOMAIN}

# Mail-in-a-Box API endpoint
MIAB_HOST="https://box.${DOMAIN_NAME}"

# Get admin credentials using get-admin-password.sh
echo "Retrieving admin credentials..."
CREDENTIALS=$(./emcNotary/get-admin-password.sh "${DOMAIN_NAME}" | grep -A 2 "Admin credentials for Mail-in-a-Box:")
ADMIN_EMAIL=$(echo "${CREDENTIALS}" | grep "Username:" | cut -d' ' -f2)
ADMIN_PASSWORD=$(echo "${CREDENTIALS}" | grep "Password:" | cut -d' ' -f2)

if [ -z "${ADMIN_EMAIL}" ] || [ -z "${ADMIN_PASSWORD}" ]; then
    echo "Error: Could not retrieve admin credentials"
    exit 1
fi

# Test record details
TEST_HOSTNAME="test.${DOMAIN_NAME}"
TEST_VALUE="This is a test TXT record $(date)"

echo "Testing DNS API for domain: ${DOMAIN_NAME}"
echo "Test hostname: ${TEST_HOSTNAME}"
echo "Test value: ${TEST_VALUE}"

# Function to make API call
make_api_call() {
    local method=$1
    local path=$2
    local data=$3
    
    echo "Making ${method} request to ${path}"
    response=$(curl -s -w "%{http_code}" -o /tmp/curl_response \
         -u "${ADMIN_EMAIL}:${ADMIN_PASSWORD}" \
         -X "${method}" \
         ${data:+-d "value=${data}"} \
         -H "Content-Type: application/x-www-form-urlencoded" \
         "${MIAB_HOST}${path}")
    
    http_code=${response##* }
    response_body=$(cat /tmp/curl_response)
    rm -f /tmp/curl_response
    
    echo "Response (HTTP ${http_code}):"
    echo "${response_body}"
    echo "----------------------------------------"
    
    if [ "${http_code}" != "200" ]; then
        echo "Error: API call failed (HTTP ${http_code})"
        return 1
    fi
}

# Test 1: Add TXT record using POST
echo "Test 1: Adding TXT record..."
make_api_call "POST" "/admin/dns/custom/test/TXT" "${TEST_VALUE}"

# Test 2: Verify TXT record was added
echo "Test 2: Verifying TXT record..."
make_api_call "GET" "/admin/dns/custom/test/TXT"

# Test 3: Delete specific TXT record
echo "Test 3: Deleting specific TXT record..."
make_api_call "DELETE" "/admin/dns/custom/test/TXT" "${TEST_VALUE}"

# Test 4: Verify TXT record was deleted
echo "Test 4: Verifying TXT record was deleted..."
make_api_call "GET" "/admin/dns/custom/test/TXT"

echo "Test completed!" 