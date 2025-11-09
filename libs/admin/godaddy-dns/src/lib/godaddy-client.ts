/**
 * GoDaddy API client with authentication, rate limiting, retry logic, and observability
 * Single responsibility: HTTP client for GoDaddy API only
 */

import type {
  GoDaddyClientConfig,
  RequestOptions,
  GoDaddyApiErrorResponse,
} from './types';
import {
  GoDaddyApiError,
  GoDaddyAuthenticationError,
  GoDaddyRateLimitError,
  GoDaddyValidationError,
  GoDaddyNotFoundError,
  GoDaddyTransientError,
  isRetryableError,
} from './errors';
import { validateClientConfig } from './validation';
import { logger, setCorrelationId, getCorrelationId } from './logger';
import { tracer, withSpan, SpanStatusCode, type Span } from './tracing';
import { metrics } from './metrics';

/**
 * Rate limiter implementation
 * Tracks requests per minute and enforces 60 req/min limit
 */
class RateLimiter {
  private readonly maxRequestsPerMinute: number;
  private requests: number[] = [];

  constructor(maxRequestsPerMinute: number = 60) {
    this.maxRequestsPerMinute = maxRequestsPerMinute;
  }

  /**
   * Check if request can be made, and record it
   * Returns wait time in milliseconds if rate limit exceeded
   */
  async checkRateLimit(): Promise<number> {
    const now = Date.now();
    const oneMinuteAgo = now - 60000;

    // Remove requests older than 1 minute
    this.requests = this.requests.filter((timestamp) => timestamp > oneMinuteAgo);

    if (this.requests.length >= this.maxRequestsPerMinute) {
      const oldestRequest = this.requests[0]!;
      const waitTime = oldestRequest + 60000 - now;
      return Math.max(0, waitTime);
    }

    this.requests.push(now);
    return 0;
  }
}

/**
 * Sleep utility for rate limiting and retries
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Generate jitter for exponential backoff
 */
function jitter(baseDelay: number): number {
  return baseDelay + Math.random() * baseDelay * 0.1; // 10% jitter
}

/**
 * GoDaddy API client
 */
export class GoDaddyClient {
  private readonly apiKey: string;
  private readonly apiSecret: string;
  private readonly baseUrl: string;
  private readonly customerId?: string;
  private readonly shopperId?: string;
  private readonly timeout: number;
  private readonly maxRetries: number;
  private readonly rateLimiter: RateLimiter;

  constructor(config: GoDaddyClientConfig) {
    validateClientConfig(config);
    
    this.apiKey = config.apiKey;
    this.apiSecret = config.apiSecret;
    this.baseUrl = config.baseUrl ?? 'https://api.godaddy.com';
    if (config.customerId !== undefined) {
      this.customerId = config.customerId;
    }
    if (config.shopperId !== undefined) {
      this.shopperId = config.shopperId;
    }
    this.timeout = config.timeout || 30000; // 30 seconds default
    this.maxRetries = config.maxRetries ?? 3;
    this.rateLimiter = new RateLimiter(60); // 60 requests per minute

    logger.info('GoDaddyClient initialized', {
      baseUrl: this.baseUrl,
      hasCustomerId: !!this.customerId,
      hasShopperId: !!this.shopperId,
      timeout: this.timeout,
      maxRetries: this.maxRetries,
    });
  }

