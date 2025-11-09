/**
 * Get DNS records operations for GoDaddy API
 * Single responsibility: DNS record retrieval operations only
 */

import type { GoDaddyClient } from './godaddy-client';
import type { DnsRecord } from './types';
import { logger, createChildLogger } from './logger';
import { withSpan, SpanStatusCode } from './tracing';
import { metrics } from './metrics';

/**
 * Get DNS records for a domain, optionally filtered by type and name
 * Uses GET /v1/domains/{domain}/records/{type}/{name} endpoint
 * 
 * @param client - GoDaddy API client instance
 * @param domain - Domain name
 * @param type - Optional DNS record type filter
 * @param name - Optional DNS record name filter
 * @returns Array of DNS records or error
 * 
 * @example
 * ```typescript
 * const client = new GoDaddyClient({ apiKey, apiSecret });
 * const records = await getDnsRecords(client, 'example.com', 'A', 'ns1.box');
 * ```
 */
export async function getDnsRecords(
  client: GoDaddyClient,
  domain: string,
  type?: string,
  name?: string
): Promise<{ success: true; records: DnsRecord[] } | { success: false; error: string }> {
  const operationLogger = createChildLogger({
    operation: 'getDnsRecords',
    domain,
  });

  return withSpan(
    'godaddy.dns.getRecords',
    async (span) => {
      try {
        span.setAttribute('domain', domain);
        if (type) {
          span.setAttribute('record.type', type);
        }
        if (name) {
          span.setAttribute('record.name', name);
        }

        let path = `/v1/domains/${domain}/records`;
        if (type && name) {
          path = `/v1/domains/${domain}/records/${type}/${name}`;
        } else if (type) {
          path = `/v1/domains/${domain}/records/${type}`;
        }

        operationLogger.info('Getting DNS records', { domain, type, name });

        // Use the public request method
        const records = await client.request<DnsRecord[]>({
          method: 'GET',
          path,
        });

        operationLogger.info('Retrieved DNS records', { count: records.length });

        span.setStatus({ code: SpanStatusCode.OK });
        
        metrics.requestsTotal.inc({
          operation: 'getDnsRecords',
          domain,
          status_code: '200',
        });

        return {
          success: true,
          records,
        };
      } catch (error) {
        operationLogger.error('Failed to get DNS records', {
          error: error instanceof Error ? error.message : String(error),
        });

        metrics.errorsTotal.inc({
          operation: 'getDnsRecords',
          domain,
          error_type: error instanceof Error ? error.name : 'UnknownError',
        });

        if (error instanceof Error) {
          span.recordException(error);
        }
        span.setStatus({ code: SpanStatusCode.ERROR });

        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    },
    {
      kind: 'client',
      attributes: {
        'domain': domain,
        'operation': 'getDnsRecords',
      },
    }
  );
}

