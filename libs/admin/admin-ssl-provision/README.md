# Admin SSL Provision Library

TypeScript library for provisioning SSL certificates using ACME (Let's Encrypt) protocol. This library is currently scaffolded and will be fully implemented when the EMC-Notary mail server is brought up.

## Status

⚠️ **Scaffolded Implementation** - This library provides the structure and API for certificate provisioning but does not yet perform actual ACME certificate requests. Full implementation will be added when the EMC-Notary server is ready.

## Planned Features

- **Domain Detection**: Automatically detect domains without valid certificates
- **ACME Integration**: Use Let's Encrypt (or other ACME providers) to provision certificates
- **Challenge Support**: Support both HTTP-01 and DNS-01 challenge types
- **Certificate Deployment**: Deploy certificates to server (place in path, update configuration)
- **Service Restart**: Automatically restart web/mail services after certificate deployment
- **Status Tracking**: Record certificate status and expiration dates

## Usage

### Nx Target

```bash
# Provision certificates for domains
pnpm nx run admin-ssl-provision:provision -- example.com www.example.com

# Using environment variables
SSL_DOMAINS=example.com,www.example.com pnpm nx run admin-ssl-provision:provision
```

### Programmatic Usage

```typescript
import { provisionCertificate } from '@mm/admin-ssl-provision';

// Provision certificates
const result = await provisionCertificate({
  domains: ['example.com', 'www.example.com'],
  email: 'admin@example.com',
  challengeType: 'dns-01',
  certPath: '/etc/ssl/certs',
  restartServices: true,
});

console.log('Provisioned:', result.certificates);
```

### CLI Usage

```bash
# Build the library
pnpm nx build admin-ssl-provision

# Run directly
node dist/libs/admin/admin-ssl-provision/ssl-provision.cjs example.com www.example.com
```

## API Reference

### `provisionCertificate(options: ProvisionOptions): Promise<ProvisionResult>`

Provisions SSL certificates for the given domains using ACME.

**Parameters:**
- `options.domains` - Array of domains to provision certificates for (required)
- `options.email` - Email address for ACME registration (optional)
- `options.acmeServer` - ACME server URL (defaults to Let's Encrypt production)
- `options.challengeType` - Challenge type: 'http-01' or 'dns-01' (default: 'http-01')
- `options.certPath` - Path to store certificates (optional)
- `options.restartServices` - Whether to restart services after provisioning (default: false)

**Returns:** Promise resolving to `ProvisionResult` with:
- `success` - Whether provisioning was successful
- `domains` - List of domains processed
- `certificates` - Array of certificate results with status and expiration

### `checkDomainsNeedingCertificates(domains: string[]): Promise<string[]>`

Checks which domains need certificate provisioning by using the SSL check library.

### `deployCertificate(domain: string, certPath: string, targetPath: string): Promise<void>`

Deploys a certificate to the server and updates configuration.

## Integration with ops-runner

The SSL provision functionality is integrated into the ops-runner:

```bash
# Provision certificates via ops-runner
pnpm nx run ops-runner:run -- ssl:provision example.com www.example.com

# Using environment variables
SSL_DOMAINS=example.com,www.example.com pnpm nx run ops-runner:run -- ssl:provision
ACME_EMAIL=admin@example.com ACME_CHALLENGE_TYPE=dns-01 pnpm nx run ops-runner:run -- ssl:provision example.com
```

## Environment Variables

- `SSL_DOMAINS` - Comma-separated list of domains to provision (used when no args provided)
- `ACME_EMAIL` - Email address for ACME registration
- `ACME_CHALLENGE_TYPE` - Challenge type: 'http-01' or 'dns-01' (default: 'http-01')

## Implementation Plan

When implementing the full ACME functionality, consider:

1. **ACME Client Library**: Use `acme-client` npm package or shell out to `certbot`/`lego`
2. **Challenge Handling**: 
   - HTTP-01: Place challenge files in web server root
   - DNS-01: Create TXT records via DNS API
3. **Certificate Storage**: Store certificates in standard locations (e.g., `/etc/ssl/certs`)
4. **Configuration Updates**: Update nginx/apache and mail server configs
5. **Service Management**: Restart services after certificate deployment
6. **Monitoring**: Track certificate expiration and auto-renewal

## Related Libraries

- `@mm/admin-ssl-check` - SSL certificate status checking
- `@mm/admin-dns-api` - DNS API for DNS-01 challenge automation

## Testing

```bash
# Run unit tests (when implemented)
pnpm nx test admin-ssl-provision
```
