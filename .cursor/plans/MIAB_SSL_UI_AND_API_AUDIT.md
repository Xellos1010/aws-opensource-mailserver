# Mail-in-a-Box SSL Provisioning UI and API Audit Report

**Date:** 2026-01-11  
**Stack:** `emcnotary-com-mailserver-instance`  
**Instance IP:** 3.229.143.6  
**Hostname:** box.emcnotary.com

---

## Executive Summary

This audit examines how Mail-in-a-Box's web UI provisions SSL certificates and identifies programmatic methods to invoke the same provisioning process. The audit connects directly to the instance to examine the Mail-in-a-Box codebase.

**Key Findings:**
1. ✅ Mail-in-a-Box uses `/opt/mailinabox/management/ssl_certificates.py` for SSL provisioning
2. ⚠️ Web UI files need deeper examination (web directory structure not fully mapped)
3. ⚠️ API endpoint discovery requires examining Flask routes in web UI
4. ✅ Management script can be invoked directly via SSH (current approach)

---

## Audit Methodology

### Tools Used
- **Audit Script**: `tools/audit-miab-ssl-provision.cli.ts`
- **SSH Access**: Via `admin-ssh` library
- **Instance**: EC2 instance running Mail-in-a-Box v74

### Audit Steps
1. ✅ Verified Mail-in-a-Box installation
2. ✅ Located SSL certificate management script
3. ⚠️ Examined web UI structure (partial - needs deeper dive)
4. ⚠️ Searched for API endpoints (needs more specific search)
5. ⚠️ Checked Flask routes (needs examination of web.py)

---

## Findings

### 1. SSL Certificate Management Script

**Location**: `/opt/mailinabox/management/ssl_certificates.py`

**Status**: ✅ Found and accessible

**Key Details**:
- File size: 26,783 bytes
- Executable: Yes (`-rwxr-xr-x`)
- Python interpreter: `/usr/local/lib/mailinabox/env/bin/python`
- Purpose: Utilities for installing and selecting SSL certificates

**Script Functions** (from first 50 lines):
```python
def get_ssl_certificates(env):
    # Scan all installed SSL certificates and map domains to certificates
    # Certificates stored in: env["STORAGE_ROOT"]/ssl
```

**Current Pipeline Usage**:
```bash
cd /opt/mailinabox && sudo python3 management/ssl_certificates.py --force
```

**Issues Identified**:
- ❌ Uses `sudo -u root` (incorrect syntax) - should be `sudo`
- ❌ Missing Python module `exclusiveprocess` causes failures
- ⚠️ No validation that provisioning succeeded

---

### 2. Web UI Structure

**Status**: ⚠️ Partial examination

**Directory**: `/opt/mailinabox/web/`

**Findings**:
- Web UI files exist but structure not fully mapped
- Need to examine:
  - `web.py` (main Flask application)
  - `system.py` or similar (system management routes)
  - HTML templates for SSL certificate UI

**Next Steps**:
1. List all Python files in `/opt/mailinabox/web/`
2. Examine `web.py` for SSL-related routes
3. Find the handler for "Provision" button click
4. Identify API endpoint (if any) for SSL provisioning

---

### 3. API Endpoint Discovery

**Status**: ⚠️ Needs deeper investigation

**Mail-in-a-Box API Pattern**:
Based on existing DNS API usage in codebase:
- Base URL: `https://box.{domain}/admin`
- Authentication: Basic Auth (email:password)
- Endpoints follow pattern: `/admin/{resource}/{action}`

**Expected SSL API Endpoints** (to verify):
- `POST /admin/ssl/provision` - Provision certificates
- `GET /admin/ssl/status` - Get certificate status
- `POST /admin/ssl/csr` - Generate CSR

**Evidence from Web Search**:
- Mail-in-a-Box documentation mentions `/admin/ssl/provision` endpoint
- Uses same authentication as DNS API

**Current Codebase Usage**:
- ✅ DNS API: `libs/admin/admin-dns-restore/src/lib/restore-miab.ts`
- ✅ Pattern: `makeApiCall(method, path, data, baseUrl, email, password)`
- ❌ SSL API: Not yet implemented

---

### 4. UI Provisioning Flow

**Status**: ⚠️ Needs examination of web UI code