  /**
   * Make HTTP request to GoDaddy API
   * Handles authentication, rate limiting, retries, timeouts, and error transformation
   */
  async request<T>(options: RequestOptions): Promise<T> {
    const correlationId = getCorrelationId() || `req-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    setCorrelationId(correlationId);

    return withSpan(
      `godaddy.api.${options.method.toLowerCase()}`,
      async (span) => {
        span.setAttribute('http.method', options.method);
        span.setAttribute('http.url', `${this.baseUrl}${options.path}`);
        span.setAttribute('correlation.id', correlationId);

        // Check rate limit
        const waitTime = await this.rateLimiter.checkRateLimit();
        if (waitTime > 0) {
          logger.warn('Rate limit exceeded, waiting', { waitTimeMs: waitTime });
          metrics.rateLimitHits.inc({ operation: options.path });
          await sleep(waitTime);
        }

        let lastError: unknown;
        let attempt = 0;

        while (attempt <= this.maxRetries) {
          try {
            const result = await this.executeRequest<T>(options, span, correlationId);
            metrics.requestsTotal.inc({
              operation: options.path,
              domain: this.extractDomainFromPath(options.path),
              status_code: '200',
            });
            span.setStatus({ code: SpanStatusCode.OK });
            return result;
          } catch (error) {
            lastError = error;
            attempt++;

            // Don't retry non-retryable errors
            if (!isRetryableError(error)) {
              logger.error('Non-retryable error encountered', {
                error: error instanceof Error ? error.message : String(error),
                attempt,
              });
              throw error;
            }

            // Don't retry if max retries exceeded
            if (attempt > this.maxRetries) {
              logger.error('Max retries exceeded', {
                error: error instanceof Error ? error.message : String(error),
                attempts: attempt,
              });
              throw error;
            }

            // Calculate exponential backoff with jitter
            const baseDelay = Math.min(1000 * Math.pow(2, attempt - 1), 10000); // Cap at 10s
            const delay = jitter(baseDelay);

            logger.warn('Retrying request after error', {
              error: error instanceof Error ? error.message : String(error),
              attempt,
              delayMs: delay,
            });

            await sleep(delay);
          }
        }

        // Should never reach here, but TypeScript needs it
        throw lastError;
      },
      {
        kind: 'client',
        attributes: {
          'http.method': options.method,
          'http.url': `${this.baseUrl}${options.path}`,
        },
      }
    );
  }

  /**
   * Execute a single HTTP request
   */
  private async executeRequest<T>(
    options: RequestOptions,
    span: Span,
    correlationId: string
  ): Promise<T> {
    const url = this.buildUrl(options.path, options.query);
    const headers = this.buildHeaders(correlationId);
    const body = options.body ? JSON.stringify(options.body) : undefined;

    const timer = metrics.requestDuration.startTimer({
      operation: options.path,
      domain: this.extractDomainFromPath(options.path),
    });

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeout);

      const fetchOptions: RequestInit = {
        method: options.method,
        headers,
        signal: controller.signal,
      };
      if (body !== undefined) {
        fetchOptions.body = body;
      }
      const response = await fetch(url, fetchOptions);

      clearTimeout(timeoutId);
      timer();

      span.setAttribute('http.status_code', response.status);

      if (!response.ok) {
        const errorResponse = await this.parseErrorResponse(response);
        const error = this.transformError(response.status, errorResponse);
        
        metrics.errorsTotal.inc({
          operation: options.path,
          domain: this.extractDomainFromPath(options.path),
          error_type: error.name,
        });

        if (error instanceof Error) {
          span.recordException(error);
        }

        throw error;
      }

      const data = await response.json() as T;
      return data;
    } catch (error) {
      timer();
      
      if (error instanceof Error && error.name === 'AbortError') {
        const timeoutError = new GoDaddyTransientError(
          `Request timeout after ${this.timeout}ms`,
          504,
          error
        );
        span.recordException(timeoutError);
        throw timeoutError;
      }

      if (error instanceof GoDaddyApiError) {
        throw error;
      }

      // Wrap unknown errors as transient errors
      const wrappedError = new GoDaddyTransientError(
        `Network error: ${error instanceof Error ? error.message : String(error)}`,
        500,
        error
      );
      span.recordException(wrappedError);
      throw wrappedError;
    }
  }

  /**
   * Build full URL with query parameters
   */
  private buildUrl(path: string, query?: Record<string, string | number | boolean | undefined>): string {
    const url = new URL(path, this.baseUrl);
    if (query) {
      for (const [key, value] of Object.entries(query)) {
        if (value !== undefined) {
          url.searchParams.append(key, String(value));
        }
      }
    }
    return url.toString();
  }

  /**
   * Build request headers with authentication
   */
  private buildHeaders(correlationId: string): Record<string, string> {
    const auth = Buffer.from(`${this.apiKey}:${this.apiSecret}`).toString('base64');
    const headers: Record<string, string> = {
      'Authorization': `sso-key ${auth}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'X-Request-Id': correlationId,
    };

    if (this.shopperId) {
      headers['X-Shopper-Id'] = this.shopperId;
    }

    return headers;
  }

  /**
   * Parse error response from API
   */
  private async parseErrorResponse(response: Response): Promise<GoDaddyApiErrorResponse> {
    try {
      return await response.json() as GoDaddyApiErrorResponse;
    } catch {
      return {
        code: 'UNKNOWN_ERROR',
        message: `HTTP ${response.status}: ${response.statusText}`,
      };
    }
  }

  /**
   * Transform HTTP error response to domain error
   */
  private transformError(
    statusCode: number,
    errorResponse: GoDaddyApiErrorResponse
  ): GoDaddyApiError {
    const message = errorResponse.message || `HTTP ${statusCode}`;

    switch (statusCode) {
      case 401:
        return new GoDaddyAuthenticationError(message);
      case 404:
        return new GoDaddyNotFoundError(message);
      case 422:
        return new GoDaddyValidationError(message, errorResponse.fields);
      case 429:
        return new GoDaddyRateLimitError(
          message,
          errorResponse.retryAfterSec || 60
        );
      case 500:
      case 502:
      case 503:
      case 504:
        return new GoDaddyTransientError(message, statusCode);
      default:
        return new GoDaddyApiError(message, 'UNKNOWN_ERROR', statusCode);
    }
  }

  /**
   * Extract domain from API path for metrics
   */
  private extractDomainFromPath(path: string): string {
    const match = path.match(/\/domains\/([^/]+)/);
    return match ? match[1]! : 'unknown';
  }
}

