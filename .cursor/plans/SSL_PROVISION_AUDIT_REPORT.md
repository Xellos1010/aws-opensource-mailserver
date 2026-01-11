# SSL Certificate Provisioning Pipeline Audit Report

**Date:** 2026-01-11  
**Stack:** `emcnotary-com-mailserver-instance`  
**Audit Scope:** SSL certificate provisioning pipeline for emc-notary instance stack

---

## Executive Summary

The SSL certificate provisioning pipeline (`admin:ssl:provision`) has **critical issues** that prevent successful certificate provisioning:

1. **❌ CRITICAL**: Missing Python module error (`exclusiveprocess`) causes Mail-in-a-Box SSL script to fail
2. **⚠️ HIGH**: Error handling masks failures by resolving successfully on non-zero exit codes
3. **⚠️ HIGH**: Incorrect sudo command syntax (`sudo -u root` should be `sudo`)
4. **⚠️ MEDIUM**: No post-provision validation to confirm certificates were actually created
5. **⚠️ MEDIUM**: No handling for common Mail-in-a-Box SSL provisioning failure scenarios

**Status Check Works**: The `admin:ssl:status` command correctly identifies that certificates are NOT provisioned (self-signed certificates detected).

---

## Current State Analysis

### Status Check Results (Working ✅)

From terminal output:
- ✅ Certificate files exist (`/home/user-data/ssl/ssl_certificate.pem`)
- ✅ Private key files exist (`/home/user-data/ssl/ssl_private_key.pem`)
- ⚠️ Certificate is **self-signed** (issuer: `box.emcnotary.com`)
- ⚠️ Multiple domains show "No certificate installed" in Mail-in-a-Box UI
- ⚠️ Let's Encrypt certificates NOT provisioned

**Verdict**: Certificates are NOT PROVISIONED (self-signed certificates detected)

### Provision Script Behavior (Failing ❌)

The provision script:
1. ✅ Successfully connects to instance via SSH
2. ✅ Executes Mail-in-a-Box SSL script: `python3 management/ssl_certificates.py --force`
3. ❌ **Fails silently** due to Python module error
4. ⚠️ Resolves successfully despite non-zero exit code (masks the failure)

---

## Critical Issues Identified

### Issue #1: Missing Python Module (CRITICAL)

**Location**: `tools/ssl-provision.cli.ts:91`

**Problem**:
```typescript
const provisionCommand = `cd /opt/mailinabox && sudo -u root python3 management/ssl_certificates.py --force`;
```

**Error Reported** (from DEPLOYMENT_STATUS.md):
```
ModuleNotFoundError: No module named 'exclusiveprocess'
```

**Root Cause**: 
- Mail-in-a-Box SSL script requires Python module `exclusiveprocess`
- Module may not be installed or Mail-in-a-Box installation incomplete
- Script fails but error is masked by provision script's error handling

**Impact**: SSL certificates cannot be provisioned via automated pipeline

**Fix Required**:
1. Verify Mail-in-a-Box installation is complete
2. Install missing Python dependencies: `pip3 install exclusiveprocess` (or check MIAB requirements)
3. Add pre-flight check to verify Python modules are available
4. Improve error detection to catch Python module errors

---

### Issue #2: Incorrect Sudo Command Syntax (HIGH)

**Location**: `tools/ssl-provision.cli.ts:91`

**Problem**:
```typescript
const provisionCommand = `cd /opt/mailinabox && sudo -u root python3 management/ssl_certificates.py --force`;
```

**Issue**: `sudo -u root` is incorrect syntax. Should be:
- `sudo python3 ...` (if ubuntu user has passwordless sudo)
- Or `sudo -u root -i python3 ...` (if interactive shell needed)
- Or check if script needs to run as specific user

**Correct Syntax**:
```typescript
// Option 1: Simple sudo (most common for passwordless sudo)
const provisionCommand = `cd /opt/mailinabox && sudo python3 management/ssl_certificates.py --force`;

// Option 2: If root environment needed
const provisionCommand = `cd /opt/mailinabox && sudo -i python3 management/ssl_certificates.py --force`;

// Option 3: Check Mail-in-a-Box documentation for correct user
const provisionCommand = `cd /opt/mailinabox && sudo -u mailinabox python3 management/ssl_certificates.py --force`;
```

**Impact**: Command may fail due to incorrect sudo syntax, or may not have proper permissions

**Fix Required**: Verify correct user/command for Mail-in-a-Box SSL script execution

---

### Issue #3: Error Handling Masks Failures (HIGH)

**Location**: `tools/ssl-provision.cli.ts:129-181`

**Problem**:
```typescript
ssh.on('close', (code) => {
  // ... connection error checks ...
  if (code === 0) {
    // Success
    resolve();
  } else if (isConnectionError) {
    // Connection errors - reject
    reject(...);
  } else {
    // Non-zero exit code but not connection error
    // ⚠️ PROBLEM: Resolves successfully even on failure!
    console.log(`\n⚠️  SSL provisioning exited with code ${code}`);
    // ...
    resolve(); // ❌ Should reject or validate success
  }
});
```

