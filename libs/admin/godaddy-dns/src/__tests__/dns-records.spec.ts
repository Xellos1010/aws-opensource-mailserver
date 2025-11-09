/**
 * Unit tests for DNS records operations
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GoDaddyClient } from '../lib/godaddy-client';
import { setDnsHostnames } from '../lib/dns-records';
import { createTestClientConfig, createTestDnsHostnamesConfig } from '../__fixtures__/test-config.fixture';

// Mock fetch globally
global.fetch = vi.fn();

describe('setDnsHostnames', () => {
  let client: GoDaddyClient;

  beforeEach(() => {
    vi.clearAllMocks();
    client = new GoDaddyClient(createTestClientConfig());
  });

  it('should set DNS hostnames successfully', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({}),
    } as Response);

    const config = createTestDnsHostnamesConfig();
    const result = await setDnsHostnames(client, config);

    expect(result.success).toBe(true);
    expect(result.records).toBeDefined();
    expect(result.records?.ns1.data).toBe(config.ns1Ip);
    expect(result.records?.ns2.data).toBe(config.ns2Ip);
    expect(global.fetch).toHaveBeenCalledTimes(2); // Two PUT requests
  });

  it('should use default TTL when not provided', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({}),
    } as Response);

    const config = {
      domain: 'example.com',
      ns1Ip: '1.2.3.4',
      ns2Ip: '5.6.7.8',
    };
    const result = await setDnsHostnames(client, config);

    expect(result.success).toBe(true);
    expect(result.records?.ns1.ttl).toBe(3600); // Default TTL
  });

  it('should handle API errors', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({
        code: 'NOT_FOUND',
        message: 'Domain not found',
      }),
    } as Response);

    const config = createTestDnsHostnamesConfig();
    const result = await setDnsHostnames(client, config);

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });

  it('should validate input before making requests', async () => {
    const config = {
      domain: 'invalid..domain',
      ns1Ip: '1.2.3.4',
      ns2Ip: '5.6.7.8',
    };

    await expect(setDnsHostnames(client, config)).rejects.toThrow('Invalid domain format');
    expect(global.fetch).not.toHaveBeenCalled();
  });
});


