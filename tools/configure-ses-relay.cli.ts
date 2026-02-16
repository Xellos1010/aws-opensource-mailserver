#!/usr/bin/env ts-node

/**
 * Configure Postfix SES Relay
 *
 * Configures Postfix to relay outbound mail through AWS SES SMTP.
 */

import { resolveStackName, resolveDomain, getStackInfo } from '@mm/admin-stack-info';
import { SSMClient, SendCommandCommand, GetCommandInvocationCommand, GetParameterCommand } from '@aws-sdk/client-ssm';
import { fromIni } from '@aws-sdk/credential-providers';

interface ConfigureSesRelayOptions {
  domain?: string;
  appPath?: string;
  region?: string;
  profile?: string;
  smtpRegion?: string;
  smtpUsername?: string;
  smtpPassword?: string;
  autoFetchCredentials?: boolean;
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

  // Auto-fetch credentials from SSM if not provided or if explicitly requested
  let smtpUsername = options.smtpUsername;
  let smtpPassword = options.smtpPassword;

  if ((!smtpUsername || !smtpPassword) || options.autoFetchCredentials) {
    console.log('🔐 Fetching SMTP credentials from SSM Parameter Store...');

    // Determine core stack name - try both possible formats
    // Format 1: EmcNotaryCoreStack (CDK-generated name)
    // Format 2: Derived from instance stack name
    // Format 3: Kebab-case naming: emcnotary-com-mailserver-core
    const possibleCoreStackNames = [
      'emcnotary-com-mailserver-core', // Kebab-case format (most common)
      'EmcNotaryCoreStack', // Standard EMC Notary core stack
      instanceStackName.replace(/Instance.*Stack/, 'CoreStack'), // Derived from instance
      'K3FrameCoreStack', // K3Frame alternative
      'k3frame-com-mailserver-core', // K3Frame kebab-case
    ];

    let usernameParam: string | undefined;
    let passwordParam: string | undefined;
    let coreStackName: string | undefined;

    // Try each possible core stack name
    for (const stackName of possibleCoreStackNames) {
      const testUsernameParam = `smtp-username-${stackName}`;
      const testPasswordParam = `smtp-password-${stackName}`;

      try {
        // Try to get the username parameter to see if it exists
        await ssmClient.send(new GetParameterCommand({
          Name: testUsernameParam,
          WithDecryption: false // Don't decrypt yet, just check existence
        }));

        // If we got here, this parameter exists
        usernameParam = testUsernameParam;
        passwordParam = testPasswordParam;
        coreStackName = stackName;
        break;
      } catch {
        // This parameter doesn't exist, try next one
        continue;
      }
    }

    if (!usernameParam || !passwordParam || !coreStackName) {
      console.error('\n❌ Could not find SMTP credentials in SSM.\n');
      console.error('Tried the following parameter names:');
      possibleCoreStackNames.forEach(name => {
        console.error(`   - smtp-username-${name}`);
      });
      throw new Error('SMTP credentials not found in SSM Parameter Store');
    }

    console.log(`   Username parameter: ${usernameParam}`);
    console.log(`   Password parameter: ${passwordParam}\n`);

    try {
      const usernameResp = await ssmClient.send(new GetParameterCommand({
        Name: usernameParam,
        WithDecryption: true
      }));

      const passwordResp = await ssmClient.send(new GetParameterCommand({
        Name: passwordParam,
        WithDecryption: true
      }));

      smtpUsername = usernameResp.Parameter?.Value;
      smtpPassword = passwordResp.Parameter?.Value;

      if (!smtpUsername || !smtpPassword) {
        throw new Error('Retrieved empty credentials from SSM');
      }

      console.log('✅ SMTP credentials retrieved successfully\n');
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error(`\n❌ Failed to fetch SMTP credentials from SSM:`);
      console.error(`   ${errorMsg}\n`);
      console.error(`Parameters checked:`);
      console.error(`   - ${usernameParam}`);
      console.error(`   - ${passwordParam}\n`);
      console.error(`Make sure:`);
      console.error(`   1. Your AWS profile '${profile}' has valid credentials`);
      console.error(`   2. Your MFA session is active (if required)`);
      console.error(`   3. You have SSM:GetParameter permission`);
      console.error(`   4. The parameters exist in region ${region}\n`);
      throw error;
    }
  }

  if (!smtpUsername || !smtpPassword) {
    throw new Error('Missing SMTP credentials. Provide --smtp-username/--smtp-password or use --auto-fetch-credentials');
  }

  const smtpUserB64 = Buffer.from(smtpUsername).toString('base64');
  const smtpPassB64 = Buffer.from(smtpPassword).toString('base64');
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
      case '--auto-fetch-credentials':
        options.autoFetchCredentials = true;
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
  --smtp-username <username>    SES SMTP username (optional if using --auto-fetch-credentials)
  --smtp-password <password>    SES SMTP password (optional if using --auto-fetch-credentials)
  --auto-fetch-credentials      Automatically fetch credentials from SSM Parameter Store
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