**Issue**: 
- Script resolves successfully even when Mail-in-a-Box SSL script fails (non-zero exit code)
- Python module errors, DNS validation failures, rate limiting, etc. are all masked
- User sees "success" but certificates are not actually provisioned

**Impact**: False positives - script reports success but certificates are not provisioned

**Fix Required**:
1. Parse Mail-in-a-Box SSL script output to detect actual failures
2. Check for specific error patterns (Python errors, DNS errors, rate limits)
3. Only resolve successfully if exit code is 0 AND output indicates success
4. Add post-provision validation (see Issue #4)

---

### Issue #4: No Post-Provision Validation (MEDIUM)

**Location**: `tools/ssl-provision.cli.ts` (missing)

**Problem**: 
- Script does not verify certificates were actually provisioned after running command
- No check for Let's Encrypt certificates vs self-signed certificates
- No validation that domains have valid certificates

**Impact**: Script may report success even if provisioning failed

**Fix Required**:
1. After running SSL script, verify certificates were created
2. Check certificate issuer (should be Let's Encrypt, not self-signed)
3. Validate certificates exist for all expected domains
4. Optionally call `ssl:status` check automatically after provision

---

### Issue #5: No Handling for Common Failure Scenarios (MEDIUM)

**Location**: `tools/ssl-provision.cli.ts` (missing)

**Common Mail-in-a-Box SSL Provisioning Failures**:
1. **DNS not ready**: Domains not pointing to instance IP
2. **Rate limiting**: Let's Encrypt rate limits (5 certs/week per domain)
3. **Port 80 blocked**: HTTP-01 challenge requires port 80 accessible
4. **DNS propagation delay**: DNS changes not propagated
5. **Python module errors**: Missing dependencies (current issue)
6. **Permission errors**: Script cannot write certificate files

**Current Behavior**: All failures are masked or not detected

**Fix Required**:
1. Add pre-flight checks:
   - Verify DNS records point to instance
   - Check port 80 accessibility
   - Verify Python modules available
2. Parse Mail-in-a-Box output for specific error messages
3. Provide actionable error messages with troubleshooting steps
4. Handle rate limiting gracefully (detect and inform user)

---

## Code Quality Issues

### Issue #6: Domains Parameter Not Used

**Location**: `tools/ssl-provision.cli.ts:80-83`

**Problem**:
```typescript
const domainsToProvision = options.domains || [hostname, domain];
console.log(`📋 Step 3: Provisioning SSL certificates for:`);
domainsToProvision.forEach((d) => console.log(`   - ${d}`));
// ... but domains are never passed to Mail-in-a-Box script
```

**Issue**: 
- Domains are determined and logged but never passed to Mail-in-a-Box script
- Mail-in-a-Box uses `--force` which provisions ALL configured domains
- User-provided `--domains` parameter is ignored

**Impact**: Cannot provision certificates for specific domains only

**Fix Required**:
- Check Mail-in-a-Box SSL script documentation for domain-specific provisioning
- If supported, pass domains to script
- If not supported, document that all domains are provisioned

---

### Issue #7: Inconsistent Error Messages

**Location**: `tools/ssl-provision.cli.ts:146-180`

**Problem**: 
- Success message references wrong command: `admin:bootstrap:confirm` (doesn't exist)
- Should reference `admin:ssl:status` instead
- Error messages don't match actual failure modes

**Fix Required**: Update error messages and next steps to match actual available commands

---

## Comparison: Provision vs Status Scripts

### Status Script (Working ✅)

**Strengths**:
- ✅ Proper error handling with clear exit codes
- ✅ Comprehensive checks (8 different validations)
- ✅ Clear verdict with actionable next steps
- ✅ Detects self-signed vs Let's Encrypt certificates
- ✅ Validates certificate expiration
- ✅ Checks HTTPS endpoint directly

**Why It Works**:
- Uses simple SSH commands that don't depend on Mail-in-a-Box Python modules
- Checks actual certificate files and HTTPS endpoints
- Provides clear pass/fail/warning status

### Provision Script (Failing ❌)

**Weaknesses**:
- ❌ Depends on Mail-in-a-Box Python script (has module errors)
- ❌ Masks failures with incorrect error handling
- ❌ No validation that provisioning succeeded
- ❌ Incorrect sudo command syntax
- ❌ No pre-flight checks

**Why It Fails**:
- Mail-in-a-Box SSL script fails due to missing Python module
- Error handling resolves successfully even on failure
- No post-provision validation

---

## Recommended Fixes

### Priority 1: Fix Critical Issues (Immediate)

1. **Fix Python Module Error**
   ```bash
   # SSH into instance and verify/install dependencies
   ssh -i ~/.ssh/emcnotary.com-keypair.pem ubuntu@3.229.143.6
   cd /opt/mailinabox
   pip3 install exclusiveprocess  # Or check MIAB requirements.txt
   ```

2. **Fix Sudo Command Syntax**
   ```typescript
   // Change from:
   const provisionCommand = `cd /opt/mailinabox && sudo -u root python3 management/ssl_certificates.py --force`;
   
   // To (verify correct syntax):
   const provisionCommand = `cd /opt/mailinabox && sudo python3 management/ssl_certificates.py --force`;
   ```

3. **Fix Error Handling**
   ```typescript
   ssh.on('close', (code) => {
     if (code === 0) {
       // Verify success by checking output or running status check
       resolve();
     } else {
       // Always reject on non-zero exit codes unless we can verify success
       reject(new Error(`SSL provisioning failed with exit code ${code}`));
     }
   });
   ```

### Priority 2: Add Validation (High)

4. **Add Post-Provision Validation**
   ```typescript
   // After running SSL script, verify certificates were provisioned
   const verifyCommand = `openssl x509 -in /home/user-data/ssl/ssl_certificate.pem -noout -issuer 2>/dev/null`;
   const issuerCheck = await sshCommand(keyPath, instanceIp, verifyCommand);
   
   if (!issuerCheck.output.includes('Let\'s Encrypt')) {
     throw new Error('Certificate provisioning failed: Still using self-signed certificate');
   }
   ```

5. **Add Pre-Flight Checks**
   ```typescript
   // Check Python modules before running
   const pythonCheck = await sshCommand(
     keyPath,
     instanceIp,
     'python3 -c "import exclusiveprocess" 2>&1'
   );
   if (!pythonCheck.success) {
     throw new Error('Missing Python module: exclusiveprocess. Install with: pip3 install exclusiveprocess');
   }
   ```

### Priority 3: Improve User Experience (Medium)

6. **Parse Mail-in-a-Box Output**
   - Detect specific error messages (DNS errors, rate limits, etc.)
   - Provide actionable error messages
   - Add retry logic for transient failures

7. **Add Domain-Specific Provisioning**
   - Check if Mail-in-a-Box supports domain-specific provisioning
   - If yes, pass domains to script
   - If no, document behavior clearly

---

## Testing Plan

### Test Case 1: Successful Provisioning
1. Ensure Python modules are installed
2. Run `admin:ssl:provision`
3. Verify exit code is 0
4. Run `admin:ssl:status` and verify certificates are Let's Encrypt (not self-signed)
5. Verify all domains have certificates

### Test Case 2: Python Module Error
1. Remove `exclusiveprocess` module
2. Run `admin:ssl:provision`
3. Verify script detects and reports Python module error
4. Verify script exits with non-zero code
5. Verify error message is actionable

### Test Case 3: DNS Not Ready
1. Point DNS away from instance
2. Run `admin:ssl:provision`
3. Verify script detects DNS issue
4. Verify error message explains DNS requirement

### Test Case 4: Rate Limiting
1. Provision certificates multiple times (if rate limited)
2. Verify script detects rate limit error
3. Verify error message explains rate limit

---

## Implementation Checklist

- [ ] Fix Python module installation (verify Mail-in-a-Box dependencies)
- [ ] Fix sudo command syntax
- [ ] Fix error handling to reject on non-zero exit codes
- [ ] Add post-provision validation (check for Let's Encrypt certificates)
- [ ] Add pre-flight checks (Python modules, DNS, port 80)
- [ ] Parse Mail-in-a-Box output for specific errors
- [ ] Update error messages and next steps
- [ ] Add domain-specific provisioning (if supported)
- [ ] Add comprehensive tests
- [ ] Update documentation

---

## References

- **Status Script**: `tools/ssl-status.cli.ts` (working correctly)
- **Provision Script**: `tools/ssl-provision.cli.ts` (needs fixes)
- **Deployment Status**: `.cursor/plans/DEPLOYMENT_STATUS.md` (documents Python module error)
- **Mail-in-a-Box SSL Script**: `/opt/mailinabox/management/ssl_certificates.py`
- **Nx Target**: `apps/cdk-emc-notary/instance/project.json:409` (`admin:ssl:provision`)

---

## Conclusion

The SSL certificate provisioning pipeline has **critical issues** that prevent successful certificate provisioning. The primary issue is a missing Python module (`exclusiveprocess`), but the script also has error handling problems that mask failures.

**Immediate Actions Required**:
1. Fix Python module installation on instance
2. Fix error handling to properly detect failures
3. Add post-provision validation
4. Fix sudo command syntax

**Expected Outcome**: After fixes, the provision script should:
- Detect and report errors correctly
- Validate that certificates were actually provisioned
- Provide actionable error messages
- Exit with appropriate codes (0 for success, non-zero for failure)


