# Domain-Aware Nx Tasks Reference

This document describes all Nx tasks that support domain configuration for multi-domain mail server management.

## Overview

All CDK stack tasks and admin tasks now support domain configuration via:
- **Environment Variable**: `DOMAIN=askdaokapra.com`
- **CDK Context**: `--context domain=askdaokapra.com` (passed automatically by tasks)
- **Command Argument**: `pnpm nx run ops-runner:run -- stack:core:deploy askdaokapra.com`

Default domain is `emcnotary.com` for backward compatibility.

## CDK Stack Tasks

### Core Stack (`cdk-emcnotary-core`)

#### Build
```bash
pnpm nx run cdk-emcnotary-core:build
```
Builds the core stack application. No domain configuration needed.

#### Synthesize
```bash
# Default domain (emcnotary.com)
pnpm nx run cdk-emcnotary-core:synth

# Different domain
DOMAIN=askdaokapra.com pnpm nx run cdk-emcnotary-core:synth
```
Generates CloudFormation template. Domain passed via CDK context.

#### Deploy
```bash
# Default domain (emcnotary.com)
FEATURE_CDK_EMCNOTARY_STACKS_ENABLED=1 pnpm nx run cdk-emcnotary-core:deploy

# Different domain
FEATURE_CDK_EMCNOTARY_STACKS_ENABLED=1 DOMAIN=askdaokapra.com pnpm nx run cdk-emcnotary-core:deploy
```
Deploys core stack. Requires feature flag.

#### Diff
```bash
# Default domain
pnpm nx run cdk-emcnotary-core:diff

# Different domain
DOMAIN=askdaokapra.com pnpm nx run cdk-emcnotary-core:diff
```
Shows changes between deployed stack and current code.

#### Destroy
```bash
# Default domain (empties emcnotary buckets)
FEATURE_CDK_EMCNOTARY_STACKS_ENABLED=1 pnpm nx run cdk-emcnotary-core:destroy

# Different domain (empties domain-specific buckets)
FEATURE_CDK_EMCNOTARY_STACKS_ENABLED=1 DOMAIN=askdaokapra.com pnpm nx run cdk-emcnotary-core:destroy
```
Destroys core stack. Automatically empties S3 buckets before deletion.

### Instance Stack (`cdk-emcnotary-instance`)

#### Build
```bash
pnpm nx run cdk-emcnotary-instance:build
```
Builds the instance stack application. No domain configuration needed.

#### Synthesize
```bash
# Default domain
pnpm nx run cdk-emcnotary-instance:synth

# Different domain with custom instance DNS
DOMAIN=askdaokapra.com INSTANCE_DNS=mail CORE_PARAM_PREFIX=/askdaokapra/core \
  pnpm nx run cdk-emcnotary-instance:synth
```
Generates CloudFormation template. Supports:
- `DOMAIN`: Domain name (default: `emcnotary.com`)
- `INSTANCE_DNS`: Instance DNS name (default: `box`)
- `CORE_PARAM_PREFIX`: SSM parameter prefix (default: `/emcnotary/core`)

#### Deploy
```bash
# Default domain
FEATURE_CDK_EMCNOTARY_STACKS_ENABLED=1 pnpm nx run cdk-emcnotary-instance:deploy

# Different domain
FEATURE_CDK_EMCNOTARY_STACKS_ENABLED=1 DOMAIN=askdaokapra.com \
  INSTANCE_DNS=mail CORE_PARAM_PREFIX=/askdaokapra/core \
  pnpm nx run cdk-emcnotary-instance:deploy
```
Deploys instance stack. Requires feature flag.

#### Diff
```bash
# Default domain
pnpm nx run cdk-emcnotary-instance:diff

# Different domain
DOMAIN=askdaokapra.com pnpm nx run cdk-emcnotary-instance:diff
```
Shows changes between deployed stack and current code.

#### Destroy
```bash
# Default domain
FEATURE_CDK_EMCNOTARY_STACKS_ENABLED=1 pnpm nx run cdk-emcnotary-instance:destroy

# Different domain
FEATURE_CDK_EMCNOTARY_STACKS_ENABLED=1 DOMAIN=askdaokapra.com \
  pnpm nx run cdk-emcnotary-instance:destroy
```
Destroys instance stack. Terminates EC2 instance and deletes associated resources.

## Ops Runner Commands

### Stack Operations

