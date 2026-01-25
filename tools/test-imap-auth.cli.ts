#!/usr/bin/env ts-node

/**
 * Test IMAP Authentication
 *
 * Uses doveadm auth test via SSM to validate credentials.
 */

import { getAdminCredentials } from '@mm/admin-credentials';
import { resolveStackName, resolveDomain, getStackInfo } from '@mm/admin-stack-info';
import { SSMClient, SendCommandCommand, GetCommandInvocationCommand } from '@aws-sdk/client-ssm';
import { fromIni } from '@aws-sdk/credential-providers';

interface TestImapAuthOptions {
  domain?: string;
  appPath?: string;
  region?: string;
  profile?: string;
  email?: string;
  password?: string;
}

async function testImapAuth(options: TestImapAuthOptions): Promise<void> {
  const region = options.region || process.env.AWS_REGION || 'us-east-1';
  const profile = options.profile || process.env.AWS_PROFILE || 'hepe-admin-mfa';
  const domain = options.domain || process.env.DOMAIN;
  const appPath = options.appPath || process.env.APP_PATH;
  const email = options.email || process.env.USER_EMAIL;
  const password = options.password || process.env.USER_PASSWORD;

  if (!domain && !appPath) {
    throw new Error('Cannot resolve domain. Provide domain or appPath');
  }

  const resolvedDomain = domain || (appPath ? resolveDomain(appPath) : null);
  if (!resolvedDomain) {
    throw new Error('Cannot resolve domain. Provide domain or appPath');
  }

  let resolvedEmail = email;
  let resolvedPassword = password;

  if (!resolvedEmail || !resolvedPassword) {
    const adminCreds = await getAdminCredentials({
      appPath,
      domain: resolvedDomain,
      region,
      profile,
    });
    resolvedEmail = adminCreds.email;
    resolvedPassword = adminCreds.password;
  }

  if (!resolvedEmail || !resolvedPassword) {
    throw new Error('Missing email/password for IMAP auth test');
  }

  console.log('🔐 IMAP Auth Test');
  console.log(`   Domain: ${resolvedDomain}`);
  console.log(`   Email:  ${resolvedEmail}\n`);

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

  const ssmCredentials = fromIni({ profile });
  const ssmClient = new SSMClient({ region, credentials: ssmCredentials });

  const emailB64 = Buffer.from(resolvedEmail).toString('base64');
  const passwordB64 = Buffer.from(resolvedPassword).toString('base64');

  const command = [
    'set -e',
    'EMAIL=$(echo "' + emailB64 + '" | base64 -d)',
    'PASS=$(echo "' + passwordB64 + '" | base64 -d)',
    'sudo doveadm auth test "$EMAIL" "$PASS" 2>&1',
  ].join('\n');

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
    throw new Error('Failed to send IMAP auth test command');
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
    throw new Error(`IMAP auth test failed: ${error || output || 'Unknown error'}`);
  }

  console.log('✅ IMAP auth test output:');
  console.log(output.trim() || 'No output');
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const options: TestImapAuthOptions = {};

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
      case '--help':
      case '-h':
        console.log(`
Usage: test-imap-auth.cli.ts [options]

Validates IMAP credentials via doveadm auth test.

Options:
  --domain, -d <domain>     Domain name (default: from APP_PATH or DOMAIN env)
  --app-path <path>         App path (default: from APP_PATH env)
  --region, -r <region>     AWS region (default: us-east-1)
  --profile <profile>       AWS profile (default: hepe-admin-mfa)
  --email, -e <email>        User email (default: admin from SSM)
  --password, -p <password>  User password (default: admin from SSM)
  --help, -h                Show this help
`);
        process.exit(0);
        break;
    }
  }

  testImapAuth(options).catch((error) => {
    console.error(`Fatal error: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  });
}

export { testImapAuth };

