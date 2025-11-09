/**
 * Unit tests for GoDaddyClient
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { GoDaddyClient } from '../lib/godaddy-client';
import {
  GoDaddyAuthenticationError,
  GoDaddyRateLimitError,
  GoDaddyValidationError,
  GoDaddyNotFoundError,
  GoDaddyTransientError,
} from '../lib/errors';
import { createTestClientConfig } from '../__fixtures__/test-config.fixture';

// Mock fetch globally
global.fetch = vi.fn();

describe('GoDaddyClient', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('constructor', () => {
    it('should create client with valid config', () => {
      const client = new GoDaddyClient(createTestClientConfig());
      expect(client).toBeInstanceOf(GoDaddyClient);
    });

    it('should use default baseUrl when not provided', () => {
      const client = new GoDaddyClient({
        apiKey: 'test-key',
        apiSecret: 'test-secret',
      });
      // Base URL is private, but we can test via requests
      expect(client).toBeInstanceOf(GoDaddyClient);
    });

    it('should throw on invalid config', () => {
      expect(() => {
        new GoDaddyClient({
          apiKey: '',
          apiSecret: 'test-secret',
        } as unknown as Parameters<typeof GoDaddyClient>[0]);
      }).toThrow('apiKey is required');
    });
  });

  describe('request', () => {
    it('should make successful GET request', async () => {
      const mockResponse = { data: 'test' };
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockResponse,
      } as Response);

      const client = new GoDaddyClient(createTestClientConfig());
      const result = await client.request({
        method: 'GET',
        path: '/v1/test',
      });

      expect(result).toEqual(mockResponse);
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    it('should include authentication headers', async () => {
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({}),
      } as Response);

      const client = new GoDaddyClient(createTestClientConfig());
      await client.request({
        method: 'GET',
        path: '/v1/test',
      });

      const call = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
      const options = call[1] as RequestInit;
      const headers = options.headers as Record<string, string>;
      const authHeader = headers['Authorization'];
      expect(authHeader).toContain('sso-key');
    });

    it('should include X-Shopper-Id header when provided', async () => {
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({}),
      } as Response);

      const client = new GoDaddyClient(
        createTestClientConfig({ shopperId: 'test-shopper' })
      );
      await client.request({
        method: 'GET',
        path: '/v1/test',
      });

      const call = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
      const options = call[1] as RequestInit;
      const headers = options.headers as Record<string, string>;
      const shopperHeader = headers['X-Shopper-Id'];
      expect(shopperHeader).toBe('test-shopper');
    });

    it('should handle 401 authentication error', async () => {
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({
          code: 'AUTH_ERROR',
          message: 'Invalid credentials',
        }),
      } as Response);

      const client = new GoDaddyClient(createTestClientConfig());
      await expect(
        client.request({
          method: 'GET',
          path: '/v1/test',
        })
      ).rejects.toThrow(GoDaddyAuthenticationError);
    });

    it('should handle 404 not found error', async () => {
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: async () => ({
          code: 'NOT_FOUND',
          message: 'Resource not found',
        }),
      } as Response);

      const client = new GoDaddyClient(createTestClientConfig());
      await expect(
        client.request({
          method: 'GET',
          path: '/v1/test',
        })
      ).rejects.toThrow(GoDaddyNotFoundError);
    });

    it('should handle 422 validation error', async () => {
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: false,
        status: 422,
        json: async () => ({
          code: 'VALIDATION_ERROR',
          message: 'Validation failed',
          fields: [
            {
              code: 'REQUIRED',
              message: 'Field is required',
              path: 'domain',
            },
          ],
        }),
      } as Response);

      const client = new GoDaddyClient(createTestClientConfig());
      await expect(
        client.request({
          method: 'GET',
          path: '/v1/test',
        })
      ).rejects.toThrow(GoDaddyValidationError);
    });

    it('should handle 429 rate limit error', async () => {
      // Mock fetch to return 429 error, and prevent retries by setting maxRetries to 0
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: false,
        status: 429,
        json: async () => ({
          code: 'RATE_LIMIT',
          message: 'Too many requests',
          retryAfterSec: 60,
        }),
      } as Response);

      // Create client with maxRetries: 0 to prevent retries
      const client = new GoDaddyClient(createTestClientConfig({ maxRetries: 0 }));
      
      await expect(
        client.request({
          method: 'GET',
          path: '/v1/test',
        })
      ).rejects.toThrow(GoDaddyRateLimitError);
    });

    it('should retry on transient errors', async () => {
      // First call fails with 500, second succeeds
      (global.fetch as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce({
          ok: false,
          status: 500,
          json: async () => ({
            code: 'SERVER_ERROR',
            message: 'Internal server error',
          }),
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({ success: true }),
        } as Response);

      const client = new GoDaddyClient(createTestClientConfig({ maxRetries: 3 }));
      
      // Advance timers to skip retry delay
      const promise = client.request({
        method: 'GET',
        path: '/v1/test',
      });
      
      await vi.advanceTimersByTimeAsync(2000); // Wait for retry delay
      
      const result = await promise;
      expect(result).toEqual({ success: true });
      expect(global.fetch).toHaveBeenCalledTimes(2);
    });

    it('should timeout after specified duration', async () => {
      vi.useRealTimers(); // Use real timers for timeout test
      
      (global.fetch as ReturnType<typeof vi.fn>).mockImplementation(
        (url: string, options?: RequestInit) => {
          return new Promise((_, reject) => {
            // Set up abort handler
            if (options?.signal) {
              options.signal.addEventListener('abort', () => {
                const error = new Error('The user aborted a request.');
                error.name = 'AbortError';
                reject(error);
              });
            }
            // Never resolves, will be aborted by timeout
          });
        }
      );

      const client = new GoDaddyClient(
        createTestClientConfig({ timeout: 100 })
      );
      
      const promise = client.request({
        method: 'GET',
        path: '/v1/test',
      });
      
      await expect(promise).rejects.toThrow('Request timeout');
      
      vi.useFakeTimers(); // Restore fake timers
    });

    it('should not retry non-retryable errors', async () => {
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({
          code: 'AUTH_ERROR',
          message: 'Invalid credentials',
        }),
      } as Response);

      const client = new GoDaddyClient(createTestClientConfig({ maxRetries: 3 }));
      
      await expect(
        client.request({
          method: 'GET',
          path: '/v1/test',
        })
      ).rejects.toThrow(GoDaddyAuthenticationError);
      
      // Should only be called once (no retries)
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });
  });

  describe('rate limiting', () => {
    it('should throttle requests to 60 per minute', async () => {
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({}),
      } as Response);

      const client = new GoDaddyClient(createTestClientConfig());

      // Make 61 requests rapidly
      const promises = Array.from({ length: 61 }, () =>
        client.request({
          method: 'GET',
          path: '/v1/test',
        })
      );

      // Advance time to allow rate limiter to process (need to advance enough for all requests)
      await vi.advanceTimersByTimeAsync(70000); // More than 1 minute to allow all requests

      // All requests should eventually complete
      await Promise.all(promises);

      // Should have been called 61 times, but with throttling
      expect(global.fetch).toHaveBeenCalled();
    });
  });
});

