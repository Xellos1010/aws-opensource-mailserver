# Mail-in-a-Box NSD Nameserver Audit Report

## Executive Summary

**Date**: 2026-01-11  
**Domain**: emcnotary.com  
**Instance**: 3.229.143.6 (emcnotary-com-mailserver-instance)

The Mail-in-a-Box instance uses **NSD (Name Server Daemon)** as its authoritative, non-recursive DNS nameserver. The audit reveals that while NSD is running correctly, **`emcnotary.com` is not recognized as a DNS-managed domain**, which explains why SES DNS records cannot be set via the Mail-in-a-Box DNS API.

## Key Findings

### ✅ NSD Service Status
- **Status**: Active and running
- **Version**: NSD 4.3.9
- **Process**: Running since 2026-01-11 08:01:39 UTC
- **Configuration**: `/etc/nsd/nsd.conf` exists and is properly configured
- **Zones Directory**: `/etc/nsd/zones` (configured but empty)

### ❌ DNS Zone Management
- **Managed Domains**: None found
- **DNS Zones**: No zones configured in NSD
- **Custom DNS Records**: No custom records exist (`/home/user-data/dns/custom.yaml` not found)
- **Zone Configuration**: `/home/user-data/dns/zones.conf` not found

### ❌ Domain Recognition
- **`emcnotary.com` DNS Status**: **NOT recognized** as a DNS-managed domain
- **Mail Domains**: Empty list (no mail domains found via `get_mail_domains()`)
- **DNS Domains**: Empty list (no DNS domains found via `get_dns_domains()`)

## Root Cause Analysis

The error message `"{qname} is not a domain name or a subdomain of a domain name managed by this box"` occurs because:

1. **Domain Not in DNS Zones**: Mail-in-a-Box requires domains to be explicitly added to its DNS zones before DNS records can be set via the API.

2. **Mail Users ≠ DNS Management**: Having mail users (`admin@emcnotary.com`, `me@emcnotary.com`) does NOT automatically add the domain to DNS management.

3. **NSD Zones Empty**: The NSD nameserver has no zones configured, meaning no domains are being served by this instance's DNS.

## How Mail-in-a-Box Manages DNS Domains

Mail-in-a-Box distinguishes between:
- **Mail Domains**: Domains that have mail users/aliases (for email functionality)
- **DNS-Managed Domains**: Domains that are served by NSD and can have custom DNS records

To add a domain to DNS management, you typically need to:
1. Add a mail user for the domain (which may trigger DNS zone creation)
2. OR explicitly add the domain as a DNS zone via the Mail-in-a-Box UI/API
3. OR configure the domain's nameservers to point to this instance

## Current Configuration

### NSD Configuration
```
server:
  hide-version: yes
  logfile: "/var/log/nsd.log"
  zonesdir: "/etc/nsd/zones"
  ip-transparent: yes
  ip-address: 172.31.86.85
```

### DNS Zone Files
- **Location**: `/home/user-data/dns/zones/`
- **Status**: Directory exists but contains no zone files for `emcnotary.com`

### Custom DNS Records
- **Location**: `/home/user-data/dns/custom.yaml`
- **Status**: File does not exist (no custom DNS records configured)

## Impact on SES DNS Setup

**Current State**: SES DNS records cannot be set via Mail-in-a-Box API because:
- The domain is not recognized as DNS-managed
- NSD has no zones configured
- The DNS API endpoint `/admin/dns/custom/{qname}/{rtype}` rejects requests for unmanaged domains

**Required Actions**:
1. Add `emcnotary.com` to Mail-in-a-Box DNS management
2. Configure NSD zone for the domain
3. Then set SES DNS records via the DNS API

## Recommendations

### Option 1: Add Domain via Mail-in-a-Box UI
1. Log into Mail-in-a-Box admin UI (`https://box.emcnotary.com`)
2. Navigate to "DNS" section
3. Add `emcnotary.com` as a DNS-managed domain
4. This will create the NSD zone and allow DNS API access

### Option 2: Add Domain via Mail-in-a-Box Management Scripts
Use Mail-in-a-Box's management scripts to add the domain:
```bash
cd /opt/mailinabox
sudo -u user-data python3 management/dns_update.py
```

### Option 3: Configure Nameservers (If Using MIAB as Authoritative DNS)
If `emcnotary.com` should use this Mail-in-a-Box instance as its authoritative nameserver:
1. Configure nameservers at GoDaddy to point to:
   - `ns1.box.emcnotary.com` → 3.229.143.6
   - `ns2.box.emcnotary.com` → 3.229.143.6
2. Add glue records for the nameservers
3. Mail-in-a-Box should automatically create DNS zones

### Option 4: Manual DNS Zone Creation (Not Recommended)
Manually create NSD zone files and update Mail-in-a-Box configuration (complex and error-prone).

## Next Steps

1. **Immediate**: Determine if `emcnotary.com` should be DNS-managed by this Mail-in-a-Box instance
   - If YES: Add domain via UI or management scripts
   - If NO: Use GoDaddy DNS directly (current approach with `print-ses-dns-records.cli.ts`)

2. **If Using MIAB DNS**: After adding domain, update SES DNS setup to use Mail-in-a-Box API

3. **Verification**: After adding domain, re-run nameserver audit to confirm:
   - Domain appears in `get_dns_domains()`
   - NSD zone file exists for domain
   - DNS API accepts requests for domain

## Tools Created

1. **`tools/audit-miab-nameserver.cli.ts`**: Comprehensive NSD nameserver audit tool
   - Usage: `pnpm nx run cdk-emcnotary-instance:admin:nameserver:audit`
   - Checks NSD status, zones, domain recognition, and DNS configuration

2. **`tools/print-ses-dns-records.cli.ts`**: Updated to format records for MIAB NSD
   - Now outputs curl commands for Mail-in-a-Box DNS API
   - Includes normalized qnames (without domain suffix)
   - Ready for use once domain is added to DNS management

## References

- [Mail-in-a-Box DNS API Documentation](3rd-party-documentation/mail-in-a-box-api/dns-api.md)
- NSD Documentation: `man nsd(8)`
- Mail-in-a-Box Management Scripts: `/opt/mailinabox/management/`

