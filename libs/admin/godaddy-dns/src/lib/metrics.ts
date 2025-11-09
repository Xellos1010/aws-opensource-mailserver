/**
 * Metrics collection for GoDaddy DNS client
 * Simple implementation that can be enhanced with Prometheus/OpenTelemetry
 */

import type { LogContext } from './logger';
import { logger } from './logger';

export interface Counter {
  inc(labels?: Record<string, string>): void;
}

export interface Histogram {
  observe(value: number, labels?: Record<string, string>): void;
  startTimer(labels?: Record<string, string>): () => void;
}

/**
 * Simple counter implementation
 * Can be replaced with Prometheus counter when library is added
 */
class SimpleCounter implements Counter {
  private readonly name: string;
  private count = 0;
  private readonly labelNames: string[];

  constructor(name: string, labelNames: string[] = []) {
    this.name = name;
    this.labelNames = labelNames;
  }

  inc(labels?: Record<string, string>): void {
    this.count++;
    logger.debug('Counter incremented', {
      metric: {
        name: this.name,
        value: this.count,
        labels: labels || {},
      },
    });
  }

  getValue(): number {
    return this.count;
  }
}

/**
 * Simple histogram implementation
 * Can be replaced with Prometheus histogram when library is added
 */
class SimpleHistogram implements Histogram {
  private readonly name: string;
  private readonly buckets: number[];
  private values: number[] = [];
  private readonly labelNames: string[];

  constructor(name: string, buckets: number[] = [], labelNames: string[] = []) {
    this.name = name;
    this.buckets = buckets;
    this.labelNames = labelNames;
  }

  observe(value: number, labels?: Record<string, string>): void {
    this.values.push(value);
    logger.debug('Histogram observed', {
      metric: {
        name: this.name,
        value,
        labels: labels || {},
      },
    });
  }

  startTimer(labels?: Record<string, string>): () => void {
    const startTime = Date.now();
    return () => {
      const duration = Date.now() - startTime;
      this.observe(duration, labels);
    };
  }

  getValues(): number[] {
    return [...this.values];
  }
}

/**
 * Metrics registry
 */
class MetricsRegistry {
  private counters: Map<string, SimpleCounter> = new Map();
  private histograms: Map<string, SimpleHistogram> = new Map();

  createCounter(name: string, labelNames: string[] = []): Counter {
    if (!this.counters.has(name)) {
      this.counters.set(name, new SimpleCounter(name, labelNames));
    }
    return this.counters.get(name)!;
  }

  createHistogram(name: string, buckets: number[] = [], labelNames: string[] = []): Histogram {
    if (!this.histograms.has(name)) {
      this.histograms.set(name, new SimpleHistogram(name, buckets, labelNames));
    }
    return this.histograms.get(name)!;
  }
}

/**
 * Default metrics registry
 */
const registry = new MetricsRegistry();

/**
 * RED metrics: Rate, Errors, Duration
 */
export const metrics = {
  // Request rate counter
  requestsTotal: registry.createCounter('godaddy_dns_requests_total', ['operation', 'domain', 'status_code']),
  
  // Error rate counter
  errorsTotal: registry.createCounter('godaddy_dns_errors_total', ['operation', 'domain', 'error_type']),
  
  // Request duration histogram (in milliseconds)
  requestDuration: registry.createHistogram(
    'godaddy_dns_request_duration_ms',
    [10, 50, 100, 250, 500, 1000, 2500, 5000], // buckets in ms
    ['operation', 'domain']
  ),
  
  // Rate limit hits counter
  rateLimitHits: registry.createCounter('godaddy_dns_rate_limit_hits_total', ['operation']),
};

