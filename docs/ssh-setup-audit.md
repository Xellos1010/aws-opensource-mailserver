# SSH Setup Audit & Implementation

## Audit Summary

### Original Bash Script Analysis (`setup-ssh-access.sh`)

The original bash script (`Archive/administration/setup-ssh-access.sh`) implements SSH key management as follows:

1. **Stack Information Retrieval**:
   - Gets `KeyPairId` from CloudFormation stack outputs (`OutputKey="KeyPairId"`)
   - Gets instance ID from stack outputs (`OutputKey="RestorePrefix"`)
   - Gets instance public IP from EC2 API
   - Gets instance key pair name from EC2 API (`KeyName` field)

2. **SSH Key Retrieval**:
   - Retrieves private key from SSM Parameter Store: `/ec2/keypair/${KEY_PAIR_ID}`
   - Uses `--with-decryption` flag to decrypt the parameter

3. **Key Storage**:
   - Stores key in `~/.ssh/${INSTANCE_KEY_NAME}.pem`
   - Sets permissions to `400` (read-only for owner)
   - Verifies key format using `ssh-keygen -l -f`

4. **Known Hosts Management**:
   - Adds instance IP to `~/.ssh/known_hosts` using `ssh-keyscan`

5. **SSH Config Generation**:
   - Generates SSH config entry for easy access
   - Uses domain name as host alias

## Implementation

### Enhanced `admin-stack-info` Library

**Changes Made**:
- Added `instanceKeyName` to `StackInfo` type
- Added `keyPairId` to `StackInfo` type
- Enhanced instance discovery to query by stack tags if instance ID lookup fails
- Retrieves `KeyName` from EC2 instance details

**Key Features**:
- Automatically discovers instance key name from EC2 API
- Falls back to stack tag-based instance lookup if direct instance ID lookup fails
- Provides all necessary information for SSH setup

### New `admin-ssh` Library

**Created Components**:

1. **`ssh-setup.ts`** - Core SSH setup functionality:
   - `setupSshKey()`: Retrieves and stores SSH keys from SSM
   - `setupSshForStack()`: High-level function that uses stack info
   - Handles key validation, permissions, and known_hosts management

2. **`ssh-keys.ts`** - Helper functions for EC2 scripts:
   - `getSshKeyPath()`: Gets SSH key path, automatically sets up if needed
   - `getSshConnectionInfo()`: Gets full SSH connection details

3. **`bin/setup-ssh.ts`** - CLI entry point:
   - Supports `APP_PATH`, `STACK_NAME`, or `DOMAIN` input
   - Provides hierarchical NX tasks matching folder structure

**Key Features**:
- Automatic key retrieval from SSM Parameter Store
- Key storage in accessible location (`~/.ssh/`)
- Proper permission handling (400)
- Key format validation
- Known hosts management
- SSH config generation
- Fallback key naming if instance key name not available

## Usage

### Setup SSH for EMC Notary

```bash
# Using hierarchical app path target (recommended)
pnpm nx run admin-ssh:setup:apps:cdk-emc-notary

# Using domain-specific target
pnpm nx run admin-ssh:setup:emcnotary
```

### Programmatic Usage

```typescript
import { setupSshForStack } from '@mm/admin-ssh';
import { getStackInfoFromApp } from '@mm/admin-stack-info';

const stackInfo = await getStackInfoFromApp('apps/cdk-emc-notary');
const result = await setupSshForStack(stackInfo);

// Key is now available at: result.keyFilePath
// Use in SSH commands: ssh -i ${result.keyFilePath} ubuntu@${instanceIp}
```

### EC2 Script Integration

```typescript
import { getSshKeyPath } from '@mm/admin-ssh';

// Get key path (automatically sets up if needed)
const keyPath = await getSshKeyPath({
  appPath: 'apps/cdk-emc-notary',
  ensureSetup: true,
});

if (keyPath) {
  // Use in SSH commands
  execSync(`ssh -i ${keyPath} ubuntu@${instanceIp} "command"`);
}
```

## Key Storage Location

- **Location**: `~/.ssh/${INSTANCE_KEY_NAME}.pem`
- **Example**: `~/.ssh/emcnotary-com-keypair.pem`
- **Permissions**: `400` (read-only for owner)
- **Accessible to**: All EC2 management scripts via helper functions

## Testing Results

✅ **SSH Setup Test for EMC Notary**:
- Successfully retrieved `KeyPairId` from stack outputs
- Successfully retrieved instance IP (52.0.22.22)
- Successfully derived key name when instance key name not available
- Successfully retrieved private key from SSM Parameter Store (`/ec2/keypair/key-0d0b7f9796b2f968c`)
- Successfully stored key at `~/.ssh/emcnotary-com-keypair.pem`
- Successfully verified key format
- Generated SSH config entry

## Differences from Original Script

1. **TypeScript Implementation**: Fully typed, better error handling
2. **Flexible Key Naming**: Derives key name from stack name if instance key name unavailable
3. **Stack Tag Fallback**: Queries instances by stack tag if direct instance ID lookup fails
4. **Programmatic API**: Can be used by other scripts, not just CLI
5. **Helper Functions**: Provides `getSshKeyPath()` and `getSshConnectionInfo()` for EC2 scripts

## Integration with EC2 Management Scripts

EC2 management scripts can now:

1. **Get SSH Key Path**:
   ```typescript
   const keyPath = await getSshKeyPath({ appPath: 'apps/cdk-emc-notary' });
   ```

2. **Get Full Connection Info**:
   ```typescript
   const conn = await getSshConnectionInfo({ appPath: 'apps/cdk-emc-notary' });
   // conn.keyPath, conn.host, conn.user, conn.sshCommand
   ```

3. **Automatic Setup**: Keys are automatically set up if they don't exist (when `ensureSetup: true`)

## NX Tasks

Hierarchical tasks matching folder structure:
- `admin-ssh:setup:apps:cdk-emc-notary` - EMC Notary SSH setup
- `admin-ssh:setup:emcnotary` - Domain shortcut

## Files Created/Modified

### Created:
- `libs/admin/admin-ssh/src/lib/ssh-setup.ts` - Core SSH setup logic
- `libs/admin/admin-ssh/src/lib/ssh-keys.ts` - Helper functions for EC2 scripts
- `libs/admin/admin-ssh/bin/setup-ssh.ts` - CLI entry point
- `libs/admin/admin-ssh/README.md` - Documentation

### Modified:
- `libs/admin/admin-stack-info/src/lib/stack-info.ts` - Added `instanceKeyName` and `keyPairId` to stack info
- `tsconfig.base.json` - Added `@mm/admin-ssh` path alias

## Conclusion

The SSH setup framework is now fully integrated and working. It:
- ✅ Retrieves keys from SSM Parameter Store
- ✅ Stores keys in accessible location (`~/.ssh/`)
- ✅ Provides helper functions for EC2 management scripts
- ✅ Supports hierarchical NX tasks
- ✅ Handles edge cases (missing instance key names, terminated instances)
- ✅ Successfully tested with EMC Notary stack

EC2 management scripts can now easily access SSH keys using the `getSshKeyPath()` helper function.

