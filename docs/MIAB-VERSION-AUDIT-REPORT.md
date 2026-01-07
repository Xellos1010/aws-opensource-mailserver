# Mail-in-a-Box Version Hardcoded References Audit Report

**Date:** 2025-01-XX  
**Purpose:** Comprehensive audit of hardcoded Mail-in-a-Box version references after refactoring to remove hardcoded fallbacks

## Summary

All hardcoded version fallbacks have been removed. Version resolution now follows this priority:
1. Explicit override (`MAILINABOX_VERSION` env var or `--version` flag)
2. SSM Parameter Store (`/MailInABoxVersion-{stackName}`)
3. GitHub API (latest release tag)
4. Fail with clear error (no hardcoded fallback)

## Files Modified

### Core Implementation Files

#### ✅ `libs/support-scripts/aws/instance-bootstrap/src/lib/bootstrap.ts`
- **Status:** COMPLETE
- **Changes:**
  - Added `getMiabVersionFromSsm()` function for SSM Parameter Store lookup
  - Refactored `getMiabVersion()` to remove hardcoded `'v73'` fallback
  - Updated to use SSM Parameter Store as Priority 2 (before GitHub API)
  - Updated error messages to require explicit version if all methods fail
  - Removed hardcoded `'v73'` from console.log fallback messages
  - Updated JSDoc comment to reflect new resolution strategy
- **Remaining References:** None (examples in error messages are acceptable)

#### ✅ `libs/support-scripts/aws/instance-bootstrap/assets/miab-setup.sh`
- **Status:** COMPLETE
- **Changes:**
  - Removed hardcoded default `v73` from `MIAB_TAG` assignment
  - Added validation to exit with error if `MAILINABOX_VERSION` is not set
  - Updated error message to indicate version must be provided
- **Remaining References:** None (comments showing example extraction logic are acceptable)

#### ✅ `tools/audit-miab-version.cli.ts`
- **Status:** COMPLETE
- **Changes:**
  - Added `getMiabVersionFromSsm()` function
  - Removed hardcoded `'v73'` fallback
  - Updated to use same version resolution strategy as bootstrap
  - Added SSM Parameter Store lookup as Priority 2
  - Updated error messages to require explicit version
- **Remaining References:** None (example in error message is acceptable)

### Documentation Files

#### ✅ `libs/infra/instance-constructs/src/lib/domain-config.ts`
- **Status:** COMPLETE
- **Changes:**
  - Updated JSDoc comment from `(default: "v73")` to `(auto-fetched from GitHub API, SSM Parameter Store, or explicit override)`

#### ✅ `libs/infra/instance-constructs/README.md`
- **Status:** COMPLETE
- **Changes:**
  - Updated comment from `(default: "v73")` to `(auto-fetched from GitHub API, SSM Parameter Store, or explicit override)`

#### ✅ `docs/MIAB-CLEANUP-AND-REBOOTSTRAP.md`
- **Status:** COMPLETE
- **Changes:**
  - Updated "Checks out correct tag" description to reflect auto-detection
  - Updated "Version Default" note to document resolution strategy

#### ✅ `docs/bootstrap-audit.md`
- **Status:** COMPLETE
- **Changes:**
  - Updated old reference from `v64.0` default to required variable with comment

### Other Files

#### ✅ `tools/create-admin-account.cli.ts`
- **Status:** COMPLETE
- **Changes:**
  - Updated comments from "v73+" to "newer versions" (more generic)

#### ✅ `tools/list-miab-users.cli.ts`
- **Status:** COMPLETE
- **Changes:**
  - Removed hardcoded version suggestions (`v73.0`, `v72.0`, `v71.0`) from troubleshooting message
  - Updated to suggest checking available tags dynamically

#### ✅ `tools/instance-bootstrap.cli.ts`
- **Status:** VERIFIED
- **Remaining References:** Example in help text (`e.g., "v73"`) - ACCEPTABLE as example only

## Acceptable References

The following references are **acceptable** as they are examples, not hardcoded fallbacks:

1. **Error message examples** - Showing `v73` as an example of how to set the version
2. **Help text examples** - CLI help showing `e.g., "v73"` as usage example
3. **Code comments** - Comments explaining logic (e.g., "Extract major version (e.g., '73' from 'v73')")

## Breaking Changes

### Before
- Bootstrap would fall back to `v73` if GitHub API was unavailable
- Bash script had default `v73` if `MAILINABOX_VERSION` was not set
- Audit script would use `v73` as fallback

### After
- Bootstrap **requires** version resolution via one of three methods
- Bash script **requires** `MAILINABOX_VERSION` to be set (no default)
- Audit script **requires** version resolution (no fallback)
- All scripts fail with clear error messages if version cannot be resolved

### Migration Guide

Users must ensure one of the following is available:

1. **Set environment variable:**
   ```bash
   MAILINABOX_VERSION=v73 pnpm nx run cdk-emcnotary-instance:admin:bootstrap-miab-ec2-instance
   ```

2. **Set SSM parameter:**
   ```bash
   aws ssm put-parameter \
     --name "/MailInABoxVersion-{stack-name}" \
     --value "v73" \
     --type "String"
   ```

3. **Ensure GitHub API access:**
   - Scripts will automatically fetch latest release tag
   - Requires internet access to `api.github.com`

4. **Use CLI flag (bootstrap only):**
   ```bash
   pnpm nx run cdk-emcnotary-instance:admin:bootstrap-miab-ec2-instance -- --version v73
   ```

## Testing Recommendations

1. ✅ Test with `MAILINABOX_VERSION` env var set
2. ✅ Test with SSM parameter set
3. ✅ Test with GitHub API available
4. ✅ Test with GitHub API unavailable (should fail with clear error)
5. ✅ Test with all methods unavailable (should fail with clear error)
6. ✅ Verify bash script fails gracefully if version not provided

## Conclusion

All hardcoded version fallbacks have been successfully removed. The codebase now uses a robust version resolution strategy that prioritizes explicit configuration, SSM Parameter Store, and GitHub API, with clear error messages when none are available.

**Status:** ✅ COMPLETE - All hardcoded references removed or verified as acceptable examples


















