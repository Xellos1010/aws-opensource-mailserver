# Admin SSL Check Library

TypeScript library for checking SSL/TLS certificate status for domains. Provides certificate validation, expiry checking, and detailed status reporting.

## Features

- **Certificate Retrieval**: Connects to domains via TLS and retrieves certificate information
- **Expiry Checking**: Calculates days until certificate expiration
- **Validation**: Checks certificate validity, hostname matching, and expiration status
- **Warning System**: Alerts when certificates expire soon (< 14 days) or hostname not in SAN
- **Error Handling**: Gracefully handles connection failures and invalid certificates
- **Formatted Output**: Provides human-readable certificate status reports

## Usage

### Nx Target

```bash
# Check certificate for a domain
pnpm nx run admin-ssl-check:check -- github.com

# Check certificate on custom port
pnpm nx run admin-ssl-check:check -- example.com 8443
```

### Programmatic Usage

```typescript
import { checkCertificate, formatCertCheckResult } from '@mm/admin-ssl-check';

// Check a certificate
const result = await checkCertificate('example.com');

// Format and display result
console.log(formatCertCheckResult(result));

// Access result properties
if (result.isValid) {
  console.log(`Certificate valid for ${result.daysUntilExpiry} more days`);
} else {
  console.error('Certificate issues:', result.errors);
}
```

### CLI Usage

```bash
# Build the library
pnpm nx build admin-ssl-check

# Run directly
node dist/libs/admin/admin-ssl-check/ssl-check.cjs example.com
node dist/libs/admin/admin-ssl-check/ssl-check.cjs example.com 8443
```

## API Reference

### `checkCertificate(hostname: string, options?: CheckOptions): Promise<CertCheckResult>`

Checks a certificate and returns detailed status information.

**Parameters:**
- `hostname` - The hostname to check (required)
- `options` - Optional configuration:
  - `port` - Port number (default: 443)
  - `timeout` - Connection timeout in milliseconds (default: 10000)
  - `servername` - SNI servername (default: hostname)

**Returns:** Promise resolving to `CertCheckResult` with:
- `isValid` - Whether certificate is currently valid
- `daysUntilExpiry` - Days until certificate expires
- `expiresSoon` - Whether certificate expires in < 14 days
- `info` - Certificate details (issuer, subject, dates, SANs)
- `warnings` - Array of warning messages
- `errors` - Array of error messages

### `getCertInfo(hostname: string, options?: CheckOptions): Promise<CertInfo>`

Retrieves raw certificate information from a TLS connection.

### `formatCertCheckResult(result: CertCheckResult): string`

Formats a certificate check result for console output.

## Examples

### Check Certificate Status

```typescript
import { checkCertificate } from '@mm/admin-ssl-check';

const result = await checkCertificate('box.askdaokapra.com');

if (result.expiresSoon) {
  console.warn(`⚠️ Certificate expires in ${result.daysUntilExpiry} days`);
}

if (!result.isValid) {
  console.error('Certificate errors:', result.errors);
}
```

### Check Multiple Domains

```typescript
import { checkCertificate } from '@mm/admin-ssl-check';

const domains = ['example.com', 'www.example.com', 'mail.example.com'];

for (const domain of domains) {
  const result = await checkCertificate(domain);
  console.log(`${domain}: ${result.isValid ? '✓' : '✗'} (${result.daysUntilExpiry} days)`);
}
```

### Custom Port and Timeout

```typescript
import { checkCertificate } from '@mm/admin-ssl-check';

const result = await checkCertificate('internal.example.com', {
  port: 8443,
  timeout: 5000,
});
```

## Integration with ops-runner

The SSL check functionality is integrated into the ops-runner:

```bash
# Check certificate via ops-runner
pnpm nx run ops-runner:run -- ssl:check github.com
pnpm nx run ops-runner:run -- ssl:check example.com 8443
```

## Testing

```bash
# Run unit tests
pnpm nx test admin-ssl-check

# Run with coverage
pnpm nx test admin-ssl-check --coverage
```

## Certificate Status Indicators

- **✔ Certificate is valid** - Certificate is valid and not expiring soon
- **⚠️ WARNINGS** - Certificate expires soon or hostname not in SAN
- **❌ ERRORS** - Certificate expired or connection failed

## Related Libraries

- `@mm/admin-ssl-provision` - SSL certificate provisioning (scaffolded for future implementation)
