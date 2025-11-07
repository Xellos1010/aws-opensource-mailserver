# DNS Administration Script

The `dns-admin.sh` script provides comprehensive DNS management capabilities for Mail-in-a-Box instances deployed via AWS CloudFormation. It follows AWS Server 2025 Elevated Standards and provides backup, restore, verification, and management of DNS records.

## Features

- **Backup & Restore**: Full DNS record backup and restore functionality
- **Verification**: Verify DNS records against CloudFormation stack outputs
- **Record Management**: Create, read, update, and delete DNS records
- **Mail Record Validation**: Automatic validation of SPF, DKIM, and DMARC records
- **Dry Run Mode**: Test operations without making changes
- **Comprehensive Logging**: Detailed logging with color-coded output
- **Error Handling**: Robust error handling following workspace standards

## Prerequisites

- AWS CLI configured with appropriate profile
- `jq` command-line JSON processor
- `curl` for API calls
- Access to Mail-in-a-Box admin credentials
- Valid domain name with deployed CloudFormation stack

## Usage

### Basic Syntax

```bash
./dns-admin.sh [OPTIONS] COMMAND [ARGS]
```

### Commands

| Command | Description | Arguments |
|---------|-------------|-----------|
| `backup [FILE]` | Backup all DNS records to file | Optional: backup filename |
| `restore FILE` | Restore DNS records from file | Required: backup filename |
| `verify` | Verify DNS records against CloudFormation stack | None |
| `list` | List all custom DNS records | None |
| `get RECORD_TYPE [NAME]` | Get specific DNS records | Required: record type, optional: name |
| `set RECORD_TYPE NAME VALUE` | Set a DNS record | Required: type, name, value |
| `delete RECORD_TYPE NAME` | Delete DNS records | Required: type, name |
| `test` | Test DNS API connectivity | None |

### Options

| Option | Description | Default |
|--------|-------------|---------|
| `-d, --domain DOMAIN` | Domain name | `emcnotary.com` |
| `-p, --profile PROFILE` | AWS profile | `hepe-admin-mfa` |
| `-r, --region REGION` | AWS region | `us-east-1` |
| `-v, --verbose` | Enable verbose output | `false` |
| `-n, --dry-run` | Show what would be done without making changes | `false` |
| `-h, --help` | Show help message | N/A |

## Examples

### Backup DNS Records

```bash
# Backup with auto-generated filename
./dns-admin.sh backup

# Backup with custom filename
./dns-admin.sh backup my-dns-backup.json

# Backup for specific domain
./dns-admin.sh -d example.com backup
```

### Restore DNS Records

```bash
# Restore from backup file
./dns-admin.sh restore dns-backup-20250115-143022.json

# Restore with verbose output
./dns-admin.sh -v restore my-dns-backup.json
```

### Verify DNS Records

```bash
# Verify all DNS records against CloudFormation stack
./dns-admin.sh verify

# Verify with verbose output
./dns-admin.sh -v verify
```

### Manage DNS Records

```bash
# List all DNS records
./dns-admin.sh list

# Get all TXT records
./dns-admin.sh get TXT

# Get specific record
./dns-admin.sh get TXT example.com

# Set a TXT record
./dns-admin.sh set TXT example.com "v=spf1 include:_spf.google.com ~all"

# Set an A record
./dns-admin.sh set A subdomain.example.com "192.168.1.100"

# Set a CNAME record
./dns-admin.sh set CNAME www.example.com "example.com."

# Delete a record
./dns-admin.sh delete TXT test.example.com
```

### Test API Connectivity

```bash
# Test DNS API connectivity
./dns-admin.sh test

# Test with dry run
./dns-admin.sh -n test
```

## DNS Record Types Supported

The script supports all DNS record types supported by Mail-in-a-Box:

- **A**: IPv4 address records
- **AAAA**: IPv6 address records
- **CNAME**: Canonical name records
- **MX**: Mail exchange records
- **TXT**: Text records (SPF, DKIM, DMARC)
- **SRV**: Service records
- **SSHFP**: SSH fingerprint records
- **CAA**: Certificate Authority Authorization records
- **NS**: Name server records

## Verification Process

