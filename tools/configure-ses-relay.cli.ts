#!/usr/bin/env ts-node

/**
 * Configure Postfix SES Relay
 *
 * Configures Postfix to relay outbound mail through AWS SES SMTP.
 */

import { resolveStackName, resolveDomain, getStackInfo } from '@mm/admin-stack-info';
import { SSMClient, SendCommandCommand, GetCommandInvocationCommand } from '@aws-sdk/client-ssm';
import { fromIni } from '@aws-sdk/credential-providers';

interface ConfigureSesRelayOptions {
  domain?: string;
  appPath?: string;
  region?: string;
  profile?: string;
  smtpRegion?: string;
  smtpUsername: string;
  smtpPassword: string;
}

async function configureSesRelay(options: ConfigureSesRelayOptions): Promise<void> {
  const region = options.region || process.env.AWS_REGION || 'us-east-1';
  const profile = options.profile || process.env.AWS_PROFILE || 'hepe-admin-mfa';
  const domain = options.domain || process.env.DOMAIN;
  const appPath = options.appPath || process.env.APP_PATH;
  const smtpRegion = options.smtpRegion || process.env.SMTP_REGION || region;

  if (!domain && !appPath) {
    throw new Error('Cannot resolve domain. Provide domain or appPath');
  }

  const resolvedDomain = domain || (appPath ? resolveDomain(appPath) : null);
  if (!resolvedDomain) {
    throw new Error('Cannot resolve domain. Provide domain or appPath');
  }

  if (!options.smtpUsername || !options.smtpPassword) {
    throw new Error('Missing SMTP credentials (smtpUsername/smtpPassword)');
  }

  console.log('✉️  Configure SES SMTP Relay');
  console.log(`   Domain: ${resolvedDomain}`);
  console.log(`   SMTP Region: ${smtpRegion}\n`);

  const instanceStackName = resolveStackName(resolvedDomain, appPath, undefined, 'instance');
  const stackInfo = await getStackInfo({
    stackName: instanceStackName,
    region,
    profile,
  });

  const instanceId = stackInfo.instanceId;
  if (!instanceId) {
    throw new Error(`Could not determine instance ID from stack ${instanceStackName}`);
  }

  const credentials = fromIni({ profile });
  const ssmClient = new SSMClient({ region, credentials });

  const smtpUserB64 = Buffer.from(options.smtpUsername).toString('base64');
  const smtpPassB64 = Buffer.from(options.smtpPassword).toString('base64');
  const smtpHost = `email-smtp.${smtpRegion}.amazonaws.com`;

  const command = `
set -e
SMTP_USER="$(echo "${smtpUserB64}" | base64 -d)"
SMTP_PASS="$(echo "${smtpPassB64}" | base64 -d)"
SMTP_HOST="${smtpHost}"

echo "=== Writing sasl_passwd ==="
sudo bash -c "cat > /etc/postfix/sasl_passwd <<EOF
[$SMTP_HOST]:587 $SMTP_USER:$SMTP_PASS
EOF"
sudo chmod 600 /etc/postfix/sasl_passwd
sudo postmap /etc/postfix/sasl_passwd

echo ""
echo "=== Updating postfix main.cf ==="
sudo postconf -e "relayhost=[$SMTP_HOST]:587"
sudo postconf -e "smtp_sasl_auth_enable=yes"
sudo postconf -e "smtp_sasl_password_maps=hash:/etc/postfix/sasl_passwd"
sudo postconf -e "smtp_sasl_security_options=noanonymous"
sudo postconf -e "smtp_use_tls=yes"
sudo postconf -e "smtp_tls_security_level=encrypt"
sudo postconf -e "smtp_tls_CAfile=/etc/ssl/certs/ca-certificates.crt"

echo ""
echo "=== Reloading postfix ==="
sudo systemctl reload postfix
sudo systemctl status postfix --no-pager -l | head -20 || true

echo ""
echo "=== Postfix relay summary ==="
postconf -n | egrep -i "relayhost|smtp_sasl|smtp_tls" || true
`;

  const result = await ssmClient.send(
    new SendCommandCommand({
      InstanceIds: [instanceId],
      DocumentName: 'AWS-RunShellScript',
      Parameters: {
        commands: [command],
      },
    })
  );

  const commandId = result.Command?.CommandId;
  if (!commandId) {
    throw new Error('Failed to send command');
  }

  await new Promise(resolve => setTimeout(resolve, 5000));

  const invocation = await ssmClient.send(
    new GetCommandInvocationCommand({
      CommandId: commandId,
      InstanceId: instanceId,
    })
  );

  if (invocation.Status !== 'Success') {
    throw new Error(invocation.StandardErrorContent || invocation.StandardOutputContent || 'Command failed');
  }

  const output = invocation.StandardOutputContent || '';
  console.log(output.trim() || 'No output');
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const options: Partial<ConfigureSesRelayOptions> = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    switch (arg) {
      case '--domain':
      case '-d':
        options.domain = args[++i];
        break;
      case '--app-path':
        options.appPath = args[++i];
        break;
      case '--region':
      case '-r':
        options.region = args[++i];
        break;
      case '--profile':
        options.profile = args[++i];
        break;
      case '--smtp-region':
        options.smtpRegion = args[++i];
        break;
      case '--smtp-username':
        options.smtpUsername = args[++i];
        break;
      case '--smtp-password':
        options.smtpPassword = args[++i];
        break;
      case '--help':
      case '-h':
        console.log(`
Usage: configure-ses-relay.cli.ts [options]

Configures Postfix to relay outbound mail through AWS SES SMTP.

Options:
  --domain, -d <domain>         Domain name (default: from APP_PATH or DOMAIN env)
  --app-path <path>             App path (default: from APP_PATH env)
  --region, -r <region>         AWS region (default: us-east-1)
  --profile <profile>           AWS profile (default: hepe-admin-mfa)
  --smtp-region <region>        SES SMTP region (default: AWS region)
  --smtp-username <username>    SES SMTP username
  --smtp-password <password>    SES SMTP password
  --help, -h                    Show this help
`);
        process.exit(0);
        break;
    }
  }

  configureSesRelay(options as ConfigureSesRelayOptions).catch((error) => {
    console.error(`Fatal error: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  });
}

export { configureSesRelay };





