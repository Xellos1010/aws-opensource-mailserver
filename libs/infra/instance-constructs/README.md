# Instance Constructs Library

Shared CDK constructs for Mail-in-a-Box instance stacks. This library provides reusable components for creating mail server instances across multiple domains.

## Purpose

This library extracts common infrastructure patterns into reusable constructs, enabling:
- **Multi-domain support**: Same constructs work for any domain
- **Consistency**: Standardized security groups, IAM roles, and reboot schedules
- **Maintainability**: Update shared logic in one place
- **Composability**: Mix and match constructs as needed

## Components

### Domain Configuration

```typescript
interface DomainConfig {
  domainName: string;           // e.g., "emcnotary.com"
  instanceDns: string;          // e.g., "box"
  coreParamPrefix: string;      // e.g., "/emcnotary/core"
  stackName: string;            // e.g., "emcnotary-com-mailserver-instance"
}
```

### Instance Configuration

```typescript
interface InstanceConfig {
  instanceType?: string;         // EC2 instance type (default: "t2.micro")
  instanceDns?: string;          // Instance DNS name (default: "box")
  sesRelay?: boolean;            // Enable SES relay (default: true)
  swapSizeGiB?: number;          // Swap size (default: 2)
  mailInABoxVersion?: string;    // MIAB version (default: "v64.0")
  mailInABoxCloneUrl?: string;   // MIAB repo URL
  nightlyRebootSchedule?: string; // Cron expression (default: "0 8 * * ? *")
  nightlyRebootDescription?: string; // Human-readable description
}
```

### Security Group

```typescript
import { createMailServerSecurityGroup } from '@mm/infra-instance-constructs';

const sg = createMailServerSecurityGroup(this, 'InstanceSecurityGroup', vpc);
```

Creates a security group with standard mail server ports:
- SSH (22), DNS (53), HTTP (80), HTTPS (443)
- SMTP (25), IMAP (143/993), SMTPS (465), Submission (587), Sieve (4190)

### IAM Role

```typescript
import { createInstanceRole } from '@mm/infra-instance-constructs';

const { role, profile } = createInstanceRole(this, 'InstanceRole', {
  domainConfig,
  backupBucket,
  nextcloudBucket,
  stackName,
  region,
  account,
});
```

Creates IAM role with:
- S3 bucket access (backup and Nextcloud)
- SSM parameter access (core params, SMTP credentials, admin password)
- Proper resource ARNs based on domain configuration

### Nightly Reboot

```typescript
import { createNightlyReboot } from '@mm/infra-instance-constructs';

const { lambda, rule } = createNightlyReboot(this, 'NightlyReboot', {
  instanceId,
  schedule: '0 8 * * ? *',  // 08:00 UTC
  description: '03:00 ET (08:00 UTC) daily',
  region,
  account,
});
```

Creates Lambda function and EventBridge rule for automatic nightly reboot.

### UserData Placeholder

```typescript
import { createBootstrapPlaceholderUserData } from '@mm/infra-instance-constructs';

const userData = createBootstrapPlaceholderUserData(
  domainName,
  instanceDns,
  stackName,
  region
);
instance.addUserData(...userData);
```

Creates minimal UserData that:
- Installs AWS CLI (needed for SSM and bootstrap script)
- Ensures SSM agent is running
- Provides instructions for SSM bootstrap
- Does NOT install Mail-in-a-Box (that's done via SSM)

## Usage Example

```typescript
import { MailServerInstanceStack } from './stacks/instance-stack';
import { DomainConfig } from '@mm/infra-instance-constructs';

const domainConfig: DomainConfig = {
  domainName: 'emcnotary.com',
  instanceDns: 'box',
  coreParamPrefix: '/emcnotary/core',
  stackName: 'emcnotary-com-mailserver-instance',
};

new MailServerInstanceStack(app, domainConfig.stackName, {
  domainConfig,
  instanceConfig: {
    instanceType: 't3a.small',
    nightlyRebootSchedule: '0 8 * * ? *',
  },
});
```

## Related Documentation

- [Instance Stack README](../../../../apps/cdk-emcnotary-instance/README.md)
- [Instance Bootstrap Library](../../../support-scripts/aws/instance-bootstrap/README.md)
- [Core Parameters](../../core-params/README.md)
