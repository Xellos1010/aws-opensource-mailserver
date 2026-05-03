/**
 * DNS records operations for GoDaddy API
 * Single responsibility: DNS record operations only
 */

import type { GoDaddyClient } from './godaddy-client';
import type {
  SetDnsHostnamesConfig,
  SetDnsHostnamesResult,
  DnsRecord,
} from './types';
import { validateDnsHostnamesConfig } from './validation';
import { logger, createChildLogger } from './logger';
import { withSpan, SpanStatusCode } from './tracing';
import { metrics } from './metrics';

/**
 * Sets DNS hostnames (A records) for ns1.box and ns2.box
 * Uses PUT /v1/domains/{domain}/records/{type}/{name} endpoint
 * 
 * @param client - GoDaddy API client instance
 * @param config - Configuration for setting DNS hostnames
 * @returns Result with success status and records or error
 * 
 * @example
 * ```typescript
 * const client = new GoDaddyClient({ apiKey, apiSecret });
 * const result = await setDnsHostnames(client, {
 *   domain: 'example.com',
 *   ns1Ip: '1.2.3.4',
 *   ns2Ip: '5.6.7.8',
 * });
 * ```
 */
export async function setDnsHostnames(
  client: GoDaddyClient,
  config: SetDnsHostnamesConfig
): Promise<SetDnsHostnamesResult> {
  const operationLogger = createChildLogger({
    operation: 'setDnsHostnames',
    domain: config.domain,
  });

  // Validate input before starting span
  validateDnsHostnamesConfig(config);

  return withSpan(
    'godaddy.dns.setHostnames',
    async (span) => {
      try {
        
        span.setAttribute('domain', config.domain);
        span.setAttribute('ns1.ip', config.ns1Ip);
        span.setAttribute('ns2.ip', config.ns2Ip);

        const ttl = config.ttl || 3600;
        operationLogger.info('Setting DNS hostnames', {
          ns1Ip: config.ns1Ip,
          ns2Ip: config.ns2Ip,
          ttl,
        });

        // Create DNS record objects
        const ns1Record: DnsRecord = {
          type: 'A',
          name: 'ns1.box',
          data: config.ns1Ip,
          ttl,
        };

        const ns2Record: DnsRecord = {
          type: 'A',
          name: 'ns2.box',
          data: config.ns2Ip,
          ttl,
        };

        // Set ns1.box A record
        await client.request({
          method: 'PUT',
          path: `/v1/domains/${config.domain}/records/A/ns1.box`,
          body: [ns1Record],
        });

        operationLogger.info('Set ns1.box A record', { ip: config.ns1Ip });

        // Set ns2.box A record
        await client.request({
          method: 'PUT',
          path: `/v1/domains/${config.domain}/records/A/ns2.box`,
          body: [ns2Record],
        });

        operationLogger.info('Set ns2.box A record', { ip: config.ns2Ip });

        span.setStatus({ code: SpanStatusCode.OK });
        
        metrics.requestsTotal.inc({
          operation: 'setDnsHostnames',
          domain: config.domain,
          status_code: '200',
        });

        return {
          success: true,
          records: {
            ns1: ns1Record,
            ns2: ns2Record,
          },
        };
      } catch (error) {
        operationLogger.error('Failed to set DNS hostnames', {
          error: error instanceof Error ? error.message : String(error),
        });

        metrics.errorsTotal.inc({
          operation: 'setDnsHostnames',
          domain: config.domain,
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
        'domain': config.domain,
        'operation': 'setDnsHostnames',
      },
    }
  );
}

