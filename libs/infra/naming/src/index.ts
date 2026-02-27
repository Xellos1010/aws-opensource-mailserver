/**
 * Shared naming utilities for mailserver infrastructure stacks
 * 
 * Provides canonical naming functions for CDK stacks, ensuring consistency
 * across all mailserver deployments.
 * 
 * @module @mm/infra-naming
 */

/**
 * Converts a domain name to kebab-case format suitable for stack names
 * 
 * @param domain - Domain name (e.g., "emcnotary.com")
 * @returns Kebab-case domain (e.g., "emcnotary-com")
 * 
 * @example
 * ```typescript
 * toKebabDomain('emcnotary.com') // 'emcnotary-com'
 * toKebabDomain('example.org') // 'example-org'
 * ```
 */
export function toKebabDomain(domain: string): string {
  return domain.trim().toLowerCase().replace(/\./g, '-');
}

/**
 * Generates the canonical core stack name for a domain
 * 
 * Format: `{domain-tld}-mailserver-core`
 * 
 * @param domain - Domain name (e.g., "emcnotary.com")
 * @returns Core stack name (e.g., "emcnotary-com-mailserver-core")
 * 
 * @example
 * ```typescript
 * toMailserverCoreStackName('emcnotary.com') // 'emcnotary-com-mailserver-core'
 * ```
 */
export function toMailserverCoreStackName(domain: string): string {
  return `${toKebabDomain(domain)}-mailserver-core`;
}

/**
 * Generates the canonical instance stack name for a domain
 * 
 * Format: `{domain-tld}-mailserver-instance`
 * 
 * @param domain - Domain name (e.g., "emcnotary.com")
 * @returns Instance stack name (e.g., "emcnotary-com-mailserver-instance")
 * 
 * @example
 * ```typescript
 * toMailserverInstanceStackName('emcnotary.com') // 'emcnotary-com-mailserver-instance'
 * ```
 */
export function toMailserverInstanceStackName(domain: string): string {
  return `${toKebabDomain(domain)}-mailserver-instance`;
}

/**
 * Generates the canonical observability-maintenance stack name for a domain.
 *
 * Format: `{domain-tld}-mailserver-observability-maintenance`
 *
 * @param domain - Domain name (e.g., "emcnotary.com")
 * @returns Observability stack name
 *
 * @example
 * ```typescript
 * toMailserverObservabilityMaintenanceStackName('emcnotary.com')
 * // 'emcnotary-com-mailserver-observability-maintenance'
 * ```
 */
export function toMailserverObservabilityMaintenanceStackName(domain: string): string {
  return `${toKebabDomain(domain)}-mailserver-observability-maintenance`;
}

/**
 * Parses domain name from a canonical mailserver stack name
 * 
 * @param stackName - Stack name (e.g., "emcnotary-com-mailserver-core")
 * @returns Domain name (e.g., "emcnotary.com")
 * @throws Error if stack name doesn't match canonical format
 * 
 * @example
 * ```typescript
 * parseDomainFromMailserverStack('emcnotary-com-mailserver-core') // 'emcnotary.com'
 * parseDomainFromMailserverStack('emcnotary-com-mailserver-instance') // 'emcnotary.com'
 * ```
 */
export function parseDomainFromMailserverStack(stackName: string): string {
  const match = stackName.match(
    /^([a-z0-9-]+)-mailserver-(core|instance|observability-maintenance)$/
  );
  if (!match) {
    throw new Error(
      `Not a canonical mailserver stack name: ${stackName}. Expected format: {domain-tld}-mailserver-{core|instance|observability-maintenance}`
    );
  }
  return match[1].replace(/-/g, '.');
}

/**
 * Generates SSM parameter prefix for core parameters
 * 
 * Uses the domain name without TLD (e.g., "emcnotary.com" -> "/emcnotary/core")
 * 
 * @param domain - Domain name (e.g., "emcnotary.com")
 * @returns SSM parameter prefix (e.g., "/emcnotary/core")
 * 
 * @example
 * ```typescript
 * coreParamPrefix('emcnotary.com') // '/emcnotary/core'
 * ```
 */
export function coreParamPrefix(domain: string): string {
  const domainPart = domain.split('.')[0];
  return `/${domainPart}/core`;
}

/**
 * Generates SSM parameter prefix for instance metadata published by instance stacks.
 *
 * Uses the domain name without TLD (e.g., "emcnotary.com" -> "/emcnotary/instance")
 *
 * @param domain - Domain name (e.g., "emcnotary.com")
 * @returns SSM parameter prefix (e.g., "/emcnotary/instance")
 *
 * @example
 * ```typescript
 * instanceParamPrefix('emcnotary.com') // '/emcnotary/instance'
 * ```
 */
export function instanceParamPrefix(domain: string): string {
  const domainPart = domain.split('.')[0];
  return `/${domainPart}/instance`;
}

/**
 * Generates the canonical ops stack name for a domain.
 *
 * The ops stack contains Lambdas, alarms, and maintenance constructs — it is
 * deployed frequently and must NOT contain EC2 resources.
 *
 * Format: `{domain-tld}-mailserver-ops`
 *
 * @param domain - Domain name (e.g., "emcnotary.com")
 * @returns Ops stack name (e.g., "emcnotary-com-mailserver-ops")
 *
 * @example
 * ```typescript
 * toMailserverOpsStackName('emcnotary.com') // 'emcnotary-com-mailserver-ops'
 * ```
 */
export function toMailserverOpsStackName(domain: string): string {
  return `${toKebabDomain(domain)}-mailserver-ops`;
}



