**Expected Flow** (based on Mail-in-a-Box architecture):
1. User clicks "Provision" button in UI (`System > TLS(SSL) Certificates`)
2. UI sends POST request to Flask route (e.g., `/admin/ssl/provision`)
3. Flask route handler calls `management/ssl_certificates.py`
4. Script provisions certificates via Let's Encrypt
5. UI displays success/failure message

**Files to Examine**:
- `/opt/mailinabox/web/web.py` - Main Flask routes
- `/opt/mailinabox/web/templates/system.html` or similar - SSL UI template
- `/opt/mailinabox/web/static/js/system.js` or similar - JavaScript handlers

---

## Programmatic Invocation Methods

### Method 1: Direct Script Execution (Current Approach)

**Status**: ✅ Working (with fixes needed)

**Implementation**:
```typescript
const provisionCommand = `cd /opt/mailinabox && sudo python3 management/ssl_certificates.py --force`;
```

**Pros**:
- Direct access to management script
- Same method Mail-in-a-Box uses internally
- Full control over execution

**Cons**:
- Requires SSH access
- Needs proper sudo permissions
- No structured error handling
- Missing Python module dependencies

**Fixes Needed**:
1. Fix sudo command: `sudo python3` (not `sudo -u root python3`)
2. Verify Python modules: `pip3 install exclusiveprocess`
3. Add error detection and validation
4. Parse script output for success/failure

---

### Method 2: HTTP API Endpoint (Recommended)

**Status**: ⚠️ Needs implementation

**Expected Endpoint**: `POST /admin/ssl/provision`

**Implementation Pattern** (based on DNS API):
```typescript
async function provisionSslViaApi(
  baseUrl: string,
  email: string,
  password: string
): Promise<{ success: boolean; message: string }> {
  const auth = Buffer.from(`${email}:${password}`).toString('base64');
  
  const response = await fetch(`${baseUrl}/admin/ssl/provision`, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    // Allow self-signed certificates
    rejectUnauthorized: false,
  });

  return {
    success: response.status === 200,
    message: await response.text(),
  };
}
```

**Pros**:
- Same method UI uses
- Structured error responses
- No SSH required
- Can be called from anywhere

**Cons**:
- Requires admin credentials
- Needs HTTPS access to instance
- Must handle self-signed certificates

**Verification Steps**:
1. Examine `/opt/mailinabox/web/web.py` for SSL routes
2. Test endpoint: `curl -X POST https://box.emcnotary.com/admin/ssl/provision -u admin@emcnotary.com:password`
3. Check response format and error handling

---

### Method 3: Management API (If Available)

**Status**: ❓ Unknown

Mail-in-a-Box may have a management API that can be invoked locally. Check:
- `/opt/mailinabox/management/api.py` (if exists)
- Management script command-line interface
- Local API server (if any)

---

## Recommended Implementation

### Phase 1: Fix Current SSH-Based Approach

**Priority**: HIGH

1. **Fix Sudo Command**
   ```typescript
   // Change from:
   const provisionCommand = `cd /opt/mailinabox && sudo -u root python3 management/ssl_certificates.py --force`;
   
   // To:
   const provisionCommand = `cd /opt/mailinabox && sudo python3 management/ssl_certificates.py --force`;
   ```

2. **Add Pre-Flight Checks**
   ```typescript
   // Check Python modules
   const pythonCheck = await sshCommand(
     keyPath,
     instanceIp,
     'python3 -c "import exclusiveprocess" 2>&1'
   );
   if (!pythonCheck.success) {
     throw new Error('Missing Python module: exclusiveprocess');
   }
   ```

3. **Improve Error Handling**
   ```typescript
   ssh.on('close', (code) => {
     if (code === 0) {
       // Verify success by checking certificate issuer
       const verifyCheck = await sshCommand(
         keyPath,
         instanceIp,
         'openssl x509 -in /home/user-data/ssl/ssl_certificate.pem -noout -issuer 2>/dev/null'
       );
       if (!verifyCheck.output.includes("Let's Encrypt")) {
         throw new Error('Provisioning failed: Still using self-signed certificate');
       }
       resolve();
     } else {
       reject(new Error(`SSL provisioning failed with exit code ${code}`));
     }
   });
   ```

---

### Phase 2: Implement HTTP API Approach

**Priority**: MEDIUM

