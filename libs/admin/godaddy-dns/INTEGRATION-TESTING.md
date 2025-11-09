# Integration Testing Guide

## Overview

Integration tests for the GoDaddy DNS library run against the GoDaddy OTE (Operational Test Environment) to verify real API interactions.

## Prerequisites

1. **GoDaddy API Credentials** (required):
   - `GODADDY_API_KEY`: Your GoDaddy API key
   - `GODADDY_API_SECRET`: Your GoDaddy API secret
   - `GODADDY_CUSTOMER_ID`: Customer ID for v2 endpoints (optional, for nameserver tests)

2. **Test Domain** (optional):
   - `GODADDY_TEST_DOMAIN`: Domain name to use for testing (defaults to `test-domain.example.com`)

3. **Environment** (optional):
   - `GODADDY_BASE_URL`: API base URL (defaults to `https://api.ote-godaddy.com` for developer environment)

## Running Integration Tests

### Method 1: Using the Test Runner Script

```bash
export GODADDY_API_KEY=your-api-key
export GODADDY_API_SECRET=your-api-secret
export GODADDY_CUSTOMER_ID=your-customer-id  # Optional
export GODADDY_TEST_DOMAIN=your-test-domain.com  # Optional

./libs/admin/godaddy-dns/bin/run-integration-tests.sh
```

### Method 2: Using Nx Directly

```bash
export GODADDY_TEST_ENABLED=true
export GODADDY_API_KEY=your-api-key
export GODADDY_API_SECRET=your-api-secret
export GODADDY_CUSTOMER_ID=your-customer-id  # Optional
export GODADDY_TEST_DOMAIN=your-test-domain.com  # Optional
export GODADDY_BASE_URL=https://api.ote-godaddy.com  # Optional, defaults to OTE

pnpm nx test:integration godaddy-dns
```

### Method 3: Using Vitest Directly

```bash
export GODADDY_TEST_ENABLED=true
export GODADDY_API_KEY=your-api-key
export GODADDY_API_SECRET=your-api-secret
export GODADDY_CUSTOMER_ID=your-customer-id  # Optional
export GODADDY_TEST_DOMAIN=your-test-domain.com  # Optional

pnpm npx vitest run --config libs/admin/godaddy-dns/vitest.config.ts src/__it__
```

## Test Coverage

Integration tests cover:

1. **DNS Hostname Setting** (`setDnsHostnames`)
   - Setting A records for ns1.box and ns2.box
   - Verifying records were set correctly
   - Handling invalid domains

2. **Nameserver Configuration** (`setNameservers`)
   - Setting custom nameservers
   - Auto-constructing nameserver FQDNs
   - Requires `GODADDY_CUSTOMER_ID`

3. **Error Handling**
   - Authentication errors (401)
   - Domain not found errors (404)
   - Network connectivity verification

4. **API Connectivity**
   - Basic connectivity test to verify API is reachable
   - Confirms authentication works

## Test Behavior

- **Without Credentials**: Tests are automatically skipped (7 tests skipped)
- **With Credentials**: Tests run against GoDaddy OTE API
- **Test Timeouts**: 30-60 seconds per test to allow for API response times
- **DNS Propagation**: Tests include a 2-second delay for DNS propagation when verifying records

## Expected Results

### With Valid Credentials

```
✓ setDnsHostnames > should set DNS hostnames for ns1.box and ns2.box
✓ setDnsHostnames > should handle invalid domain gracefully
✓ setNameservers > should set nameservers for a domain (if CUSTOMER_ID provided)
✓ setNameservers > should construct nameserver FQDNs when not provided (if CUSTOMER_ID provided)
✓ error handling > should handle authentication errors when setting DNS hostnames
✓ error handling > should handle domain not found errors
✓ API connectivity > should successfully connect to GoDaddy OTE API
```

### Without Credentials

```
↓ src/__it__/godaddy-api.integration.spec.ts (7 tests | 7 skipped)
Test Files  1 skipped (1)
Tests  7 skipped (7)
```

## Troubleshooting

### Tests Fail with Authentication Error ("API Key-Secret is malformed")

**Common Causes:**
1. **Wrong Environment**: API key is for production but testing against OTE (or vice versa)
   - OTE keys work with `https://api.ote-godaddy.com`
   - Production keys work with `https://api.godaddy.com`
   - Solution: Use matching API key and base URL

2. **Invalid/Expired Credentials**: API key may have been revoked or expired
   - Solution: Generate new API keys from GoDaddy Developer Portal

3. **Incorrect Format**: Ensure credentials are loaded correctly from JSON
   - Use the provided `load-test-credentials.sh` script
   - Verify JSON file has `Key`, `Secret`, and optionally `shopperId` fields

**Verification:**
```bash
# Test credentials with curl
curl -X GET "https://api.ote-godaddy.com/v1/domains" \
  -H "Authorization: sso-key $(echo -n 'YOUR_KEY:YOUR_SECRET' | base64)" \
  -H "X-Shopper-Id: YOUR_SHOPPER_ID" \
  -H "Accept: application/json"
```

If this returns `{"code":"MALFORMED_CREDENTIALS","message":"Unauthorized : API Key-Secret is malformed"}`, the credentials are invalid for that environment.

### Tests Fail with Domain Not Found

- Verify `GODADDY_TEST_DOMAIN` exists in your GoDaddy account
- Ensure the domain is accessible with your API credentials
- Check domain status in GoDaddy dashboard

### Nameserver Tests Are Skipped

- Set `GODADDY_CUSTOMER_ID` environment variable
- Customer ID is required for v2 API endpoints
- Find your customer ID in GoDaddy account settings

### Network/Timeout Errors

- Verify internet connectivity
- Check that `GODADDY_BASE_URL` is correct
- Ensure firewall/proxy allows connections to GoDaddy API
- Increase test timeout if needed (edit test file)

## Notes

- Integration tests use the **developer environment (OTE)** by default
- Tests make **real API calls** - use a test domain to avoid affecting production
- Rate limiting is handled automatically by the client (60 requests/minute)
- DNS propagation delays may cause verification to fail - this is expected and acceptable

