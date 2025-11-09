# GoDaddy DNS API Client

TypeScript client library for managing DNS hostnames and nameservers via the GoDaddy API.

## Features

- **Typed API Client**: Full TypeScript support with strict types
- **DNS Hostname Management**: Set A records for ns1.box and ns2.box
- **Nameserver Management**: Configure custom nameservers for domains
- **Rate Limiting**: Automatic rate limiting (60 requests/minute)
- **Retry Logic**: Exponential backoff with jitter for transient failures
- **Error Handling**: Domain-specific error types with proper error wrapping
- **Observability**: Structured logging, distributed tracing, and metrics
- **Input Validation**: Comprehensive validation of all inputs

## Installation

This library is part of the monorepo and can be imported directly:

```typescript
import { GoDaddyClient, setDnsHostnames, setNameservers } from '@mm/admin-godaddy-dns';
```

## Quick Start

### Setting DNS Hostnames (A Records)

```typescript
import { GoDaddyClient, setDnsHostnames } from '@mm/admin-godaddy-dns';

const client = new GoDaddyClient({
  apiKey: process.env.GODADDY_API_KEY!,
  apiSecret: process.env.GODADDY_API_SECRET!,
});

const result = await setDnsHostnames(client, {
  domain: 'example.com',
  ns1Ip: '1.2.3.4',  // Elastic IP for ns1.box
  ns2Ip: '5.6.7.8',  // Elastic IP for ns2.box
  ttl: 3600,         // Optional, defaults to 3600
});

if (result.success) {
  console.log('DNS hostnames set:', result.records);
} else {
  console.error('Error:', result.error);
}
```

### Setting Nameservers

```typescript
import { GoDaddyClient, setNameservers } from '@mm/admin-godaddy-dns';

const client = new GoDaddyClient({
  apiKey: process.env.GODADDY_API_KEY!,
  apiSecret: process.env.GODADDY_API_SECRET!,
  customerId: process.env.GODADDY_CUSTOMER_ID!,
});

const result = await setNameservers(client, {
  domain: 'example.com',
  customerId: process.env.GODADDY_CUSTOMER_ID!,
  // nameservers will be auto-constructed as:
  // ns1.box.example.com and ns2.box.example.com
});

if (result.success) {
  console.log('Nameservers set:', result.nameservers);
} else {
  console.error('Error:', result.error);
}
```

## Configuration

### Environment Variables

- `GODADDY_API_KEY`: GoDaddy API key (required)
- `GODADDY_API_SECRET`: GoDaddy API secret (required)
- `GODADDY_CUSTOMER_ID`: Customer ID for v2 endpoints (required for nameservers)
- `GODADDY_BASE_URL`: API base URL (defaults to production: `https://api.godaddy.com`)
- `GODADDY_SHOPPER_ID`: Shopper ID for reseller accounts (optional)

### Client Configuration

```typescript
const client = new GoDaddyClient({
  apiKey: 'your-api-key',
  apiSecret: 'your-api-secret',
  baseUrl: 'https://api.ote-godaddy.com', // OTE environment
  customerId: 'your-customer-id',
  shopperId: 'your-shopper-id', // For reseller accounts
  timeout: 30000,                // Request timeout in ms (default: 30000)
  maxRetries: 3,                 // Max retry attempts (default: 3)
});
```

## Error Handling

The library provides domain-specific error types:

```typescript
import {
  GoDaddyApiError,
  GoDaddyAuthenticationError,
  GoDaddyRateLimitError,
  GoDaddyValidationError,
  GoDaddyNotFoundError,
  GoDaddyTransientError,
  isGoDaddyApiError,
  isRetryableError,
} from '@mm/admin-godaddy-dns';

try {
  await setDnsHostnames(client, config);
} catch (error) {
  if (error instanceof GoDaddyAuthenticationError) {
    // Handle authentication failure (non-retryable)
    console.error('Invalid credentials');
  } else if (error instanceof GoDaddyRateLimitError) {
    // Handle rate limiting (retryable)
    console.error(`Rate limited. Retry after ${error.retryAfterSec} seconds`);
  } else if (error instanceof GoDaddyValidationError) {
    // Handle validation errors (non-retryable)
    console.error('Validation failed:', error.fields);
  } else if (isRetryableError(error)) {
    // Handle retryable errors
    console.error('Transient error, will retry');
  }
}
```

## API Reference

### `GoDaddyClient`

Main API client class.

#### Constructor

```typescript
new GoDaddyClient(config: GoDaddyClientConfig)
```

#### Methods

- `request<T>(options: RequestOptions): Promise<T>` - Make HTTP request to GoDaddy API

### `setDnsHostnames`

Sets DNS A records for ns1.box and ns2.box.

```typescript
function setDnsHostnames(
  client: GoDaddyClient,
  config: SetDnsHostnamesConfig
): Promise<SetDnsHostnamesResult>
```

### `setNameservers`

Sets nameservers for a domain.

```typescript
function setNameservers(
  client: GoDaddyClient,
  config: SetNameserversConfig
): Promise<SetNameserversResult>
```

## Testing

Run unit tests:

```bash
nx test godaddy-dns
```

Run tests with coverage:

```bash
nx test godaddy-dns --coverage
```

Integration tests are guarded by `GODADDY_TEST_ENABLED` environment variable:

```bash
GODADDY_TEST_ENABLED=true nx test godaddy-dns
```

## Rate Limiting

The client automatically enforces GoDaddy's rate limit of 60 requests per minute. Requests that exceed this limit will be queued and executed when the rate limit window resets.

## Retry Logic

The client automatically retries transient failures (5xx errors, network errors) with exponential backoff and jitter:

- Initial delay: 1 second
- Maximum delay: 10 seconds
- Maximum retries: 3 (configurable)
- Jitter: ±10% random variation

Non-retryable errors (4xx except 429) are not retried.

## Observability

The library includes built-in observability:

- **Structured Logging**: JSON logs with correlation IDs and PII redaction
- **Distributed Tracing**: OpenTelemetry-compatible spans (can be enhanced with OpenTelemetry SDK)
- **Metrics**: RED metrics (Rate, Errors, Duration) for monitoring

## License

Private - Internal use only


