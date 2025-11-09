/**
 * Unit tests for nameserver operations
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GoDaddyClient } from '../lib/godaddy-client';
import { setNameservers } from '../lib/nameservers';
import { createTestClientConfig, createTestNameserversConfig } from '../__fixtures__/test-config.fixture';

// Mock fetch globally
global.fetch = vi.fn();

describe('setNameservers', () => {
  let client: GoDaddyClient;

  beforeEach(() => {
    vi.clearAllMocks();
    client = new GoDaddyClient(createTestClientConfig());
  });

  it('should set nameservers successfully', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      status: 202,
      json: async () => ({}),
    } as Response);

    const config = createTestNameserversConfig();
    const result = await setNameservers(client, config);

    expect(result.success).toBe(true);
    expect(result.nameservers).toEqual(config.nameservers);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('should construct nameserver FQDNs when not provided', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      status: 202,
      json: async () => ({}),
    } as Response);

    const config = {
      domain: 'example.com',
      customerId: 'test-customer-id',
    };
    const result = await setNameservers(client, config);

    expect(result.success).toBe(true);
    expect(result.nameservers).toEqual([
      'ns1.box.example.com',
      'ns2.box.example.com',
    ]);
  });

  it('should handle API errors', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      status: 422,
      json: async () => ({
        code: 'VALIDATION_ERROR',
        message: 'At least two nameservers must be specified',
      }),
    } as Response);

    const config = createTestNameserversConfig();
    const result = await setNameservers(client, config);

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });

  it('should validate input before making requests', async () => {
    const config = {
      domain: 'invalid..domain',
      customerId: 'test-customer-id',
    };

    await expect(setNameservers(client, config)).rejects.toThrow('Invalid domain format');
    expect(global.fetch).not.toHaveBeenCalled();
  });
});


