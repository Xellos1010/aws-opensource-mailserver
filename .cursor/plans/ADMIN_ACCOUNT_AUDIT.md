# Admin Account Audit: admin@emcnotary.com Login Issue

## Problem Statement

The `admin@emcnotary.com` account exists in the database but login fails with "Incorrect email address or password" error.

## Root Cause Analysis

### Bootstrap Script Flow

**File:** `libs/support-scripts/aws/instance-bootstrap/assets/miab-setup.sh`

1. **Line 66:** `PRIMARY_HOSTNAME="${INSTANCE_DNS}.${DOMAIN_NAME}"`
   - Results in: `box.emcnotary.com`

2. **Line 139:** `EMAIL_ADDR="admin@${DOMAIN_NAME}"`
   - Results in: `admin@emcnotary.com` (for password storage in SSM)

3. **Line 390:** `EMAIL_ADDR="admin@${DOMAIN_NAME}"`
   - Used to CREATE admin account (lines 456-496)

4. **Line 500:** `ME_USER="me@${PRIMARY_HOSTNAME}"`
   - Results in: `me@box.emcnotary.com`
   - Created AFTER admin account creation attempt (lines 498-515)

### The Issue

Mail-in-a-Box has a restriction that prevents creating `admin@domain` accounts when other users already exist. The restriction is enforced in `/opt/mailinabox/management/mailconfig.py`:

```python
if is_dcv_address(email) and len(get_mail_users(env)) > 0:
    return ("You may not make a user account for that address because it is frequently used for domain control validation. Use an alias instead if necessary.", 400)
```

**What happens:**
1. Mail-in-a-Box initial setup may create `me@box.emcnotary.com` automatically
2. Bootstrap script tries to create `admin@emcnotary.com` (line 463)
3. Creation fails because `me@box.emcnotary.com` already exists
4. Script falls back to only setting password for `me@box.emcnotary.com` (line 500)
5. `admin@emcnotary.com` is later created directly in database (bypassing MIAB checks)
6. Account exists but may not be properly activated for web UI login

## Current Account Status

From terminal output:
```
1. me@box.emcnotary.com* (admin privileges)
2. admin@emcnotary.com* (admin privileges)  
3. me@emcnotary.com
```

- ✅ `admin@emcnotary.com` exists in database
- ✅ Password hash was updated via CLI (`cli.py user password`)
- ⚠️  Login still fails (account may not be properly activated)

## Solution Options

### Option A: Modify Bootstrap Script (Recommended)

**Change:** Create `admin@emcnotary.com` FIRST, before any other users.

**Modification to `miab-setup.sh`:**

1. Remove the `me@${PRIMARY_HOSTNAME}` creation (lines 498-515)
2. Ensure `admin@emcnotary.com` is created during initial setup when no users exist
3. Create `me@box.emcnotary.com` as an alias pointing to `admin@emcnotary.com` if needed

**Pros:**
- Works within Mail-in-a-Box's restrictions
- Account created properly during setup
- No manual database manipulation needed

**Cons:**
- Requires re-bootstrap to take effect

### Option B: Fix Current Account

**Steps:**
1. Verify password hash is correct
2. Check if account needs mailbox directory created
3. Ensure account is properly activated in Mail-in-a-Box

**Pros:**
- No re-bootstrap needed
- Quick fix

**Cons:**
- May not address root cause
- Account may still have issues

### Option C: Re-bootstrap with Modified Script

**Steps:**
1. Modify bootstrap script to create `admin@emcnotary.com` first
2. Re-run bootstrap process
3. Account will be created properly during setup

**Pros:**
- Clean solution
- Follows Mail-in-a-Box best practices

**Cons:**
- Requires instance re-bootstrap
- May require backup/restore of data

## Recommended Action Plan

1. **Immediate:** Test if password reset fixed login issue
2. **Short-term:** Modify bootstrap script to create `admin@emcnotary.com` first
3. **Long-term:** Re-bootstrap instance with modified script (if login still fails)

## Files to Modify

- `libs/support-scripts/aws/instance-bootstrap/assets/miab-setup.sh`
  - Lines 498-515: Remove or modify `me@${PRIMARY_HOSTNAME}` creation
  - Lines 456-496: Ensure `admin@emcnotary.com` creation happens first

## Testing

After modifications:
1. Test bootstrap script in dry-run mode
2. Verify `admin@emcnotary.com` is created before any other users
3. Confirm login works after bootstrap


