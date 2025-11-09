/**
 * Unit tests for error classes
 */

import { describe, it, expect } from 'vitest';
import {
  GoDaddyApiError,
  GoDaddyAuthenticationError,
  GoDaddyRateLimitError,
  GoDaddyValidationError,
  GoDaddyNotFoundError,
  GoDaddyTransientError,
  isGoDaddyApiError,
  isRetryableError,
} from '../lib/errors';

describe('GoDaddyApiError', () => {
  it('should create error with message and code', () => {
    const error = new GoDaddyApiError('Test error', 'TEST_CODE');
    expect(error.message).toBe('Test error');
    expect(error.code).toBe('TEST_CODE');
    expect(error.name).toBe('GoDaddyApiError');
  });

  it('should include status code when provided', () => {
    const error = new GoDaddyApiError('Test error', 'TEST_CODE', 404);
    expect(error.statusCode).toBe(404);
  });

  it('should include cause when provided', () => {
    const cause = new Error('Original error');
    const error = new GoDaddyApiError('Test error', 'TEST_CODE', undefined, cause);
    expect(error.cause).toBe(cause);
  });
});

describe('GoDaddyAuthenticationError', () => {
  it('should create authentication error', () => {
    const error = new GoDaddyAuthenticationError('Invalid credentials');
    expect(error.message).toBe('Invalid credentials');
    expect(error.code).toBe('AUTHENTICATION_ERROR');
    expect(error.statusCode).toBe(401);
    expect(error.name).toBe('GoDaddyAuthenticationError');
  });

  it('should not be retryable', () => {
    const error = new GoDaddyAuthenticationError('Invalid credentials');
    expect(isRetryableError(error)).toBe(false);
  });
});

describe('GoDaddyRateLimitError', () => {
  it('should create rate limit error with retry after', () => {
    const error = new GoDaddyRateLimitError('Rate limit exceeded', 60);
    expect(error.message).toBe('Rate limit exceeded');
    expect(error.code).toBe('RATE_LIMIT_ERROR');
    expect(error.statusCode).toBe(429);
    expect(error.retryAfterSec).toBe(60);
    expect(error.name).toBe('GoDaddyRateLimitError');
  });

  it('should be retryable', () => {
    const error = new GoDaddyRateLimitError('Rate limit exceeded', 60);
    expect(isRetryableError(error)).toBe(true);
  });
});

describe('GoDaddyValidationError', () => {
  it('should create validation error', () => {
    const error = new GoDaddyValidationError('Validation failed');
    expect(error.message).toBe('Validation failed');
    expect(error.code).toBe('VALIDATION_ERROR');
    expect(error.statusCode).toBe(422);
    expect(error.name).toBe('GoDaddyValidationError');
  });

  it('should include field errors when provided', () => {
    const fields = [
      { code: 'REQUIRED', message: 'Field is required', path: 'domain' },
    ];
    const error = new GoDaddyValidationError('Validation failed', fields);
    expect(error.fields).toEqual(fields);
  });

  it('should not be retryable', () => {
    const error = new GoDaddyValidationError('Validation failed');
    expect(isRetryableError(error)).toBe(false);
  });
});

describe('GoDaddyNotFoundError', () => {
  it('should create not found error', () => {
    const error = new GoDaddyNotFoundError('Domain not found');
    expect(error.message).toBe('Domain not found');
    expect(error.code).toBe('NOT_FOUND_ERROR');
    expect(error.statusCode).toBe(404);
    expect(error.name).toBe('GoDaddyNotFoundError');
  });

  it('should not be retryable', () => {
    const error = new GoDaddyNotFoundError('Domain not found');
    expect(isRetryableError(error)).toBe(false);
  });
});

describe('GoDaddyTransientError', () => {
  it('should create transient error', () => {
    const error = new GoDaddyTransientError('Server error', 500);
    expect(error.message).toBe('Server error');
    expect(error.code).toBe('TRANSIENT_ERROR');
    expect(error.statusCode).toBe(500);
    expect(error.name).toBe('GoDaddyTransientError');
  });

  it('should be retryable', () => {
    const error = new GoDaddyTransientError('Server error', 500);
    expect(isRetryableError(error)).toBe(true);
  });
});

describe('isGoDaddyApiError', () => {
  it('should return true for GoDaddy API errors', () => {
    const error = new GoDaddyApiError('Test', 'TEST');
    expect(isGoDaddyApiError(error)).toBe(true);
  });

  it('should return false for regular errors', () => {
    const error = new Error('Test');
    expect(isGoDaddyApiError(error)).toBe(false);
  });

  it('should return false for non-error values', () => {
    expect(isGoDaddyApiError('string')).toBe(false);
    expect(isGoDaddyApiError(null)).toBe(false);
    expect(isGoDaddyApiError(undefined)).toBe(false);
  });
});

describe('isRetryableError', () => {
  it('should return true for transient errors', () => {
    const error = new GoDaddyTransientError('Server error', 500);
    expect(isRetryableError(error)).toBe(true);
  });

  it('should return true for rate limit errors', () => {
    const error = new GoDaddyRateLimitError('Rate limit', 60);
    expect(isRetryableError(error)).toBe(true);
  });

  it('should return false for authentication errors', () => {
    const error = new GoDaddyAuthenticationError('Auth failed');
    expect(isRetryableError(error)).toBe(false);
  });

  it('should return false for validation errors', () => {
    const error = new GoDaddyValidationError('Validation failed');
    expect(isRetryableError(error)).toBe(false);
  });

  it('should return true for network errors', () => {
    const error = new Error('Connection reset');
    (error as { code: string }).code = 'ECONNRESET';
    expect(isRetryableError(error)).toBe(true);
  });
});

