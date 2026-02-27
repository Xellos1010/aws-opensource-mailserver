# Mail Server Instance Stack

Instance infrastructure stack for mail servers. This stack contains EC2 instance and related compute resources, built using shared constructs for multi-domain support.

## Stack Naming

This stack uses canonical naming via `@mm/infra-naming`:
- **Stack Name**: `emcnotary-com-mailserver-instance` (format: `{domain-tld}-mailserver-instance`)
- Stack name is automatically derived from the `DOMAIN` environment variable or CDK context

See [ADR-001: Infrastructure Naming Standard](../../docs/adr/001-infra-naming-standard.md) for details.

## Architecture

This stack uses **shared constructs** from `@mm/infra-instance-constructs` for:
- Security Group configuration
- IAM Role and Instance Profile
- UserData placeholder for SSM bootstrap
- Instance metadata publication to SSM for downstream stacks

The actual Mail-in-a-Box setup is performed via **SSM RunCommand** after instance launch (see Bootstrap section below).

## Resources

- **EC2 Instance**: Configurable instance type (default: t2.micro)
- **Security Group**: Rules for SSH (22), DNS (53), HTTP (80), HTTPS (443), SMTP (25), IMAP (143/993), SMTPS (465), Submission (587), Sieve (4190)
- **Elastic IP**: Static IP address for the mail server (associated via AllocationId from core stack)
- **IAM Role**: Instance role with SSM access, S3 bucket access, and SSM parameter read permissions
- **User Data**: Minimal placeholder that prepares instance for SSM bootstrap (installs AWS CLI, ensures SSM agent is running)
- **Instance Metadata SSM Parameters**: `/.../instance/instanceId`, `/.../instance/instanceDns`, `/.../instance/stackName`

## Dependencies

This stack **requires** the core stack to be deployed first, as it reads SSM parameters:
- `{coreParamPrefix}/domainName`
- `{coreParamPrefix}/backupBucket`
- `{coreParamPrefix}/nextcloudBucket`
- `{coreParamPrefix}/eipAllocationId`

For EMC Notary, the `coreParamPrefix` is `/emcnotary/core`.

## Observability Handoff

This stack now only handles launch-time instance infrastructure.

All post-init maintenance/security/observability automation is deployed in:

- `apps/cdk-emc-notary/observability-maintenance`

The instance stack publishes this SSM metadata contract consumed by that stack:

- `/emcnotary/instance/instanceId`
- `/emcnotary/instance/instanceDns`
- `/emcnotary/instance/stackName`

## Multi-Domain Support

This stack supports multiple domains through domain configuration:

```typescript
// Example: Deploy for different domain
import { toMailserverInstanceStackName, coreParamPrefix } from '@mm/infra-naming';

const domain = 'askdaokapra.com';
const domainConfig: DomainConfig = {
  domainName: domain,
  instanceDns: 'box',
  coreParamPrefix: coreParamPrefix(domain), // '/askdaokapra/core'
  stackName: toMailserverInstanceStackName(domain), // 'askdaokapra-com-mailserver-instance'
};
```

Domain configuration can be provided via:
- **CDK Context**: `cdk deploy --context domain=askdaokapra.com`
- **Environment Variables**: `DOMAIN=askdaokapra.com`
- **Stack Props**: Pass `domainConfig` directly to `MailServerInstanceStack`

### Default Configuration

For backward compatibility, `EmcNotaryInstanceStack` is provided with hardcoded EMC Notary configuration. For new domains, use `MailServerInstanceStack` with explicit domain configuration.

## Usage

### Build

```bash
pnpm nx build cdk-emcnotary-instance
```

### Synthesize CloudFormation Template

```bash
CDK_DEFAULT_ACCOUNT=<account-id> CDK_DEFAULT_REGION=us-east-1 \
  pnpm nx run cdk-emcnotary-instance:synth
```

### Deploy

**EMC Notary (default)**:
```bash
FEATURE_CDK_EMCNOTARY_STACKS_ENABLED=1 \
  CDK_DEFAULT_ACCOUNT=<account-id> CDK_DEFAULT_REGION=us-east-1 \
  pnpm nx run cdk-emcnotary-instance:deploy
```

**Different Domain**:
```bash
FEATURE_CDK_EMCNOTARY_STACKS_ENABLED=1 \
  DOMAIN=askdaokapra.com \
  CDK_DEFAULT_ACCOUNT=<account-id> CDK_DEFAULT_REGION=us-east-1 \
  pnpm nx run cdk-emcnotary-instance:deploy
```

### Diff (Preview Changes)

```bash
CDK_DEFAULT_ACCOUNT=<account-id> CDK_DEFAULT_REGION=us-east-1 \
  pnpm nx run cdk-emcnotary-instance:diff
```

### Destroy

```bash
CDK_DEFAULT_ACCOUNT=<account-id> CDK_DEFAULT_REGION=us-east-1 \
  pnpm nx run cdk-emcnotary-instance:destroy
```

## Rollback

If deployment fails, you can destroy only the instance stack without affecting the core stack:

```bash
pnpm nx run cdk-emcnotary-instance:destroy
```

The core stack remains intact and can be reused for a new instance deployment.

Nightly reboot and recovery automation are now managed by
`cdk-emcnotary-observability-maintenance`, not by the instance stack.

## Bootstrap

After deploying the instance stack, bootstrap Mail-in-a-Box via SSM:

```bash
FEATURE_INSTANCE_BOOTSTRAP_ENABLED=1 DOMAIN=emcnotary.com \
  pnpm nx run ops-runner:instance:bootstrap
```

The instance UserData only prepares the instance for SSM access. The full MIAB setup is performed by the bootstrap command, which:
- Discovers the instance via CloudFormation outputs
- Reads configuration from core SSM parameters
- Ships and executes MIAB setup script via SSM RunCommand
- Configures Mail-in-a-Box with proper environment variables

See [Instance Bootstrap Library](../../libs/support-scripts/aws/instance-bootstrap/README.md) for details.

## Status Checks

After MIAB is bootstrapped, you can fetch and analyze status checks locally:

```bash
# Fetch status checks
pnpm nx run cdk-emcnotary-instance:admin:miab:status-check

# Save to JSON file for analysis
OUTPUT_FILE=status-report.json pnpm nx run cdk-emcnotary-instance:admin:miab:status-check

# Verbose output
VERBOSE=1 pnpm nx run cdk-emcnotary-instance:admin:miab:status-check
```

The status check tool:
- Connects to the instance via SSH
- Runs MIAB status checks (`status_checks.py`)
- Parses and categorizes results (OK, Errors, Warnings)
- Outputs structured JSON for programmatic analysis
- Allows local iteration to resolve issues

**Common Issues to Address:**
- **Postgrey not running**: Check service status and restart if needed
- **SMTP port 25 blocked**: AWS may restrict outbound port 25; use SES for sending
- **MTA-STS policy missing**: Configure MTA-STS records in DNS
- **TLS certificate self-signed**: Provision Let's Encrypt certificates
- **Disk space low**: Run cleanup:
  `pnpm nx run cdk-emcnotary-observability-maintenance:admin:cleanup:disk-space`

## Feature Flags

- **`FEATURE_CDK_EMCNOTARY_STACKS_ENABLED`**: Controls CDK stack deployment (default: `0`, set to `1` to enable)
- **`FEATURE_INSTANCE_BOOTSTRAP_ENABLED`**: Controls SSM bootstrap execution (default: enabled unless set to `0`)
