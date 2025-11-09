/**
 * Unit tests for getDnsRecords function
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GoDaddyClient } from '../lib/godaddy-client';
import { getDnsRecords } from '../lib/get-dns-records';
import { createTestClientConfig } from '../__fixtures__/test-config.fixture';

// Mock fetch globally
global.fetch = vi.fn();

describe('getDnsRecords', () => {
  let client: GoDaddyClient;

  beforeEach(() => {
    vi.clearAllMocks();
    client = new GoDaddyClient(createTestClientConfig());
  });

  it('should retrieve DNS records for a domain', async () => {
    const mockRecords = [
      {
        type: 'A',
        name: 'ns1.box',
        data: '1.2.3.4',
        ttl: 3600,
      },
      {
        type: 'A',
        name: 'ns2.box',
        data: '5.6.7.8',
        ttl: 3600,
      },
    ];

    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => mockRecords,
    } as Response);

    const result = await getDnsRecords(client, 'example.com');

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.records).toEqual(mockRecords);
      expect(result.records.length).toBe(2);
    }
  });

  it('should retrieve DNS records filtered by type', async () => {
    const mockRecords = [
      {
        type: 'A',
        name: 'ns1.box',
        data: '1.2.3.4',
        ttl: 3600,
      },
    ];

    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => mockRecords,
    } as Response);

    const result = await getDnsRecords(client, 'example.com', 'A');

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.records).toEqual(mockRecords);
    }

    // Verify correct endpoint was called
    const call = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(call[0]).toContain('/v1/domains/example.com/records/A');
  });

  it('should retrieve DNS records filtered by type and name', async () => {
    const mockRecords = [
      {
        type: 'A',
        name: 'ns1.box',
        data: '1.2.3.4',
        ttl: 3600,
      },
    ];

    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => mockRecords,
    } as Response);

    const result = await getDnsRecords(client, 'example.com', 'A', 'ns1.box');

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.records).toEqual(mockRecords);
    }

    // Verify correct endpoint was called
    const call = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(call[0]).toContain('/v1/domains/example.com/records/A/ns1.box');
  });

  it('should handle API errors', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false,
      status: 404,
      json: async () => ({
        code: 'NOT_FOUND',
        message: 'Domain not found',
      }),
    } as Response);

    const result = await getDnsRecords(client, 'nonexistent.com');

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBeDefined();
    }
  });

  it('should handle network errors', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error('Network error')
    );

    const result = await getDnsRecords(client, 'example.com');

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBeDefined();
      expect(result.error).toContain('Network error');
    }
  });
});


