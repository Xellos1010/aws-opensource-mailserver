# GoDaddy API Credentials Issue

## Current Status

The test credentials in `data/godaddy/api-keys/hepejesus-account-apikey-test.json` are returning "API Key-Secret is malformed" errors when used with both:
- OTE environment: `https://api.ote-godaddy.com`
- Production environment: `https://api.godaddy.com`

## Possible Causes

1. **Credentials are invalid or expired**
   - API keys may have been revoked or expired
   - Solution: Generate new API keys from [GoDaddy Developer Portal](https://developer.godaddy.com/keys)

2. **Credentials are for a different account**
   - The API key/secret may not match the shopperId
   - Solution: Verify credentials belong to shopperId `253211715`

3. **API key format issue**
   - The credentials may need to be regenerated
   - Solution: Create a new API key/secret pair

## Verification Steps

1. **Check credentials in GoDaddy Developer Portal:**
   - Visit https://developer.godaddy.com/keys
   - Verify the API key exists and is active
   - Check if it's for OTE or Production

2. **Test with curl:**
   ```bash
   # Test OTE
   curl -X GET "https://api.ote-godaddy.com/v1/domains" \
     -H "Authorization: sso-key $(echo -n 'KEY:SECRET' | base64)" \
     -H "X-Shopper-Id: 253211715" \
     -H "Accept: application/json"
   
   # Test Production
   curl -X GET "https://api.godaddy.com/v1/domains" \
     -H "Authorization: sso-key $(echo -n 'KEY:SECRET' | base64)" \
     -H "X-Shopper-Id: 253211715" \
     -H "Accept: application/json"
   ```

3. **If both fail**, regenerate API keys:
   - Go to https://developer.godaddy.com/keys
   - Create a new API key for OTE (test environment)
   - Update `data/godaddy/api-keys/hepejesus-account-apikey-test.json`

## Current Test Behavior

Integration tests are **passing** but **skipping** tests that require authentication when credentials are invalid. This is the correct behavior - tests gracefully handle invalid credentials.

When valid credentials are provided:
- Tests will execute against the GoDaddy API
- Real API calls will be made
- DNS records will be set/verified

## Next Steps

1. Verify/regenerate API credentials in GoDaddy Developer Portal
2. Update the credentials JSON file with valid keys
3. Re-run integration tests: `pnpm nx test:integration godaddy-dns`