The `verify` command performs comprehensive DNS record validation:

### SES Records
- **DKIM Records**: Validates all three DKIM CNAME records from CloudFormation stack
- **MAIL FROM Records**: Validates MX and TXT records for custom MAIL FROM domain

### Mail Security Records
- **SPF Record**: Ensures SPF record exists for the domain
- **DMARC Record**: Ensures DMARC record exists for `_dmarc.domain.com`

### Output Examples

**Successful Verification:**
```
[SUCCESS] ✓ CNAME record for dkim1._domainkey.example.com is correct
[SUCCESS] ✓ CNAME record for dkim2._domainkey.example.com is correct
[SUCCESS] ✓ CNAME record for dkim3._domainkey.example.com is correct
[SUCCESS] ✓ MX record for mail.example.com is correct
[SUCCESS] ✓ TXT record for mail.example.com is correct
[SUCCESS] ✓ SPF record found for example.com
[SUCCESS] ✓ DMARC record found for _dmarc.example.com
[SUCCESS] All DNS records verified successfully
```

**Failed Verification:**
```
[WARNING] Missing CNAME record for dkim1._domainkey.example.com (expected: dkim1._domainkey.example.com.dkim.amazonses.com)
[WARNING] Missing SPF record for example.com
[WARNING] Missing DMARC record for _dmarc.example.com
[WARNING] Some DNS records are missing or incorrect
```

## Backup File Format

DNS backups are stored in JSON format with the following structure:

```json
[
  {
    "qname": "example.com",
    "rtype": "TXT",
    "value": "v=spf1 include:_spf.google.com ~all"
  },
  {
    "qname": "dkim1._domainkey.example.com",
    "rtype": "CNAME",
    "value": "dkim1._domainkey.example.com.dkim.amazonses.com"
  }
]
```

## Error Handling

The script includes comprehensive error handling:

- **Invalid Domain Format**: Validates domain name format before processing
- **Missing Dependencies**: Checks for required tools (AWS CLI, jq, curl)
- **API Failures**: Handles HTTP errors and provides meaningful error messages
- **File Operations**: Validates file existence and permissions
- **JSON Validation**: Ensures backup files are valid JSON

## Logging

The script provides color-coded logging:

- **INFO** (Blue): General information messages
- **SUCCESS** (Green): Successful operations
- **WARNING** (Yellow): Non-critical issues
- **ERROR** (Red): Critical errors

## Security Considerations

- Admin credentials are retrieved securely from the `get-admin-password.sh` script
- No credentials are logged or stored in plain text
- All API calls use HTTPS
- Temporary files are cleaned up automatically

## Troubleshooting

### Common Issues

1. **"Admin password script not found"**
   - Ensure `get-admin-password.sh` exists in the same directory
   - Verify the script has execute permissions

2. **"Failed to retrieve admin credentials"**
   - Check that the domain has a deployed CloudFormation stack
   - Verify AWS credentials are configured correctly

3. **"API call failed (HTTP 401)"**
   - Verify admin credentials are correct
   - Check that the Mail-in-a-Box instance is running

4. **"Invalid JSON format in backup file"**
   - Ensure the backup file is valid JSON
   - Check file permissions and encoding

### Debug Mode

Use the `-v` (verbose) flag to see detailed API calls and responses:

```bash
./dns-admin.sh -v verify
```

### Dry Run Mode

Use the `-n` (dry-run) flag to test operations without making changes:

```bash
./dns-admin.sh -n set TXT test.example.com "test value"
```

## Integration with CI/CD

The script can be integrated into CI/CD pipelines for automated DNS management:

```bash
# Backup before deployment
./dns-admin.sh -d production.com backup

# Deploy changes
# ... deployment steps ...

# Verify DNS records after deployment
./dns-admin.sh -d production.com verify
```

## Compliance

This script follows AWS Server 2025 Elevated Standards:

- Uses MFA-backed CLI sessions
- Implements proper error handling with `set -Eeuo pipefail`
- Follows secure coding practices
- Includes comprehensive logging
- Validates all inputs
- Uses temporary files safely with cleanup

## Support

For issues or questions regarding the DNS administration script, please refer to the main project documentation or create an issue in the project repository.














