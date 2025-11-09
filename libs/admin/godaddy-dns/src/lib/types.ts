/**
 * Type definitions for GoDaddy DNS API client
 */

/**
 * DNS record types supported by GoDaddy API
 */
export type DnsRecordType = 'A' | 'AAAA' | 'CNAME' | 'MX' | 'NS' | 'PTR' | 'SOA' | 'SRV' | 'TXT';

/**
 * DNS record structure matching GoDaddy API format
 */
export interface DnsRecord {
  /** DNS record type */
  type: DnsRecordType;
  /** Record name (hostname) */
  name: string;
  /** Record data (value) */
  data: string;
  /** Time to live in seconds */
  ttl: number;
  /** Priority (for MX and SRV records) */
  priority?: number;
  /** Service (for SRV records) */
  service?: string;
  /** Protocol (for SRV records) */
  protocol?: string;
  /** Port (for SRV records) */
  port?: number;
  /** Weight (for SRV records) */
  weight?: number;
}

/**
 * GoDaddy API client configuration
 */
export interface GoDaddyClientConfig {
  /** GoDaddy API key */
  apiKey: string;
  /** GoDaddy API secret */
  apiSecret: string;
  /** Base URL for API (defaults to production) */
  baseUrl?: string;
  /** Customer ID (required for v2 endpoints) */
  customerId?: string;
  /** Shopper ID (for reseller accounts) */
  shopperId?: string;
  /** Request timeout in milliseconds */
  timeout?: number;
  /** Maximum retry attempts */
  maxRetries?: number;
}

/**
 * Configuration for setting DNS hostnames (A records)
 */
export interface SetDnsHostnamesConfig {
  /** Domain name */
  domain: string;
  /** IP address for ns1.box */
  ns1Ip: string;
  /** IP address for ns2.box */
  ns2Ip: string;
  /** TTL for DNS records (default: 3600) */
  ttl?: number;
}

/**
 * Result of setting DNS hostnames operation
 */
export interface SetDnsHostnamesResult {
  /** Whether the operation was successful */
  success: boolean;
  /** Set DNS records if successful */
  records?: {
    ns1: DnsRecord;
    ns2: DnsRecord;
  };
  /** Error message if operation failed */
  error?: string;
}

/**
 * Configuration for setting nameservers
 */
export interface SetNameserversConfig {
  /** Domain name */
  domain: string;
  /** Customer ID (required for v2 endpoint) */
  customerId: string;
  /** Nameserver hostnames (will be constructed if not provided) */
  nameservers?: string[];
}

/**
 * Result of setting nameservers operation
 */
export interface SetNameserversResult {
  /** Whether the operation was successful */
  success: boolean;
  /** Set nameservers if successful */
  nameservers?: string[];
  /** Error message if operation failed */
  error?: string;
}

/**
 * GoDaddy API error response structure
 */
export interface GoDaddyApiErrorResponse {
  /** Error code */
  code: string;
  /** Error message */
  message: string;
  /** Field-level errors */
  fields?: Array<{
    code: string;
    message: string;
    path: string;
    pathRelated?: string;
  }>;
  /** Retry after seconds (for rate limit errors) */
  retryAfterSec?: number;
}

/**
 * HTTP request options
 */
export interface RequestOptions {
  /** HTTP method */
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  /** Request path */
  path: string;
  /** Request body */
  body?: unknown;
  /** Query parameters */
  query?: Record<string, string | number | boolean | undefined>;
  /** Additional headers */
  headers?: Record<string, string>;
}


