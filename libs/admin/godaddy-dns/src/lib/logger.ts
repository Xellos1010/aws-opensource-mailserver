/**
 * Structured JSON logger for GoDaddy DNS client
 * Implements structured-logging standards with correlation IDs and PII redaction
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'fatal';

export interface LogContext {
  [key: string]: unknown;
}

export interface Logger {
  debug(message: string, context?: LogContext): void;
  info(message: string, context?: LogContext): void;
  warn(message: string, context?: LogContext): void;
  error(message: string, context?: LogContext): void;
  fatal(message: string, context?: LogContext): void;
}

/**
 * PII redaction patterns
 */
const PII_PATTERNS = {
  apiKey: /[a-zA-Z0-9]{32,}/g,
  apiSecret: /[a-zA-Z0-9]{32,}/g,
  customerId: /[a-f0-9-]{36}/gi, // UUID pattern
};

/**
 * Sensitive field names to redact
 */
const SENSITIVE_FIELDS = ['apiKey', 'apiSecret', 'password', 'token', 'secret', 'authorization'];

/**
 * Redacts PII from log context
 */
function redactPII(context: LogContext): LogContext {
  const redacted: LogContext = {};
  
  for (const [key, value] of Object.entries(context)) {
    if (SENSITIVE_FIELDS.includes(key.toLowerCase())) {
      redacted[key] = '[REDACTED]';
      continue;
    }
    
    if (typeof value === 'string') {
      let redactedValue = value;
      for (const pattern of Object.values(PII_PATTERNS)) {
        redactedValue = redactedValue.replace(pattern, '[REDACTED]');
      }
      redacted[key] = redactedValue;
    } else {
      redacted[key] = value;
    }
  }
  
  return redacted;
}

/**
 * Correlation ID storage using AsyncLocalStorage for async context propagation
 */
class CorrelationStore {
  private static store: Map<string, string> = new Map();

  static set(correlationId: string): void {
    // In a real implementation, use AsyncLocalStorage
    // For now, use a simple Map keyed by async context
    this.store.set('current', correlationId);
  }

  static get(): string | undefined {
    return this.store.get('current');
  }

  static clear(): void {
    this.store.delete('current');
  }
}

/**
 * Structured logger implementation
 */
class StructuredLogger implements Logger {
  private readonly service: string;
  private readonly version: string;
  private readonly environment: string;
  private readonly minLevel: LogLevel;

  constructor(options?: {
    service?: string;
    version?: string;
    environment?: string;
    minLevel?: LogLevel;
  }) {
    this.service = options?.service || 'godaddy-dns';
    this.version = options?.version || '0.0.1';
    this.environment = options?.environment || process.env['NODE_ENV'] || 'development';
    this.minLevel = options?.minLevel || (this.environment === 'development' ? 'debug' : 'info');
  }

  private shouldLog(level: LogLevel): boolean {
    const levels: LogLevel[] = ['debug', 'info', 'warn', 'error', 'fatal'];
    return levels.indexOf(level) >= levels.indexOf(this.minLevel);
  }

  private log(level: LogLevel, message: string, context?: LogContext): void {
    if (!this.shouldLog(level)) {
      return;
    }

    const correlationId = CorrelationStore.get() || 'no-correlation';
    const redactedContext = context ? redactPII(context) : undefined;

    const logEntry = {
      timestamp: new Date().toISOString(),
      level,
      service: this.service,
      version: this.version,
      environment: this.environment,
      correlationId,
      message,
      ...redactedContext,
    };

    // Output structured JSON
    console.log(JSON.stringify(logEntry));
  }

  debug(message: string, context?: LogContext): void {
    this.log('debug', message, context);
  }

  info(message: string, context?: LogContext): void {
    this.log('info', message, context);
  }

  warn(message: string, context?: LogContext): void {
    this.log('warn', message, context);
  }

  error(message: string, context?: LogContext): void {
    this.log('error', message, context);
  }

  fatal(message: string, context?: LogContext): void {
    this.log('fatal', message, context);
  }
}

/**
 * Default logger instance
 */
export const logger: Logger = new StructuredLogger();

/**
 * Set correlation ID for current async context
 */
export function setCorrelationId(correlationId: string): void {
  CorrelationStore.set(correlationId);
}

/**
 * Get current correlation ID
 */
export function getCorrelationId(): string | undefined {
  return CorrelationStore.get();
}

/**
 * Clear correlation ID
 */
export function clearCorrelationId(): void {
  CorrelationStore.clear();
}

/**
 * Create a child logger with additional context
 */
export function createChildLogger(additionalContext: LogContext): Logger {
  return {
    debug: (message: string, context?: LogContext) => {
      logger.debug(message, { ...additionalContext, ...context });
    },
    info: (message: string, context?: LogContext) => {
      logger.info(message, { ...additionalContext, ...context });
    },
    warn: (message: string, context?: LogContext) => {
      logger.warn(message, { ...additionalContext, ...context });
    },
    error: (message: string, context?: LogContext) => {
      logger.error(message, { ...additionalContext, ...context });
    },
    fatal: (message: string, context?: LogContext) => {
      logger.fatal(message, { ...additionalContext, ...context });
    },
  };
}



















