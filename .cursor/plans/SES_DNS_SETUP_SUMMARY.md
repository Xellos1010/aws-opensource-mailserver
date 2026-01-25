# SES DNS Setup Summary

## Problem Diagnosed

The SES DNS setup is failing because Mail-in-a-Box's DNS API does not recognize `emcnotary.com` as a managed domain. Since the domain is hosted on GoDaddy (not Route 53), DNS records must be set manually in GoDaddy's DNS management interface.

## Specific Error

**Error Message**: `{qname} is not a domain name or a subdomain of a domain name managed by this box.`

**HTTP Status**: `400 Bad Request`

**Affected Records**: All 5 SES DNS records are failing with the same error.

## Solution Implemented

### 1. Error Analysis Document
Created `.cursor/plans/SES_DNS_ERROR_ANALYSIS.md` documenting:
- Exact error messages for each failing record
- All 5 DNS records that need to be set
- Required DNS record values and formats
- Solution options (manual setup, GoDaddy API, Mail-in-a-Box DNS zones)

### 2. DNS Records Print Tool
Created `tools/print-ses-dns-records.cli.ts` that:
- Retrieves SES DNS records from core stack using `getStackInfoFromApp` (equivalent to `cdk-emcnotary-core:admin:info`)
- Gets DKIM token names and values 1-3 from core stack outputs
- Formats records in a GoDaddy-friendly format
- Provides copy-paste ready output
- Includes step-by-step instructions for SES domain verification

**Usage**:
```bash
pnpm nx run cdk-emcnotary-instance:admin:ses-dns:print
```

**How it works**:
- Uses `getStackInfoFromApp` with core app path (`apps/cdk-emc-notary/core`)
- Retrieves the same data as `nx run cdk-emcnotary-core:admin:info`
- Extracts DKIM token names and values (1-3) plus Mail-From records
- Formats for manual entry in GoDaddy DNS management

### 3. Nx Target Added
Added `admin:ses-dns:print` target to `apps/cdk-emc-notary/instance/project.json` for easy access.

## Next Steps

1. **Run the print command** to get the DNS records:
   ```bash
   pnpm nx run cdk-emcnotary-instance:admin:ses-dns:print
   ```

2. **Manually add the 5 DNS records in GoDaddy**:
   - 3 DKIM CNAME records
   - 1 Mail-From MX record
   - 1 Mail-From SPF TXT record

3. **Wait for DNS propagation** (typically 5-60 minutes)

4. **Verify SES verification status**:
   ```bash
   pnpm nx run cdk-emcnotary-instance:admin:ses:status
   ```

## Records to Set

The print command will output all 5 records in the correct format. Here's a summary:

### DKIM Records (CNAME)
1. `2hpatmaxfyj2qykbxigz5gqq7qvi75oc._domainkey` → `2hpatmaxfyj2qykbxigz5gqq7qvi75oc.dkim.amazonses.com`
2. `q35kjlj6mjd7jhw2jkuvmfh4u5gstne7._domainkey` → `q35kjlj6mjd7jhw2jkuvmfh4u5gstne7.dkim.amazonses.com`
3. `m3x53h5qru7w2s3f4nyfvzjxwdbue726._domainkey` → `m3x53h5qru7w2s3f4nyfvzjxwdbue726.dkim.amazonses.com`

### Mail From Records
4. `mail` (MX) → `10 feedback-smtp.us-east-1.amazonses.com`
5. `mail` (TXT) → `v=spf1 include:amazonses.com ~all`

## Files Created/Modified

- ✅ `.cursor/plans/SES_DNS_ERROR_ANALYSIS.md` - Error analysis document
- ✅ `tools/print-ses-dns-records.cli.ts` - DNS records print tool
- ✅ `apps/cdk-emc-notary/instance/project.json` - Added `admin:ses-dns:print` target

