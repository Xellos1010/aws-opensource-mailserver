/**
 * Test fixtures for GoDaddy API responses
 */

import type { GoDaddyApiErrorResponse } from '../lib/types';

export const mockSuccessResponse = {};

export const mockErrorResponse: GoDaddyApiErrorResponse = {
  code: 'VALIDATION_ERROR',
  message: 'Validation failed',
  fields: [
    {
      code: 'REQUIRED',
      message: 'Field is required',
      path: 'domain',
    },
  ],
};

export const mockRateLimitErrorResponse: GoDaddyApiErrorResponse = {
  code: 'RATE_LIMIT_ERROR',
  message: 'Too many requests',
  retryAfterSec: 60,
};

export const mockNotFoundErrorResponse: GoDaddyApiErrorResponse = {
  code: 'NOT_FOUND_ERROR',
  message: 'Domain not found',
};

export const mockTransientErrorResponse: GoDaddyApiErrorResponse = {
  code: 'TRANSIENT_ERROR',
  message: 'Internal server error',
};



















