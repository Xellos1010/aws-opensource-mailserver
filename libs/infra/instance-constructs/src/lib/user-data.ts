/**
 * Creates minimal UserData placeholder for SSM bootstrap
 * The actual MIAB setup will be done via SSM RunCommand after instance launch
 */
export function createBootstrapPlaceholderUserData(
  domainName: string,
  instanceDns: string,
  stackName: string,
  region: string
): string[] {
  return [
    '#!/bin/bash',
    'set -euxo pipefail',
    `echo "=========================================="`,
    `echo "Mail Server Instance Bootstrap Placeholder"`,
    `echo "Domain: ${domainName}"`,
    `echo "Instance DNS: ${instanceDns}.${domainName}"`,
    `echo "Stack: ${stackName}"`,
    `echo "Region: ${region}"`,
    `echo "=========================================="`,
    `echo ""`,
    `echo "This instance is ready for SSM-based bootstrap."`,
    `echo "Run the bootstrap command to configure Mail-in-a-Box:"`,
    `echo "  pnpm nx run ops-runner:instance:bootstrap -- --domain ${domainName}"`,
    `echo ""`,
    `echo "Preparing instance for bootstrap..."`,
    `# Install AWS CLI if not present (needed for SSM and bootstrap script)`,
    `if ! command -v aws >/dev/null 2>&1; then`,
    `  echo "Installing AWS CLI..."`,
    `  apt-get update -qq`,
    `  apt-get install -y curl unzip jq`,
    `  curl -sSL "https://awscli.amazonaws.com/awscli-exe-linux-\$(uname -m).zip" -o /tmp/awscliv2.zip`,
    `  unzip -q /tmp/awscliv2.zip -d /tmp`,
    `  /tmp/aws/install`,
    `  rm -rf /tmp/awscliv2.zip /tmp/aws`,
    `fi`,
    `# Install SSM agent (should be pre-installed on Ubuntu, but ensure it's running)`,
    `systemctl enable amazon-ssm-agent || true`,
    `systemctl start amazon-ssm-agent || true`,
    `echo "Instance ready for bootstrap at: $(date)"`,
    `echo "=========================================="`,
  ];
}
