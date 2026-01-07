#!/bin/bash
# Integration test runner for GoDaddy DNS library
# Points to developer environment (OTE) by default

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}GoDaddy DNS Integration Test Runner${NC}"
echo "=========================================="
echo ""

# Check for required environment variables
if [ -z "${GODADDY_API_KEY:-}" ]; then
  echo -e "${RED}Error: GODADDY_API_KEY environment variable is required${NC}"
  echo "Set it with: export GODADDY_API_KEY=your-api-key"
  exit 1
fi

if [ -z "${GODADDY_API_SECRET:-}" ]; then
  echo -e "${RED}Error: GODADDY_API_SECRET environment variable is required${NC}"
  echo "Set it with: export GODADDY_API_SECRET=your-api-secret"
  exit 1
fi

# Set defaults for optional variables
export GODADDY_TEST_ENABLED=true
export GODADDY_BASE_URL="${GODADDY_BASE_URL:-https://api.ote-godaddy.com}"
export GODADDY_TEST_DOMAIN="${GODADDY_TEST_DOMAIN:-test-domain.example.com}"

echo -e "${GREEN}Configuration:${NC}"
echo "  API Base URL: ${GODADDY_BASE_URL}"
echo "  Test Domain: ${GODADDY_TEST_DOMAIN}"
echo "  Customer ID: ${GODADDY_CUSTOMER_ID:-not set (nameserver tests will be skipped)}"
echo ""

# Run integration tests
echo -e "${GREEN}Running integration tests...${NC}"
echo ""

cd "$(dirname "$0")/../.."
pnpm nx test:integration godaddy-dns

echo ""
echo -e "${GREEN}Integration tests completed!${NC}"



















