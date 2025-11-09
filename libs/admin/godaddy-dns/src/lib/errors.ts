/**
 * Domain error classes for GoDaddy API client
 * Wraps third-party errors at module boundaries per error-handling standards
 */

/**
 * Base error class for all GoDaddy API errors
 */
export class GoDaddyApiError extends Error {
  public readonly code: string;
  public readonly statusCode?: number;
  public override readonly cause?: unknown;

  constructor(
    message: string,
    code: string,
    statusCode?: number,
    cause?: unknown
  ) {
    super(message);
    this.name = 'GoDaddyApiError';
    this.code = code;
    if (statusCode !== undefined) {
      this.statusCode = statusCode;
    }
    if (cause !== undefined) {
      this.cause = cause;
    }

    // Maintains proper stack trace for where error was thrown (V8 only)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}

/**
 * Authentication error (401)
 * Non-retryable
 */
export class GoDaddyAuthenticationError extends GoDaddyApiError {
  constructor(message: string, cause?: unknown) {
    super(message, 'AUTHENTICATION_ERROR', 401, cause);
    this.name = 'GoDaddyAuthenticationError';
  }
}

/**
 * Rate limit error (429)
 * Includes retryAfterSec for backoff calculation
 */
export class GoDaddyRateLimitError extends GoDaddyApiError {
  public readonly retryAfterSec: number;

  constructor(message: string, retryAfterSec: number, cause?: unknown) {
    super(message, 'RATE_LIMIT_ERROR', 429, cause);
    this.name = 'GoDaddyRateLimitError';
    this.retryAfterSec = retryAfterSec;
  }
}

/**
 * Validation error (422)
 * Non-retryable, includes field-level error details
 */
export class GoDaddyValidationError extends GoDaddyApiError {
  public readonly fields?: Array<{
    code: string;
    message: string;
    path: string;
    pathRelated?: string;
  }>;

  constructor(
    message: string,
    fields?: Array<{
      code: string;
      message: string;
      path: string;
      pathRelated?: string;
    }>,
    cause?: unknown
  ) {
    super(message, 'VALIDATION_ERROR', 422, cause);
    this.name = 'GoDaddyValidationError';
    if (fields !== undefined) {
      this.fields = fields;
    }
  }
}

/**
 * Not found error (404)
 * Non-retryable
 */
export class GoDaddyNotFoundError extends GoDaddyApiError {
  constructor(message: string, cause?: unknown) {
    super(message, 'NOT_FOUND_ERROR', 404, cause);
    this.name = 'GoDaddyNotFoundError';
  }
}

/**
 * Transient network/server error (500, 502, 503, 504)
 * Retryable with exponential backoff
 */
export class GoDaddyTransientError extends GoDaddyApiError {
  constructor(message: string, statusCode: number, cause?: unknown) {
    super(message, 'TRANSIENT_ERROR', statusCode, cause);
    this.name = 'GoDaddyTransientError';
  }
}

/**
 * Type guard to check if error is a GoDaddy API error
 */
export function isGoDaddyApiError(error: unknown): error is GoDaddyApiError {
  return error instanceof GoDaddyApiError;
}

/**
 * Type guard to check if error is retryable
 */
export function isRetryableError(error: unknown): boolean {
  if (error instanceof GoDaddyTransientError) {
    return true;
  }
  if (error instanceof GoDaddyRateLimitError) {
    return true;
  }
  // Network errors are retryable
  if (error instanceof Error && 'code' in error) {
    const code = (error as { code: string }).code;
    return code === 'ECONNRESET' || code === 'ETIMEDOUT' || code === 'ENOTFOUND';
  }
  return false;
}

