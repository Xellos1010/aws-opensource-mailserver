/**
 * Input validation functions for GoDaddy API client
 * Uses simple type guards per node-platform-standards
 */

import type { SetDnsHostnamesConfig, SetNameserversConfig, GoDaddyClientConfig } from './types';

/**
 * Validates IPv4 address format
 */
export function isValidIpv4(ip: string): boolean {
  const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/;
  if (!ipv4Regex.test(ip)) {
    return false;
  }
  const parts = ip.split('.');
  return parts.every((part) => {
    const num = Number.parseInt(part, 10);
    return num >= 0 && num <= 255;
  });
}

/**
 * Validates domain name format
 */
export function isValidDomain(domain: string): boolean {
  // Basic domain validation: alphanumeric, dots, hyphens
  // Must start and end with alphanumeric, not be empty
  const domainRegex = /^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/i;
  return domainRegex.test(domain) && domain.length <= 253;
}

/**
 * Validates TTL value
 */
export function isValidTtl(ttl: number): boolean {
  return Number.isInteger(ttl) && ttl > 0 && ttl <= 2147483647;
}

/**
 * Validates GoDaddy client configuration
 */
export function validateClientConfig(config: GoDaddyClientConfig): void {
  if (!config.apiKey || typeof config.apiKey !== 'string' || config.apiKey.trim().length === 0) {
    throw new Error('apiKey is required and must be a non-empty string');
  }
  if (!config.apiSecret || typeof config.apiSecret !== 'string' || config.apiSecret.trim().length === 0) {
    throw new Error('apiSecret is required and must be a non-empty string');
  }
  if (config.baseUrl !== undefined && typeof config.baseUrl !== 'string') {
    throw new Error('baseUrl must be a string');
  }
  if (config.timeout !== undefined && (!Number.isInteger(config.timeout) || config.timeout <= 0)) {
    throw new Error('timeout must be a positive integer');
  }
  if (config.maxRetries !== undefined && (!Number.isInteger(config.maxRetries) || config.maxRetries < 0)) {
    throw new Error('maxRetries must be a non-negative integer');
  }
}

/**
 * Validates DNS hostnames configuration
 */
export function validateDnsHostnamesConfig(config: SetDnsHostnamesConfig): void {
  if (!config.domain || typeof config.domain !== 'string') {
    throw new Error('domain is required and must be a string');
  }
  if (!isValidDomain(config.domain)) {
    throw new Error(`Invalid domain format: ${config.domain}`);
  }
  if (!config.ns1Ip || typeof config.ns1Ip !== 'string') {
    throw new Error('ns1Ip is required and must be a string');
  }
  if (!isValidIpv4(config.ns1Ip)) {
    throw new Error(`Invalid IPv4 address for ns1Ip: ${config.ns1Ip}`);
  }
  if (!config.ns2Ip || typeof config.ns2Ip !== 'string') {
    throw new Error('ns2Ip is required and must be a string');
  }
  if (!isValidIpv4(config.ns2Ip)) {
    throw new Error(`Invalid IPv4 address for ns2Ip: ${config.ns2Ip}`);
  }
  if (config.ttl !== undefined && !isValidTtl(config.ttl)) {
    throw new Error(`Invalid TTL value: ${config.ttl}`);
  }
}

/**
 * Validates nameservers configuration
 */
export function validateNameserversConfig(config: SetNameserversConfig): void {
  if (!config.domain || typeof config.domain !== 'string') {
    throw new Error('domain is required and must be a string');
  }
  if (!isValidDomain(config.domain)) {
    throw new Error(`Invalid domain format: ${config.domain}`);
  }
  if (!config.customerId || typeof config.customerId !== 'string' || config.customerId.trim().length === 0) {
    throw new Error('customerId is required and must be a non-empty string');
  }
  if (config.nameservers !== undefined) {
    if (!Array.isArray(config.nameservers)) {
      throw new Error('nameservers must be an array');
    }
    if (config.nameservers.length < 2) {
      throw new Error('At least two nameservers must be specified');
    }
    if (config.nameservers.length > 13) {
      throw new Error('Maximum of 13 nameservers allowed');
    }
    for (const nameserver of config.nameservers) {
      if (typeof nameserver !== 'string' || nameserver.trim().length === 0) {
        throw new Error('All nameservers must be non-empty strings');
      }
      // Basic validation: must be a valid hostname or FQDN
      const hostnameRegex = /^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)*[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/i;
      if (!hostnameRegex.test(nameserver)) {
        throw new Error(`Invalid nameserver format: ${nameserver}`);
      }
    }
  }
}

