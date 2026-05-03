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
 * @param domain - Domain name (e.g., "example.com")
 * @returns Kebab-case domain (e.g., "example-com")
 * 
 * @example
 * ```typescript
 * toKebabDomain('example.com') // 'example-com'
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
 * @param domain - Domain name (e.g., "example.com")
 * @returns Core stack name (e.g., "example-com-mailserver-core")
 * 
 * @example
 * ```typescript
 * toMailserverCoreStackName('example.com') // 'example-com-mailserver-core'
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
 * @param domain - Domain name (e.g., "example.com")
 * @returns Instance stack name (e.g., "example-com-mailserver-instance")
 * 
 * @example
 * ```typescript
 * toMailserverInstanceStackName('example.com') // 'example-com-mailserver-instance'
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
 * @param domain - Domain name (e.g., "example.com")
 * @returns Observability stack name
 *
 * @example
 * ```typescript
 * toMailserverObservabilityMaintenanceStackName('example.com')
 * // 'example-com-mailserver-observability-maintenance'
 * ```
 */
export function toMailserverObservabilityMaintenanceStackName(domain: string): string {
  return `${toKebabDomain(domain)}-mailserver-observability-maintenance`;
}

/**
 * Parses domain name from a canonical mailserver stack name
 * 
 * @param stackName - Stack name (e.g., "example-com-mailserver-core")
 * @returns Domain name (e.g., "example.com")
 * @throws Error if stack name doesn't match canonical format
 * 
 * @example
 * ```typescript
 * parseDomainFromMailserverStack('example-com-mailserver-core') // 'example.com'
 * parseDomainFromMailserverStack('example-com-mailserver-instance') // 'example.com'
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
 * Uses the domain name without TLD (e.g., "example.com" -> "/example/core")
 * 
 * @param domain - Domain name (e.g., "example.com")
 * @returns SSM parameter prefix (e.g., "/example/core")
 * 
 * @example
 * ```typescript
 * coreParamPrefix('example.com') // '/example/core'
 * ```
 */
export function coreParamPrefix(domain: string): string {
  const domainPart = domain.split('.')[0];
  return `/${domainPart}/core`;
}

/**
 * Generates SSM parameter prefix for instance metadata published by instance stacks.
 *
 * Uses the domain name without TLD (e.g., "example.com" -> "/example/instance")
 *
 * @param domain - Domain name (e.g., "example.com")
 * @returns SSM parameter prefix (e.g., "/example/instance")
 *
 * @example
 * ```typescript
 * instanceParamPrefix('example.com') // '/example/instance'
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
 * @param domain - Domain name (e.g., "example.com")
 * @returns Ops stack name (e.g., "example-com-mailserver-ops")
 *
 * @example
 * ```typescript
 * toMailserverOpsStackName('example.com') // 'example-com-mailserver-ops'
 * ```
 */
export function toMailserverOpsStackName(domain: string): string {
  return `${toKebabDomain(domain)}-mailserver-ops`;
}



















