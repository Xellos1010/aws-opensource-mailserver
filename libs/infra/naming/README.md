# @mm/infra-naming

Shared naming utilities for mailserver infrastructure stacks.

## Purpose

Provides canonical naming functions for CDK stacks, ensuring consistency across all mailserver deployments. All stack names follow the format:

- **Core stacks**: `{domain-tld}-mailserver-core`
- **Instance stacks**: `{domain-tld}-mailserver-instance`
- **Observability stacks**: `{domain-tld}-mailserver-observability-maintenance`

## Usage

```typescript
import {
  toMailserverCoreStackName,
  toMailserverInstanceStackName,
  toMailserverObservabilityMaintenanceStackName,
  parseDomainFromMailserverStack,
  coreParamPrefix,
  instanceParamPrefix,
} from '@mm/infra-naming';

// Generate stack names
const coreStack = toMailserverCoreStackName('emcnotary.com');
// => 'emcnotary-com-mailserver-core'

const instanceStack = toMailserverInstanceStackName('emcnotary.com');
// => 'emcnotary-com-mailserver-instance'

const observabilityStack =
  toMailserverObservabilityMaintenanceStackName('emcnotary.com');
// => 'emcnotary-com-mailserver-observability-maintenance'

// Parse domain from stack name
const domain = parseDomainFromMailserverStack('emcnotary-com-mailserver-core');
// => 'emcnotary.com'

// Generate SSM parameter prefix
const prefix = coreParamPrefix('emcnotary.com');
// => '/emcnotary/core'

const instancePrefix = instanceParamPrefix('emcnotary.com');
// => '/emcnotary/instance'
```

## API Reference

### `toKebabDomain(domain: string): string`

Converts a domain name to kebab-case format suitable for stack names.

### `toMailserverCoreStackName(domain: string): string`

Generates the canonical core stack name for a domain.

### `toMailserverInstanceStackName(domain: string): string`

Generates the canonical instance stack name for a domain.

### `toMailserverObservabilityMaintenanceStackName(domain: string): string`

Generates the canonical observability-maintenance stack name for a domain.

### `parseDomainFromMailserverStack(stackName: string): string`

Parses domain name from a canonical mailserver stack name. Throws if the stack name doesn't match the canonical format.

### `coreParamPrefix(domain: string): string`

Generates SSM parameter prefix for core parameters (uses domain name without TLD).

### `instanceParamPrefix(domain: string): string`

Generates SSM parameter prefix for instance metadata (uses domain name without TLD).

## Migration Notes

This library replaces ad-hoc naming logic scattered across:
- CDK apps (`apps/cdk-emc-notary/core`, `apps/cdk-emc-notary/instance`)
- Admin scripts (`libs/admin/admin-stack-info`)
- Support scripts (`libs/support-scripts/aws/instance-bootstrap`)

All code should now import from this library instead of implementing naming logic inline.



















