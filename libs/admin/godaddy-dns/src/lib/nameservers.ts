/**
 * Nameserver operations for GoDaddy API
 * Single responsibility: Nameserver operations only
 */

import type { GoDaddyClient } from './godaddy-client';
import type {
  SetNameserversConfig,
  SetNameserversResult,
} from './types';
import { validateNameserversConfig } from './validation';
import { logger, createChildLogger } from './logger';
import { withSpan, SpanStatusCode } from './tracing';
import { metrics } from './metrics';

/**
 * Sets nameservers for a domain
 * Uses PUT /v2/customers/{customerId}/domains/{domain}/nameServers endpoint
 * Constructs nameserver FQDNs: ns1.box.{domain} and ns2.box.{domain}
 * 
 * @param client - GoDaddy API client instance
 * @param config - Configuration for setting nameservers
 * @returns Result with success status and nameservers or error
 * 
 * @example
 * ```typescript
 * const client = new GoDaddyClient({ apiKey, apiSecret, customerId: '123' });
 * const result = await setNameservers(client, {
 *   domain: 'example.com',
 *   customerId: '123',
 * });
 * ```
 */
export async function setNameservers(
  client: GoDaddyClient,
  config: SetNameserversConfig
): Promise<SetNameserversResult> {
  const operationLogger = createChildLogger({
    operation: 'setNameservers',
    domain: config.domain,
  });

  // Validate input before starting span
  validateNameserversConfig(config);

  return withSpan(
    'godaddy.dns.setNameservers',
    async (span) => {
      try {
        
        span.setAttribute('domain', config.domain);
        span.setAttribute('customer.id', config.customerId);

        // Construct nameserver FQDNs if not provided
        const nameservers = config.nameservers || [
          `ns1.box.${config.domain}`,
          `ns2.box.${config.domain}`,
        ];

        operationLogger.info('Setting nameservers', {
          nameservers,
          customerId: config.customerId,
        });

        span.setAttribute('nameservers.count', nameservers.length);

        // Set nameservers via v2 API
        await client.request({
          method: 'PUT',
          path: `/v2/customers/${config.customerId}/domains/${config.domain}/nameServers`,
          body: {
            nameServers: nameservers,
          },
        });

        operationLogger.info('Nameservers set successfully', { nameservers });

        span.setStatus({ code: SpanStatusCode.OK });
        
        metrics.requestsTotal.inc({
          operation: 'setNameservers',
          domain: config.domain,
          status_code: '202', // API returns 202 Accepted
        });

        return {
          success: true,
          nameservers,
        };
      } catch (error) {
        operationLogger.error('Failed to set nameservers', {
          error: error instanceof Error ? error.message : String(error),
        });

        metrics.errorsTotal.inc({
          operation: 'setNameservers',
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
        'operation': 'setNameservers',
      },
    }
  );
}

