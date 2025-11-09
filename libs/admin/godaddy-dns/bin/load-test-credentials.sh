#!/bin/bash
# Load GoDaddy test credentials from JSON file and export as environment variables

set -euo pipefail

CREDENTIALS_FILE="${1:-data/godaddy/api-keys/hepejesus-account-apikey-test.json}"

if [ ! -f "$CREDENTIALS_FILE" ]; then
  echo "Error: Credentials file not found: $CREDENTIALS_FILE"
  exit 1
fi

# Extract credentials using jq or node
if command -v jq &> /dev/null; then
  export GODADDY_API_KEY=$(jq -r '.Key' "$CREDENTIALS_FILE")
  export GODADDY_API_SECRET=$(jq -r '.Secret' "$CREDENTIALS_FILE")
  export GODADDY_SHOPPER_ID=$(jq -r '.shopperId' "$CREDENTIALS_FILE")
elif command -v node &> /dev/null; then
  export GODADDY_API_KEY=$(node -e "console.log(require('./$CREDENTIALS_FILE').Key)")
  export GODADDY_API_SECRET=$(node -e "console.log(require('./$CREDENTIALS_FILE').Secret)")
  export GODADDY_SHOPPER_ID=$(node -e "console.log(require('./$CREDENTIALS_FILE').shopperId)")
else
  echo "Error: Need either 'jq' or 'node' to parse JSON file"
  exit 1
fi

export GODADDY_TEST_ENABLED=true
# Default to OTE for test credentials
export GODADDY_BASE_URL="${GODADDY_BASE_URL:-https://api.ote-godaddy.com}"

echo "Loaded credentials from: $CREDENTIALS_FILE"
echo "API Key: ${GODADDY_API_KEY:0:10}..."
echo "Shopper ID: $GODADDY_SHOPPER_ID"
echo "Base URL: $GODADDY_BASE_URL"

