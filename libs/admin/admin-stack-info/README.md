# Admin Stack Info Library

TypeScript library for retrieving CloudFormation stack information and resolving stack names from app directories.

## Features

- **Stack Name Resolution**: Automatically resolves stack names from app directory paths or domains
- **Stack Info Retrieval**: Gets CloudFormation stack outputs, instance details, and admin passwords
- **Domain Mapping**: Maps app directories (e.g., `apps/cdk-emc-notary`) to domains (e.g., `emcnotary.com`)

## Usage

### NX Tasks (Organized by Project)

Tasks are organized hierarchically by project (base and emcnotary):

```bash
# EMC Notary - Get stack info
pnpm nx run admin-stack-info:emcnotary:get
pnpm nx run admin-stack-info:get:emcnotary  # Alternative syntax

# Base - Get stack info (requires DOMAIN or STACK_NAME)
DOMAIN=example.com pnpm nx run admin-stack-info:base:get
STACK_NAME=example-com-mailserver pnpm nx run admin-stack-info:base:get

# Generic - Get stack info (requires APP_PATH, DOMAIN, or STACK_NAME)
APP_PATH=apps/cdk-emc-notary pnpm nx run admin-stack-info:get
DOMAIN=emcnotary.com pnpm nx run admin-stack-info:get
```

### Programmatic Usage

#### Get Stack Info from App Path

```typescript
import { getStackInfoFromApp } from '@mm/admin-stack-info';

const stackInfo = await getStackInfoFromApp('apps/cdk-emc-notary', {
  region: 'us-east-1',
  profile: 'hepe-admin-mfa',
});

console.log(stackInfo.stackName); // "emcnotary-com-mailserver"
console.log(stackInfo.domain); // "emcnotary.com"
console.log(stackInfo.instancePublicIp); // "1.2.3.4"
console.log(stackInfo.adminPassword); // "password123"
```

#### Get Stack Info from Domain or Stack Name

```typescript
import { getStackInfo } from '@mm/admin-stack-info';

const stackInfo = await getStackInfo({
  domain: 'emcnotary.com',
  region: 'us-east-1',
  profile: 'hepe-admin-mfa',
});
```

### Resolve Domain/Stack Name

```typescript
import { resolveDomain, resolveStackName } from '@mm/admin-stack-info';

// Resolve domain from app path
const domain = resolveDomain('apps/cdk-emc-notary'); // "emcnotary.com"

// Resolve stack name from domain
const stackName = resolveStackName('emcnotary.com'); // "emcnotary-com-mailserver"
```

## Stack Info Structure

```typescript
type StackInfo = {
  stackName: string;           // e.g., "emcnotary-com-mailserver"
  domain: string;              // e.g., "emcnotary.com"
  region: string;              // e.g., "us-east-1"
  outputs: StackOutputs;       // All CloudFormation stack outputs
  instanceId?: string;         // EC2 instance ID
  instancePublicIp?: string;   // EC2 instance public IP
  adminPassword?: string;      // Mail-in-a-Box admin password
  hostedZoneId?: string;       // Route53 hosted zone ID
};
```

## Domain Mapping

The library automatically maps app directory names to domains:

- `apps/cdk-emc-notary` → `emcnotary.com` → `emcnotary-com-mailserver`
- `apps/cdk-askdaokapra` → `askdaokapra.com` → `askdaokapra-com-mailserver`

## Integration with Backup Scripts

This library is integrated into:
- `admin-dns-backup`: Automatically finds hosted zone ID from stack
- `admin-mail-backup`: Automatically finds mail server connection details

## Environment Variables

- `AWS_PROFILE`: AWS CLI profile (default: `hepe-admin-mfa`)
- `AWS_REGION`: AWS region (default: `us-east-1`)
- `APP_PATH`: App directory path (e.g., `apps/cdk-emc-notary`)
- `STACK_NAME`: Explicit stack name
- `DOMAIN`: Domain name

## NX Tasks

### Project-Organized Tasks

Tasks are organized by project for easy navigation:

| Task | Description | Command |
|------|-------------|---------|
| `emcnotary:get` | Get EMC Notary stack info | `pnpm nx run admin-stack-info:emcnotary:get` |
| `get:emcnotary` | Get EMC Notary stack info (alt) | `pnpm nx run admin-stack-info:get:emcnotary` |
| `base:get` | Get base stack info | `DOMAIN=example.com pnpm nx run admin-stack-info:base:get` |
| `get:base` | Get base stack info (alt) | `DOMAIN=example.com pnpm nx run admin-stack-info:get:base` |
| `get` | Generic get (requires env vars) | `APP_PATH=apps/... pnpm nx run admin-stack-info:get` |

### Output Format

By default, output is JSON. Use `OUTPUT_FORMAT=text` for human-readable format:

```bash
OUTPUT_FORMAT=text pnpm nx run admin-stack-info:emcnotary:get
```

## Building

```bash
pnpm nx build admin-stack-info
```

## Testing

```bash
pnpm nx test admin-stack-info
```