#### Deploy Core Stack
```bash
# Default domain
pnpm nx run ops-runner:run -- stack:core:deploy

# Different domain
pnpm nx run ops-runner:run -- stack:core:deploy askdaokapra.com

# Via environment variable
DOMAIN=askdaokapra.com pnpm nx run ops-runner:run -- stack:core:deploy
```

#### Deploy Instance Stack
```bash
# Default domain
pnpm nx run ops-runner:run -- stack:instance:deploy

# Different domain
pnpm nx run ops-runner:run -- stack:instance:deploy askdaokapra.com
```

#### Destroy Core Stack
```bash
# Default domain
pnpm nx run ops-runner:run -- stack:core:destroy

# Different domain
pnpm nx run ops-runner:run -- stack:core:destroy askdaokapra.com
```
**Warning**: This will delete all resources including S3 buckets (after emptying).

#### Destroy Instance Stack
```bash
# Default domain
pnpm nx run ops-runner:run -- stack:instance:destroy

# Different domain
pnpm nx run ops-runner:run -- stack:instance:destroy askdaokapra.com
```
**Warning**: This will terminate the EC2 instance and delete associated resources.

#### Diff Core Stack
```bash
# Default domain
pnpm nx run ops-runner:run -- stack:core:diff

# Different domain
pnpm nx run ops-runner:run -- stack:core:diff askdaokapra.com
```

#### Diff Instance Stack
```bash
# Default domain
pnpm nx run ops-runner:run -- stack:instance:diff

# Different domain
pnpm nx run ops-runner:run -- stack:instance:diff askdaokapra.com
```

### Instance Management

#### Provision Instance
```bash
# Default domain
pnpm nx run ops-runner:run -- admin:instance:provision

# Different domain
pnpm nx run ops-runner:run -- admin:instance:provision askdaokapra.com
```
Sets up SSH access and configures SES DNS records via Mail-in-a-Box API.

#### Bootstrap Instance
```bash
# Default domain
FEATURE_INSTANCE_BOOTSTRAP_ENABLED=1 pnpm nx run ops-runner:run -- instance:bootstrap

# Different domain
FEATURE_INSTANCE_BOOTSTRAP_ENABLED=1 DOMAIN=askdaokapra.com \
  pnpm nx run ops-runner:run -- instance:bootstrap askdaokapra.com
```
Runs Mail-in-a-Box setup via SSM RunCommand. Discovers instance from stack outputs.

## Admin Tasks

### S3 Bucket Emptying (`admin-s3-empty`)

#### Empty Buckets (Generic)
```bash
# Via environment variables
DOMAIN=askdaokapra.com APP_PATH=apps/cdk-emc-notary/core \
  pnpm nx run admin-s3-empty:empty

# Dry run
DOMAIN=askdaokapra.com APP_PATH=apps/cdk-emc-notary/core DRY_RUN=1 \
  pnpm nx run admin-s3-empty:empty
```

#### Empty EMC Notary Buckets
```bash
# Normal
pnpm nx run admin-s3-empty:empty:emcnotary

# Dry run
pnpm nx run admin-s3-empty:empty:emcnotary:dry-run
```

### Reverse DNS (`admin-reverse-dns`)

#### Set Reverse DNS
```bash
# EMC Notary
pnpm nx run admin-reverse-dns:set:emcnotary

# Different domain (via environment)
DOMAIN=askdaokapra.com APP_PATH=apps/cdk-askdaokapra-core \
  pnpm nx run admin-reverse-dns:set
```

### SSH Access (`admin-ssh-access`)

#### Setup SSH
```bash
# EMC Notary
pnpm nx run admin-ssh-access:setup:emcnotary

# Different domain
DOMAIN=askdaokapra.com pnpm nx run admin-ssh-access:setup
```

### SES DNS (`admin-ses-dns`)

#### Set SES DNS Records
```bash
# EMC Notary
pnpm nx run admin-ses-dns:set-dns:emcnotary

# Dry run
pnpm nx run admin-ses-dns:set-dns:emcnotary:dry-run

# Different domain
DOMAIN=askdaokapra.com pnpm nx run admin-ses-dns:set-dns
```

### Instance Provision (`admin-instance-provision`)

#### Provision Instance
```bash
# EMC Notary
pnpm nx run admin-instance-provision:provision:emcnotary

# Skip SSH setup
pnpm nx run admin-instance-provision:provision:emcnotary:skip-ssh

# Different domain
DOMAIN=askdaokapra.com pnpm nx run admin-instance-provision:provision
```

