/**
 * Distributed tracing for GoDaddy DNS client
 * Basic implementation that can be enhanced with OpenTelemetry
 */

import type { LogContext } from './logger';
import { logger } from './logger';

export interface Span {
  setAttribute(key: string, value: string | number | boolean): void;
  setStatus(status: { code: SpanStatusCode; message?: string }): void;
  recordException(exception: Error): void;
  end(): void;
}

export enum SpanStatusCode {
  OK = 'OK',
  ERROR = 'ERROR',
  UNSET = 'UNSET',
}

export interface Tracer {
  startSpan(name: string, options?: SpanOptions): Span;
}

export interface SpanOptions {
  kind?: 'client' | 'server' | 'internal';
  attributes?: Record<string, string | number | boolean>;
}

/**
 * Simple span implementation
 * Can be replaced with OpenTelemetry spans when library is added
 */
class SimpleSpan implements Span {
  private readonly name: string;
  private readonly startTime: number;
  private attributes: Record<string, string | number | boolean> = {};
  private status: { code: SpanStatusCode; message?: string } = { code: SpanStatusCode.UNSET };
  private ended = false;

  constructor(name: string, options?: SpanOptions) {
    this.name = name;
    this.startTime = Date.now();
    if (options?.attributes) {
      this.attributes = { ...options.attributes };
    }
    
    // Log span start
    logger.debug('Span started', {
      span: {
        name: this.name,
        kind: options?.kind || 'internal',
        attributes: this.attributes,
      },
    });
  }

  setAttribute(key: string, value: string | number | boolean): void {
    if (this.ended) {
      return;
    }
    this.attributes[key] = value;
  }

  setStatus(status: { code: SpanStatusCode; message?: string }): void {
    if (this.ended) {
      return;
    }
    this.status = status;
  }

  recordException(exception: Error): void {
    if (this.ended) {
      return;
    }
    logger.error('Exception recorded in span', {
      span: {
        name: this.name,
        error: {
          name: exception.name,
          message: exception.message,
          stack: process.env['NODE_ENV'] === 'development' ? exception.stack : undefined,
        },
      },
    });
    this.setStatus({ code: SpanStatusCode.ERROR, message: exception.message });
  }

  end(): void {
    if (this.ended) {
      return;
    }
    this.ended = true;
    const duration = Date.now() - this.startTime;
    
    logger.debug('Span ended', {
      span: {
        name: this.name,
        duration,
        status: this.status.code,
        attributes: this.attributes,
      },
    });
  }
}

/**
 * Simple tracer implementation
 * Can be replaced with OpenTelemetry tracer when library is added
 */
class SimpleTracer implements Tracer {
  startSpan(name: string, options?: SpanOptions): Span {
    return new SimpleSpan(name, options);
  }
}

/**
 * Default tracer instance
 */
export const tracer: Tracer = new SimpleTracer();

/**
 * Execute a function within a span
 */
export async function withSpan<T>(
  name: string,
  fn: (span: Span) => Promise<T>,
  options?: SpanOptions
): Promise<T> {
  const span = tracer.startSpan(name, options);
  try {
    const result = await fn(span);
    span.setStatus({ code: SpanStatusCode.OK });
    return result;
  } catch (error) {
    if (error instanceof Error) {
      span.recordException(error);
    }
    throw error;
  } finally {
    span.end();
  }
}


