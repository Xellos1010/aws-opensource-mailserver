# MFA Authentication

TypeScript port of `mfa-user.sh` for cross-platform MFA authentication.

## Usage

### Manual (Local Development)

```bash
# Enable feature flag
export FEATURE_NX_SCRIPTS_ENABLED=1

# Run MFA authentication
pnpm nx run authentication:mfa

# Or use the alias
pnpm nx run authentication:mfa
```

### Environment Variables

| Variable | Description | Required | Default |
|----------|-------------|----------|---------|
| `MFA_DEVICE_ARN` | AWS MFA device ARN | No | `arn:aws:iam::413988044972:mfa/Evans-Phone` |
| `SOURCE_PROFILE` | AWS CLI profile with long-term credentials | No | `hepe-admin` |
| `TARGET_PROFILE` | AWS CLI profile for temporary credentials | No | `hepe-admin-mfa` |
| `DURATION_SECONDS` | Session duration in seconds | No | `43200` (12 hours) |
| `DRY_RUN` | Skip writing credentials file | No | `0` |
| `FEATURE_NX_SCRIPTS_ENABLED` | Enable Nx script execution | No | `0` (disabled) |
| `AWS_REGION` | AWS region for STS calls | No | `us-east-1` |

## CI/CD

**Note**: This script is interactive and requires manual MFA code entry. It is **NOT executed in CI/CD pipelines**.

For GitHub Actions and other CI/CD systems, use **AWS OIDC role assumption** instead:

```yaml
- name: Configure AWS (OIDC)
  uses: aws-actions/configure-aws-credentials@v4
  with:
    role-to-assume: ${{ secrets.AWS_ROLE_TO_ASSUME }}
    aws-region: ${{ secrets.AWS_REGION }}
```

See `.github/workflows/` for examples of OIDC-based AWS authentication in CI.

## Testing

This script is tested manually by developers on their local machines. No automated E2E tests are provided as MFA requires interactive input.

## Related

- Original bash script: `archive/mfa-user.sh`
- AWS STS Documentation: https://docs.aws.amazon.com/STS/latest/APIReference/API_GetSessionToken.html