## Environment Variables

### Common Variables

- `DOMAIN`: Domain name (e.g., `emcnotary.com`, `askdaokapra.com`)
- `INSTANCE_DNS`: Instance DNS name (default: `box`)
- `CORE_PARAM_PREFIX`: SSM parameter prefix (default: `/emcnotary/core`)
- `FEATURE_CDK_EMCNOTARY_STACKS_ENABLED`: Enable CDK stack operations (set to `1`)
- `FEATURE_INSTANCE_BOOTSTRAP_ENABLED`: Enable instance bootstrap (default: enabled unless set to `0`)
- `AWS_PROFILE`: AWS CLI profile (default: `hepe-admin-mfa`)
- `AWS_REGION`: AWS region (default: `us-east-1`)
- `CDK_DEFAULT_ACCOUNT`: AWS account ID
- `CDK_DEFAULT_REGION`: CDK default region (default: `us-east-1`)

### Domain-Specific Variables

For each domain, the following are derived:
- **Stack Name**: `{domain-tld}-mailserver-core` or `{domain-tld}-mailserver-instance`
- **SSM Parameter Prefix**: `/emcnotary/core` (for emcnotary.com) or `/{domain}/core` (for others)
- **S3 Bucket Names**: `{domain}-backup`, `{domain}-nextcloud`

## Example Workflows

### Deploy New Domain

```bash
# 1. Deploy core stack
FEATURE_CDK_EMCNOTARY_STACKS_ENABLED=1 DOMAIN=askdaokapra.com \
  pnpm nx run cdk-emcnotary-core:deploy

# 2. Deploy instance stack
FEATURE_CDK_EMCNOTARY_STACKS_ENABLED=1 DOMAIN=askdaokapra.com \
  INSTANCE_DNS=mail CORE_PARAM_PREFIX=/askdaokapra/core \
  pnpm nx run cdk-emcnotary-instance:deploy

# 3. Bootstrap Mail-in-a-Box
FEATURE_INSTANCE_BOOTSTRAP_ENABLED=1 DOMAIN=askdaokapra.com \
  pnpm nx run ops-runner:instance:bootstrap

# 4. Provision (SSH + SES DNS)
DOMAIN=askdaokapra.com pnpm nx run ops-runner:run -- admin:instance:provision askdaokapra.com
```

### Update Existing Domain

```bash
# 1. Check changes
DOMAIN=emcnotary.com pnpm nx run cdk-emcnotary-core:diff
DOMAIN=emcnotary.com pnpm nx run cdk-emcnotary-instance:diff

# 2. Deploy changes
FEATURE_CDK_EMCNOTARY_STACKS_ENABLED=1 DOMAIN=emcnotary.com \
  pnpm nx run cdk-emcnotary-core:deploy
FEATURE_CDK_EMCNOTARY_STACKS_ENABLED=1 DOMAIN=emcnotary.com \
  pnpm nx run cdk-emcnotary-instance:deploy
```

### Destroy Domain

```bash
# 1. Destroy instance stack (terminates EC2)
FEATURE_CDK_EMCNOTARY_STACKS_ENABLED=1 DOMAIN=askdaokapra.com \
  pnpm nx run cdk-emcnotary-instance:destroy

# 2. Destroy core stack (empties buckets, deletes resources)
FEATURE_CDK_EMCNOTARY_STACKS_ENABLED=1 DOMAIN=askdaokapra.com \
  pnpm nx run cdk-emcnotary-core:destroy
```

## Notes

- **Backward Compatibility**: All tasks default to `emcnotary.com` if no domain is specified
- **Feature Flags**: CDK stack operations require `FEATURE_CDK_EMCNOTARY_STACKS_ENABLED=1`
- **Domain Validation**: Tasks validate domain format and stack existence
- **Cleanup**: Destroy tasks automatically empty S3 buckets before deletion
- **Context Passing**: Domain configuration is passed via CDK context automatically by tasks

## Related Documentation

- [Local Operations Guide](./LOCAL-OPS.md)
- [Instance Stack README](../apps/cdk-emc-notary/instance/README.md)
- [Core Stack README](../apps/cdk-emc-notary/core/README.md)
- [Instance Bootstrap Library](../libs/support-scripts/aws/instance-bootstrap/README.md)
