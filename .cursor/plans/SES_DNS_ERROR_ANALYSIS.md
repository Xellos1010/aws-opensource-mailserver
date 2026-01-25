# SES DNS Setup Error Analysis

## Problem Summary

The SES DNS setup is failing because Mail-in-a-Box's DNS API does not recognize `emcnotary.com` as a managed domain, even though mail users exist for this domain. Since the domain is hosted on GoDaddy (not Route 53), these DNS records need to be set directly in GoDaddy's DNS management interface.

## Specific Error

**Error Message**: `{qname} is not a domain name or a subdomain of a domain name managed by this box.`

**HTTP Status**: `400 Bad Request`

**Root Cause**: Mail-in-a-Box requires domains to be explicitly added to its DNS zones before DNS records can be set via the API. Having mail users (`admin@emcnotary.com`, `me@emcnotary.com`) is not sufficient - the domain must be recognized as a DNS-managed domain.

## Records That Are Failing

All 5 SES DNS records are failing with the same error:

### 1. DKIM Record #1 (CNAME)
- **Record Name**: `2hpatmaxfyj2qykbxigz5gqq7qvi75oc._domainkey.emcnotary.com`
- **Record Type**: `CNAME`
- **Record Value**: `2hpatmaxfyj2qykbxigz5gqq7qvi75oc.dkim.amazonses.com.`
- **Error**: `2hpatmaxfyj2qykbxigz5gqq7qvi75oc._domainkey is not a domain name or a subdomain of a domain name managed by this box.`

### 2. DKIM Record #2 (CNAME)
- **Record Name**: `q35kjlj6mjd7jhw2jkuvmfh4u5gstne7._domainkey.emcnotary.com`
- **Record Type**: `CNAME`
- **Record Value**: `q35kjlj6mjd7jhw2jkuvmfh4u5gstne7.dkim.amazonses.com.`
- **Error**: `q35kjlj6mjd7jhw2jkuvmfh4u5gstne7._domainkey is not a domain name or a subdomain of a domain name managed by this box.`

### 3. DKIM Record #3 (CNAME)
- **Record Name**: `m3x53h5qru7w2s3f4nyfvzjxwdbue726._domainkey.emcnotary.com`
- **Record Type**: `CNAME`
- **Record Value**: `m3x53h5qru7w2s3f4nyfvzjxwdbue726.dkim.amazonses.com.`
- **Error**: `m3x53h5qru7w2s3f4nyfvzjxwdbue726._domainkey is not a domain name or a subdomain of a domain name managed by this box.`

### 4. Mail From MX Record
- **Record Name**: `mail.emcnotary.com`
- **Record Type**: `MX`
- **Record Value**: `10 feedback-smtp.us-east-1.amazonses.com`
- **Error**: `mail is not a domain name or a subdomain of a domain name managed by this box.`

### 5. Mail From SPF TXT Record
- **Record Name**: `mail.emcnotary.com`
- **Record Type**: `TXT`
- **Record Value**: `v=spf1 include:amazonses.com ~all`
- **Error**: `mail is not a domain name or a subdomain of a domain name managed by this box.`

## Required DNS Records for GoDaddy

Since the domain is hosted on GoDaddy, these records need to be manually added in GoDaddy's DNS management interface:

### DKIM Records (CNAME)
1. **Name**: `2hpatmaxfyj2qykbxigz5gqq7qvi75oc._domainkey`
   **Type**: `CNAME`
   **Value**: `2hpatmaxfyj2qykbxigz5gqq7qvi75oc.dkim.amazonses.com.`
   **TTL**: `3600` (or default)

2. **Name**: `q35kjlj6mjd7jhw2jkuvmfh4u5gstne7._domainkey`
   **Type**: `CNAME`
   **Value**: `q35kjlj6mjd7jhw2jkuvmfh4u5gstne7.dkim.amazonses.com.`
   **TTL**: `3600` (or default)

3. **Name**: `m3x53h5qru7w2s3f4nyfvzjxwdbue726._domainkey`
   **Type**: `CNAME`
   **Value**: `m3x53h5qru7w2s3f4nyfvzjxwdbue726.dkim.amazonses.com.`
   **TTL**: `3600` (or default)

### Mail From Records
4. **Name**: `mail`
   **Type**: `MX`
   **Priority**: `10`
   **Value**: `feedback-smtp.us-east-1.amazonses.com`
   **TTL**: `3600` (or default)

5. **Name**: `mail`
   **Type**: `TXT`
   **Value**: `v=spf1 include:amazonses.com ~all`
   **TTL**: `3600` (or default)

## Solution Options

### Option 1: Manual Setup in GoDaddy (Recommended)
Manually add all 5 DNS records in GoDaddy's DNS management interface. This is the most straightforward solution since GoDaddy manages the domain.

**Steps**:
1. Log into GoDaddy account
2. Navigate to DNS management for `emcnotary.com`
3. Add each of the 5 records listed above
4. Wait for DNS propagation (typically 5-60 minutes)
5. Verify records using: `pnpm nx run cdk-emcnotary-instance:admin:ses:status`

### Option 2: GoDaddy API Integration
Create a new tool that uses GoDaddy's DNS API to set these records programmatically. This would require:
- GoDaddy API credentials (API key and secret)
- Implementation of GoDaddy DNS API client
- Error handling and verification

### Option 3: Add Domain to Mail-in-a-Box DNS Zones
Investigate how to properly add `emcnotary.com` to Mail-in-a-Box's DNS zones so it recognizes it as a managed domain. This might require:
- Adding the domain via Mail-in-a-Box web UI
- Or modifying Mail-in-a-Box's DNS configuration files directly

## Verification

After setting the records in GoDaddy, verify they are correct:

```bash
# Check SES verification status
pnpm nx run cdk-emcnotary-instance:admin:ses:status

# Check DNS records directly
dig 2hpatmaxfyj2qykbxigz5gqq7qvi75oc._domainkey.emcnotary.com CNAME
dig mail.emcnotary.com MX
dig mail.emcnotary.com TXT
```

## Next Steps

1. **Immediate**: Manually add the 5 DNS records in GoDaddy
2. **Short-term**: Verify SES verification status after DNS propagation
3. **Long-term**: Consider implementing GoDaddy API integration for automated DNS management

