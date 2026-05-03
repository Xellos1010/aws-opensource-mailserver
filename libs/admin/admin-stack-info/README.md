# Admin Stack Info Library

TypeScript library for retrieving CloudFormation stack information and resolving stack names from app directories.

## Features

- **Stack Name Resolution**: Automatically resolves stack names from app directory paths or domains
- **Stack Info Retrieval**: Gets CloudFormation stack outputs, instance details, and admin passwords
- **Domain Mapping**: Maps app directories (e.g., `apps/clients/cdk-client-example`) to domains (e.g., `example.com`)

## Usage

### NX Tasks (Organized by Project)

Tasks are organized hierarchically by project (base and mailexample):

```bash
# sample mailserver - Get stack info
pnpm nx run admin-stack-info:get:mailexample  # Alternative syntax

# Base - Get stack info (requires DOMAIN or STACK_NAME)
DOMAIN=example.com pnpm nx run admin-stack-info:base:get
STACK_NAME=example-com-mailserver pnpm nx run admin-stack-info:base:get

# Generic - Get stack info (requires APP_PATH, DOMAIN, or STACK_NAME)
APP_PATH=apps/clients/cdk-client-example pnpm nx run admin-stack-info:get
DOMAIN=example.com pnpm nx run admin-stack-info:get
```

### Programmatic Usage

#### Get Stack Info from App Path

```typescript
import { getStackInfoFromApp } from '@mm/admin-stack-info';

const stackInfo = await getStackInfoFromApp('apps/clients/cdk-client-example', {
  region: 'us-east-1',
  profile: 'your-aws-profile',
});

console.log(stackInfo.stackName); // "example-com-mailserver"
console.log(stackInfo.domain); // "example.com"
console.log(stackInfo.instancePublicIp); // "1.2.3.4"
console.log(stackInfo.adminPassword); // "password123"
```

#### Get Stack Info from Domain or Stack Name

```typescript
import { getStackInfo } from '@mm/admin-stack-info';

const stackInfo = await getStackInfo({
  domain: 'example.com',
  region: 'us-east-1',
  profile: 'your-aws-profile',
});
```

### Resolve Domain/Stack Name

```typescript
import { resolveDomain, resolveStackName } from '@mm/admin-stack-info';

// Resolve domain from app path
const domain = resolveDomain('apps/clients/cdk-client-example'); // "example.com"

// Resolve stack name from domain
const stackName = resolveStackName('example.com'); // "example-com-mailserver"
```

## Stack Info Structure

```typescript
type StackInfo = {
  stackName: string;           // e.g., "example-com-mailserver"
  domain: string;              // e.g., "example.com"
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

- `apps/clients/cdk-client-example` → `example.com` → `example-com-mailserver`
- `apps/clients/cdk-client-example` → `example.org` → `example-org-mailserver`

## Integration with Backup Scripts

This library is integrated into:
- `admin-dns-backup`: Automatically finds hosted zone ID from stack
- `admin-mail-backup`: Automatically finds mail server connection details

## Environment Variables

- `AWS_PROFILE`: AWS CLI profile (default: `your-aws-profile`)
- `AWS_REGION`: AWS region (default: `us-east-1`)
- `APP_PATH`: App directory path (e.g., `apps/clients/cdk-client-example`)
- `STACK_NAME`: Explicit stack name
- `DOMAIN`: Domain name

## NX Tasks

### Project-Organized Tasks

Tasks are organized by project for easy navigation:

| Task | Description | Command |
|------|-------------|---------|
| `mailexample:get` | Get sample mailserver stack info | `pnpm nx run admin-stack-info:mailexample:get` |
| `get:mailexample` | Get sample mailserver stack info (alt) | `pnpm nx run admin-stack-info:get:mailexample` |
| `base:get` | Get base stack info | `DOMAIN=example.com pnpm nx run admin-stack-info:base:get` |
| `get:base` | Get base stack info (alt) | `DOMAIN=example.com pnpm nx run admin-stack-info:get:base` |
| `get` | Generic get (requires env vars) | `APP_PATH=apps/... pnpm nx run admin-stack-info:get` |

### Output Format

By default, output is JSON. Use `OUTPUT_FORMAT=text` for human-readable format:

```bash
OUTPUT_FORMAT=text pnpm nx run admin-stack-info:mailexample:get
```

## Building

```bash
pnpm nx build admin-stack-info
```

## Testing

```bash
pnpm nx test admin-stack-info
```
