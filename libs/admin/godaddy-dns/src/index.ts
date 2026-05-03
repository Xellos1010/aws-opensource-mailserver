/**
 * GoDaddy DNS API Client Library
 * 
 * Provides typed GoDaddy API client for setting DNS hostnames (A records) and nameservers.
 * 
 * @example
 * ```typescript
 * import { GoDaddyClient, setDnsHostnames, setNameservers } from '@mm/admin-godaddy-dns';
 * 
 * const client = new GoDaddyClient({
 *   apiKey: process.env.GODADDY_API_KEY!,
 *   apiSecret: process.env.GODADDY_API_SECRET!,
 *   customerId: process.env.GODADDY_CUSTOMER_ID,
 * });
 * 
 * // Set DNS hostnames
 * const dnsResult = await setDnsHostnames(client, {
 *   domain: 'example.com',
 *   ns1Ip: '1.2.3.4',
 *   ns2Ip: '5.6.7.8',
 * });
 * 
 * // Set nameservers
 * const nsResult = await setNameservers(client, {
 *   domain: 'example.com',
 *   customerId: '123',
 * });
 * ```
 */

// Client
export { GoDaddyClient } from './lib/godaddy-client';

// Domain functions
export { setDnsHostnames } from './lib/dns-records';
export { setNameservers } from './lib/nameservers';
export { getDnsRecords } from './lib/get-dns-records';
export { getCustomerId } from './lib/get-customer-id';

// Types
export type {
  GoDaddyClientConfig,
  SetDnsHostnamesConfig,
  SetDnsHostnamesResult,
  SetNameserversConfig,
  SetNameserversResult,
  DnsRecord,
  DnsRecordType,
  RequestOptions,
  GoDaddyApiErrorResponse,
} from './lib/types';

// Errors
export {
  GoDaddyApiError,
  GoDaddyAuthenticationError,
  GoDaddyRateLimitError,
  GoDaddyValidationError,
  GoDaddyNotFoundError,
  GoDaddyTransientError,
  isGoDaddyApiError,
  isRetryableError,
} from './lib/errors';

// Logger (for advanced usage)
export type { Logger, LogLevel, LogContext } from './lib/logger';
export { logger, setCorrelationId, getCorrelationId, createChildLogger } from './lib/logger';

// Tracer (for advanced usage)
export type { Span, Tracer, SpanOptions } from './lib/tracing';
export { tracer, withSpan, SpanStatusCode } from './lib/tracing';

