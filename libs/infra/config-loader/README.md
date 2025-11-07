# Config Loader

Secure configuration loader for AWS and CDK deployments.

## Overview

This library provides a secure way to load deployment configuration without committing sensitive values to the repository.

## Configuration Priority

1. **Environment variables** (highest priority)
2. **Local config file** (`.aws-config.local.json` - gitignored)
3. **Default values** (lowest priority)

## Usage

### Basic Usage

```typescript
import { loadDeploymentConfig, getCdkEnvVars } from '@mm/infra-config-loader';

// Load full config
const config = loadDeploymentConfig();
console.log(config.aws.profile); // 'hepe-admin-mfa'
console.log(config.aws.region); // 'us-east-1'

// Get CDK environment variables
const envVars = getCdkEnvVars();
// { AWS_PROFILE: 'hepe-admin-mfa', AWS_REGION: 'us-east-1', ... }
```

### Local Config File

Create `.aws-config.local.json` in the project root (this file is gitignored):

```json
{
  "aws": {
    "profile": "hepe-admin-mfa",
    "region": "us-east-1",
    "accountId": "123456789012"
  },
  "cdk": {
    "defaultAccount": "123456789012",
    "defaultRegion": "us-east-1"
  }
}
```

### Environment Variables

You can override any config value using environment variables:

```bash
export AWS_PROFILE=my-profile
export AWS_REGION=us-west-2
export CDK_DEFAULT_ACCOUNT=123456789012
export CDK_DEFAULT_REGION=us-west-2
```

## Security

- The local config file (`.aws-config.local.json`) is gitignored
- Never commit AWS credentials or account IDs to the repository
- Use environment variables in CI/CD pipelines
- The config loader validates file permissions and handles errors gracefully

