# Admin SSH Library

TypeScript library for managing SSH keys and setting up SSH access for CloudFormation stacks. Retrieves SSH keys from SSM Parameter Store and stores them in an accessible location for EC2 management scripts.

## Features

- **Automatic Key Retrieval**: Retrieves SSH private keys from SSM Parameter Store
- **Key Storage**: Stores keys in `~/.ssh/` with proper permissions (400)
- **Key Validation**: Verifies key format using ssh-keygen
- **Known Hosts Management**: Automatically adds hosts to known_hosts
- **SSH Config Generation**: Generates SSH config entries for easy access
- **EC2 Script Integration**: Provides helper functions for EC2 management scripts

## Usage

### Setup SSH for sample mailserver

```bash
# Using hierarchical app path target (recommended)
pnpm nx run admin-ssh:setup:apps:cdk-emc-notary

# Using domain-specific target
pnpm nx run admin-ssh:setup:mailexample

# Using app path
APP_PATH=apps/clients/cdk-client-example pnpm nx run admin-ssh:setup

# Using domain
DOMAIN=example.com pnpm nx run admin-ssh:setup
```

### Programmatic Usage

```typescript
import { setupSshForStack, getSshKeyPath, getSshConnectionInfo } from '@mm/admin-ssh';
import { getStackInfoFromApp } from '@mm/admin-stack-info';

// Setup SSH for a stack
const stackInfo = await getStackInfoFromApp('apps/clients/cdk-client-example');
const result = await setupSshForStack(stackInfo);

console.log(`Key file: ${result.keyFilePath}`);
console.log(`SSH command: ssh -i ${result.keyFilePath} ubuntu@${stackInfo.instancePublicIp}`);

// Get SSH key path (automatically sets up if needed)
const keyPath = await getSshKeyPath({
  appPath: 'apps/clients/cdk-client-example',
  ensureSetup: true,
});

// Get full SSH connection info
const connInfo = await getSshConnectionInfo({
  appPath: 'apps/clients/cdk-client-example',
});
```

## How It Works

### SSH Setup Process

1. **Get Stack Information**: Retrieves CloudFormation stack details including:
   - `KeyPairId` from stack outputs
   - Instance key name from EC2 instance details
   - Instance public IP

2. **Retrieve Private Key**: Downloads private key from SSM Parameter Store:
   - Parameter path: `/ec2/keypair/${KEY_PAIR_ID}`
   - Decrypts the parameter value

3. **Store Key File**: Saves key to `~/.ssh/${INSTANCE_KEY_NAME}.pem`:
   - Sets permissions to 400 (read-only for owner)
   - Verifies key format with ssh-keygen

4. **Update Known Hosts**: Adds instance IP to `~/.ssh/known_hosts`:
   - Uses ssh-keyscan to get host keys
   - Prevents SSH host key verification prompts

5. **Generate SSH Config**: Creates SSH config entry for easy access:
   ```
   Host example.com
       HostName 52.0.22.22
       User ubuntu
       IdentityFile ~/.ssh/example-com-mailserver-keypair.pem
       StrictHostKeyChecking no
   ```

### Key Storage Location

Keys are stored in the standard SSH directory:
- **Location**: `~/.ssh/${INSTANCE_KEY_NAME}.pem`
- **Example**: `~/.ssh/example-com-mailserver-keypair.pem`
- **Permissions**: `400` (read-only for owner)

### EC2 Script Integration

EC2 management scripts can use the helper functions:

```typescript
import { getSshKeyPath } from '@mm/admin-ssh';

// Get key path for a stack (automatically sets up if needed)
const keyPath = await getSshKeyPath({
  appPath: 'apps/clients/cdk-client-example',
});

if (keyPath) {
  // Use key path in SSH commands
  execSync(`ssh -i ${keyPath} ubuntu@${instanceIp} "command"`);
}
```

## Environment Variables

| Variable | Description | Required | Default |
|----------|-------------|----------|---------|
| `APP_PATH` | App directory path (e.g., `apps/clients/cdk-client-example`) | No* | - |
| `STACK_NAME` | Explicit CloudFormation stack name | No* | - |
| `DOMAIN` | Domain name (e.g., `example.com`) | No* | - |
| `AWS_PROFILE` | AWS CLI profile | No | `your-aws-profile` |
| `AWS_REGION` | AWS region | No | `us-east-1` |

\* At least one of `APP_PATH`, `STACK_NAME`, or `DOMAIN` must be provided.

## Examples

```bash
# Setup SSH for sample mailserver
pnpm nx run admin-ssh:setup:apps:cdk-emc-notary

# After setup, connect using:
ssh example.com  # If SSH config entry was added
# Or:
ssh -i ~/.ssh/example-com-mailserver-keypair.pem ubuntu@52.0.22.22
```

## Building

```bash
pnpm nx build admin-ssh
```

## Testing

```bash
pnpm nx test admin-ssh
```

## Related

- `admin-stack-info`: Stack information retrieval
- `admin-ec2`: EC2 instance management
- Original bash script: `Archive/administration/setup-ssh-access.sh`
