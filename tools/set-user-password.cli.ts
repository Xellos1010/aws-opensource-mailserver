#!/usr/bin/env ts-node

/**
 * Set User Password
 *
 * Sets a Mail-in-a-Box user's password via SSM RunCommand.
 */

import { resolveStackName, resolveDomain, getStackInfo } from '@mm/admin-stack-info';
import { SSMClient, SendCommandCommand, GetCommandInvocationCommand } from '@aws-sdk/client-ssm';
import { fromIni } from '@aws-sdk/credential-providers';

interface SetUserPasswordOptions {
  domain?: string;
  appPath?: string;
  region?: string;
  profile?: string;
  email?: string;
  password?: string;
  dryRun?: boolean;
}

async function setUserPassword(options: SetUserPasswordOptions): Promise<void> {
  const region = options.region || process.env.AWS_REGION || 'us-east-1';
  const profile = options.profile || process.env.AWS_PROFILE || 'hepe-admin-mfa';
  const domain = options.domain || process.env.DOMAIN;
  const appPath = options.appPath || process.env.APP_PATH;
  const email = options.email || process.env.USER_EMAIL;
  const password = options.password || process.env.USER_PASSWORD;
  const dryRun = options.dryRun || process.env.DRY_RUN === '1';

  if (!domain && !appPath) {
    throw new Error('Cannot resolve domain. Provide domain or appPath');
  }

  if (!email || !password) {
    throw new Error('Missing user email or password. Provide --email and --password or USER_EMAIL/USER_PASSWORD env vars');
  }

  const resolvedDomain = domain || (appPath ? resolveDomain(appPath) : null);
  if (!resolvedDomain) {
    throw new Error('Cannot resolve domain. Provide domain or appPath');
  }

  console.log('🔐 Set User Password');
  console.log(`   Domain: ${resolvedDomain}`);
  console.log(`   Email:  ${email}`);
  console.log(`   Dry Run: ${dryRun ? 'YES' : 'NO'}\n`);

  // Get instance info
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

  console.log(`✅ Instance ID: ${instanceId}\n`);

  if (dryRun) {
    console.log(`[DRY RUN] Would set password for ${email}\n`);
    return;
  }

  const ssmCredentials = fromIni({ profile });
  const ssmClient = new SSMClient({ region, credentials: ssmCredentials });

  const emailB64 = Buffer.from(email).toString('base64');
  const passwordB64 = Buffer.from(password).toString('base64');

  const setCommand =
    `cd /opt/mailinabox && git config --global --add safe.directory /opt/mailinabox 2>/dev/null || true && ` +
    `EMAIL=$(echo "${emailB64}" | base64 -d) && PASS=$(echo "${passwordB64}" | base64 -d) && ` +
    `sudo -u user-data /opt/mailinabox/management/cli.py user password "$EMAIL" "$PASS" 2>&1 || ` +
    `sudo -u user-data /opt/mailinabox/management/users.py password "$EMAIL" "$PASS" 2>&1`;

  const result = await ssmClient.send(
    new SendCommandCommand({
      InstanceIds: [instanceId],
      DocumentName: 'AWS-RunShellScript',
      Parameters: {
        commands: [setCommand],
      },
    })
  );

  const commandId = result.Command?.CommandId;
  if (!commandId) {
    throw new Error('Failed to send set password command via SSM');
  }

  await new Promise(resolve => setTimeout(resolve, 5000));

  const invocation = await ssmClient.send(
    new GetCommandInvocationCommand({
      CommandId: commandId,
      InstanceId: instanceId,
    })
  );

  const output = invocation.StandardOutputContent || '';
  const error = invocation.StandardErrorContent || '';

  if (invocation.Status !== 'Success') {
    throw new Error(`Password set failed: ${error || output || 'Unknown error'}`);
  }

  console.log('✅ Password updated successfully');
  if (output.trim()) {
    console.log(`   Output: ${output.trim().substring(0, 200)}\n`);
  }
}

if (require.main === module) {
  const args = process.argv.slice(2);

  const options: SetUserPasswordOptions = {};

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
      case '--email':
      case '-e':
        options.email = args[++i];
        break;
      case '--password':
      case '-p':
        options.password = args[++i];
        break;
      case '--dry-run':
        options.dryRun = true;
        break;
      case '--help':
      case '-h':
        console.log(`
Usage: set-user-password.cli.ts [options]

Sets a Mail-in-a-Box user's password via SSM RunCommand.

Options:
  --domain, -d <domain>     Domain name (default: from APP_PATH or DOMAIN env)
  --app-path <path>         App path (default: from APP_PATH env)
  --region, -r <region>     AWS region (default: us-east-1)
  --profile <profile>       AWS profile (default: hepe-admin-mfa)
  --email, -e <email>        User email (or USER_EMAIL env var)
  --password, -p <password>  User password (or USER_PASSWORD env var)
  --dry-run                 Preview without updating
  --help, -h                Show this help
`);
        process.exit(0);
        break;
    }
  }

  setUserPassword(options).catch((error) => {
    console.error(`Fatal error: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  });
}

export { setUserPassword };

