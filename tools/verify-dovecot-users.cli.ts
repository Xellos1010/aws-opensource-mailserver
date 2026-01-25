#!/usr/bin/env ts-node

/**
 * Verify Dovecot User Mapping
 *
 * Checks Dovecot userdb for specific mail users via SSM RunCommand.
 */

import { resolveStackName, resolveDomain, getStackInfo } from '@mm/admin-stack-info';
import { SSMClient, SendCommandCommand, GetCommandInvocationCommand } from '@aws-sdk/client-ssm';
import { fromIni } from '@aws-sdk/credential-providers';

interface VerifyDovecotUsersOptions {
  domain?: string;
  appPath?: string;
  region?: string;
  profile?: string;
  emails?: string[];
}

async function verifyDovecotUsers(options: VerifyDovecotUsersOptions): Promise<void> {
  const region = options.region || process.env.AWS_REGION || 'us-east-1';
  const profile = options.profile || process.env.AWS_PROFILE || 'hepe-admin-mfa';
  const domain = options.domain || process.env.DOMAIN;
  const appPath = options.appPath || process.env.APP_PATH;
  const emails = options.emails || process.env.EMAILS?.split(',').map(v => v.trim()).filter(Boolean);

  if (!domain && !appPath) {
    throw new Error('Cannot resolve domain. Provide domain or appPath');
  }

  const resolvedDomain = domain || (appPath ? resolveDomain(appPath) : null);
  if (!resolvedDomain) {
    throw new Error('Cannot resolve domain. Provide domain or appPath');
  }

  const resolvedEmails =
    emails && emails.length > 0
      ? emails
      : [`admin@${resolvedDomain}`, `me@box.${resolvedDomain}`];

  console.log('🔍 Verify Dovecot Users');
  console.log(`   Domain: ${resolvedDomain}`);
  console.log(`   Emails: ${resolvedEmails.join(', ')}\n`);

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

  const command = [
    'set -e',
    'echo "Checking Dovecot userdb..."',
    ...resolvedEmails.map(email => `sudo doveadm user "${email}" 2>&1 || echo "NOT_FOUND:${email}"`),
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
    throw new Error('Failed to send command via SSM');
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
    throw new Error(`Dovecot check failed: ${error || output || 'Unknown error'}`);
  }

  console.log('✅ Dovecot userdb results:');
  console.log(output.trim() || 'No output');
}

if (require.main === module) {
  const args = process.argv.slice(2);

  const options: VerifyDovecotUsersOptions = {};

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
      case '--emails':
      case '-e':
        options.emails = args[++i].split(',').map(v => v.trim());
        break;
      case '--help':
      case '-h':
        console.log(`
Usage: verify-dovecot-users.cli.ts [options]

Checks Dovecot userdb for specific mail users.

Options:
  --domain, -d <domain>      Domain name (default: from APP_PATH or DOMAIN env)
  --app-path <path>          App path (default: from APP_PATH env)
  --region, -r <region>      AWS region (default: us-east-1)
  --profile <profile>        AWS profile (default: hepe-admin-mfa)
  --emails, -e <list>         Comma-separated emails to check
  --help, -h                 Show this help
`);
        process.exit(0);
        break;
    }
  }

  verifyDovecotUsers(options).catch((error) => {
    console.error(`Fatal error: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  });
}

export { verifyDovecotUsers };

