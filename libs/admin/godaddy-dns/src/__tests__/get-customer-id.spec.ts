/**
 * Unit tests for getCustomerId function
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GoDaddyClient } from '../lib/godaddy-client';
import { getCustomerId } from '../lib/get-customer-id';
import { createTestClientConfig } from '../__fixtures__/test-config.fixture';

// Mock fetch globally
global.fetch = vi.fn();

describe('getCustomerId', () => {
  let client: GoDaddyClient;

  beforeEach(() => {
    vi.clearAllMocks();
    client = new GoDaddyClient(createTestClientConfig());
  });

  it('should retrieve customer ID from shopper ID', async () => {
    const mockShopperInfo = {
      customerId: '295e3bc3-b3b9-4d95-aae5-ede41a994d13',
      email: 'user@example.com',
      shopperId: '253211715',
    };

    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => mockShopperInfo,
    } as Response);

    const result = await getCustomerId(client, '253211715');

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.customerId).toBe(mockShopperInfo.customerId);
      expect(result.customerId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    }

    // Verify correct endpoint was called
    const call = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(call[0]).toContain('/v1/shoppers/253211715');
    expect(call[0]).toContain('includes=customerId');
  });

  it('should handle missing customer ID in response', async () => {
    const mockShopperInfo = {
      email: 'user@example.com',
      shopperId: '253211715',
      // customerId is missing
    };

    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => mockShopperInfo,
    } as Response);

    const result = await getCustomerId(client, '253211715');

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain('Customer ID not found');
    }
  });

  it('should handle API errors', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false,
      status: 404,
      json: async () => ({
        code: 'NOT_FOUND',
        message: 'Shopper not found',
      }),
    } as Response);

    const result = await getCustomerId(client, '999999999');

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBeDefined();
    }
  });

  it('should handle network errors', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error('Network error')
    );

    const result = await getCustomerId(client, '253211715');

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBeDefined();
      expect(result.error).toContain('Network error');
    }
  });
});


