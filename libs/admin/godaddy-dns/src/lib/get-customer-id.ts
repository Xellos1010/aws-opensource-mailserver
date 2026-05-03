/**
 * Get customer ID from shopper ID
 * Single responsibility: Customer ID retrieval operations only
 */

import type { GoDaddyClient } from './godaddy-client';
import { logger, createChildLogger } from './logger';
import { withSpan, SpanStatusCode } from './tracing';
import { metrics } from './metrics';

/**
 * Shopper information response from GoDaddy API
 */
interface ShopperInfo {
  customerId?: string;
  email?: string;
  externalId?: number;
  marketId?: string;
  nameFirst?: string;
  nameLast?: string;
  shopperId: string;
}

/**
 * Get customer ID for a given shopper ID
 * Uses GET /v1/shoppers/{shopperId}?includes=customerId endpoint
 * 
 * @param client - GoDaddy API client instance
 * @param shopperId - Shopper ID (10-digit number)
 * @returns Customer ID (UUIDv4) or error
 * 
 * @example
 * ```typescript
 * const client = new GoDaddyClient({ apiKey, apiSecret });
 * const result = await getCustomerId(client, '253211715');
 * if (result.success) {
 *   console.log('Customer ID:', result.customerId);
 * }
 * ```
 */
export async function getCustomerId(
  client: GoDaddyClient,
  shopperId: string
): Promise<{ success: true; customerId: string } | { success: false; error: string }> {
  const operationLogger = createChildLogger({
    operation: 'getCustomerId',
    shopperId,
  });

  return withSpan(
    'godaddy.shoppers.getCustomerId',
    async (span) => {
      try {
        span.setAttribute('shopper.id', shopperId);

        operationLogger.info('Getting customer ID for shopper', { shopperId });

        // Use the public request method to get shopper info with customerId included
        // Note: includes parameter should be passed as a query string
        const shopperInfo = await client.request<ShopperInfo>({
          method: 'GET',
          path: `/v1/shoppers/${shopperId}?includes=customerId`,
        });

        if (!shopperInfo.customerId) {
          const error = 'Customer ID not found in shopper information';
          operationLogger.error(error, { shopperId });
          span.setStatus({ code: SpanStatusCode.ERROR });
          span.recordException(new Error(error));
          
          metrics.errorsTotal.inc({
            operation: 'getCustomerId',
            error_type: 'CustomerIdNotFound',
          });

          return {
            success: false,
            error,
          };
        }

        operationLogger.info('Retrieved customer ID', {
          shopperId,
          customerId: shopperInfo.customerId,
        });

        span.setAttribute('customer.id', shopperInfo.customerId);
        span.setStatus({ code: SpanStatusCode.OK });
        
        metrics.requestsTotal.inc({
          operation: 'getCustomerId',
          status_code: '200',
        });

        return {
          success: true,
          customerId: shopperInfo.customerId,
        };
      } catch (error) {
        operationLogger.error('Failed to get customer ID', {
          error: error instanceof Error ? error.message : String(error),
        });

        metrics.errorsTotal.inc({
          operation: 'getCustomerId',
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
        'operation': 'getCustomerId',
        'shopper.id': shopperId,
      },
    }
  );
}