1. **Examine Web UI Code**
   ```bash
   # Connect to instance and examine:
   ssh ubuntu@3.229.143.6
   cat /opt/mailinabox/web/web.py | grep -A 20 "ssl\|tls\|certificate"
   ```

2. **Test API Endpoint**
   ```bash
   # Get credentials
   pnpm nx run cdk-emcnotary-instance:admin:credentials
   
   # Test endpoint
   curl -X POST https://box.emcnotary.com/admin/ssl/provision \
     -u admin@emcnotary.com:PASSWORD \
     -k
   ```

3. **Implement API Client**
   ```typescript
   // Add to tools/ssl-provision-api.cli.ts
   import { getAdminCredentials } from '@mm/admin-credentials';
   
   async function provisionSslViaApi(options: SslProvisionOptions) {
     const credentials = await getAdminCredentials({ ... });
     const baseUrl = `https://box.${credentials.domain}`;
     
     // Make API call
     const result = await makeApiCall('POST', '/admin/ssl/provision', undefined, baseUrl, credentials.email, credentials.password);
     
     return result;
   }
   ```

---

## Files to Examine on Instance

When SSH access is available, examine these files:

### Critical Files
1. `/opt/mailinabox/web/web.py`
   - Flask routes for SSL provisioning
   - API endpoint definitions

2. `/opt/mailinabox/web/templates/system.html` (or similar)
   - UI template for SSL certificate page
   - Button handlers

3. `/opt/mailinabox/management/ssl_certificates.py`
   - Full script to understand all options
   - Command-line arguments
   - Error handling

### Supporting Files
4. `/opt/mailinabox/web/static/js/system.js` (if exists)
   - JavaScript for SSL provisioning UI

5. `/opt/mailinabox/management/utils.py`
   - Utility functions used by SSL script

6. `/opt/mailinabox/management/daily_tasks.sh`
   - How SSL provisioning is scheduled
   - Cron job configuration

---

## Commands to Run on Instance

```bash
# 1. List web UI files
ls -la /opt/mailinabox/web/

# 2. Find SSL-related routes
grep -n "ssl\|tls\|certificate" /opt/mailinabox/web/web.py

# 3. Find Flask routes
grep -n "@.*route" /opt/mailinabox/web/web.py | grep -i ssl

# 4. Check for API endpoints
grep -rn "def.*ssl\|def.*provision" /opt/mailinabox/web/

# 5. Examine SSL script options
python3 /opt/mailinabox/management/ssl_certificates.py --help

# 6. Check Python modules
python3 -c "import exclusiveprocess; print('OK')"

# 7. Test API endpoint (if exists)
curl -X POST https://box.emcnotary.com/admin/ssl/provision \
  -u admin@emcnotary.com:PASSWORD \
  -k -v
```

---

## Next Steps

1. **Immediate**: Fix current SSH-based provisioning script
   - Fix sudo command syntax
   - Add Python module check
   - Improve error handling

2. **Short-term**: Examine web UI code when SSH access available
   - Map Flask routes
   - Identify API endpoint
   - Test API call

3. **Medium-term**: Implement HTTP API approach
   - Create API client function
   - Add to `tools/ssl-provision-api.cli.ts`
   - Update pipeline to use API

4. **Long-term**: Comprehensive SSL management
   - Status checking via API
   - Domain-specific provisioning
   - Error handling and retries

---

## References

- **Current Provision Script**: `tools/ssl-provision.cli.ts`
- **Status Check Script**: `tools/ssl-status.cli.ts` (working correctly)
- **DNS API Example**: `libs/admin/admin-dns-restore/src/lib/restore-miab.ts`
- **Admin Credentials**: `libs/admin/admin-credentials/src/lib/credentials.ts`
- **Mail-in-a-Box Docs**: https://mailinabox.email/api-docs.html

---

## Conclusion

The audit reveals that Mail-in-a-Box uses a management script (`ssl_certificates.py`) for SSL provisioning, which can be invoked either:
1. **Via SSH** (current approach - needs fixes)
2. **Via HTTP API** (recommended - needs implementation)

The HTTP API approach is preferred because it:
- Matches what the UI does
- Provides structured responses
- Doesn't require SSH access
- Can be called from anywhere

**Immediate Action**: Fix the current SSH-based script while investigating the HTTP API endpoint.


