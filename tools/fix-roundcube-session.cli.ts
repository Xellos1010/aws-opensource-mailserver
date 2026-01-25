#!/usr/bin/env ts-node

/**
 * Fix Roundcube Session Storage
 *
 * Ensures PHP session directory exists and is writable by the web server.
 * Addresses "Invalid request! No data was saved." on Roundcube login.
 */

import { resolveStackName, resolveDomain, getStackInfo } from '@mm/admin-stack-info';
import { SSMClient, SendCommandCommand, GetCommandInvocationCommand } from '@aws-sdk/client-ssm';
import { fromIni } from '@aws-sdk/credential-providers';

interface FixRoundcubeSessionOptions {
  domain?: string;
  appPath?: string;
  region?: string;
  profile?: string;
  dryRun?: boolean;
}

async function fixRoundcubeSession(
  options: FixRoundcubeSessionOptions
): Promise<void> {
  const region = options.region || process.env.AWS_REGION || 'us-east-1';
  const profile = options.profile || process.env.AWS_PROFILE || 'hepe-admin-mfa';
  const domain = options.domain || process.env.DOMAIN;
  const appPath = options.appPath || process.env.APP_PATH;
  const dryRun = options.dryRun || process.env.DRY_RUN === '1';

  if (!domain && !appPath) {
    throw new Error('Cannot resolve domain. Provide domain or appPath');
  }

  const resolvedDomain = domain || (appPath ? resolveDomain(appPath) : null);
  if (!resolvedDomain) {
    throw new Error('Cannot resolve domain. Provide domain or appPath');
  }

  console.log('🔧 Fix Roundcube Session Storage');
  console.log(`   Domain: ${resolvedDomain}`);
  console.log(`   Dry Run: ${dryRun ? 'YES' : 'NO'}\n`);

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
    'SESSION_DIR=$(php -i | awk -F"=> " \'/session.save_path/{print $2}\' | awk \'{print $1}\' | tr -d \'"\' || true)',
    'if [ -z "$SESSION_DIR" ] || [ "$SESSION_DIR" = "no" ]; then SESSION_DIR="/var/lib/php/sessions"; fi',
    'echo "Session dir: $SESSION_DIR"',
    'if [ ! -d "$SESSION_DIR" ]; then sudo mkdir -p "$SESSION_DIR"; fi',
    'sudo chmod 1733 "$SESSION_DIR"',
    'sudo chown root:root "$SESSION_DIR"',
    'sudo chmod 1777 /tmp',
    'echo "Updated session dir permissions:"',
    'ls -ld "$SESSION_DIR"',
    'echo "Reloading PHP-FPM and Nginx..."',
    dryRun
      ? 'echo "[DRY RUN] Skipping service reload"'
      : 'sudo systemctl reload php8.0-fpm && sudo systemctl reload nginx',
  ].join('\n');

  if (dryRun) {
    console.log('[DRY RUN] Would update session directory permissions and reload services.');
    return;
  }

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
    throw new Error('Failed to send fix command via SSM');
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
    throw new Error(`Session fix failed: ${error || output || 'Unknown error'}`);
  }

  console.log('✅ Session fix complete:');
  console.log(output.trim() || 'No output');
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const options: FixRoundcubeSessionOptions = {};

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
      case '--dry-run':
        options.dryRun = true;
        break;
      case '--help':
      case '-h':
        console.log(`
Usage: fix-roundcube-session.cli.ts [options]

Ensures PHP session directory permissions are correct for Roundcube login.

Options:
  --domain, -d <domain>     Domain name (default: from APP_PATH or DOMAIN env)
  --app-path <path>         App path (default: from APP_PATH env)
  --region, -r <region>     AWS region (default: us-east-1)
  --profile <profile>       AWS profile (default: hepe-admin-mfa)
  --dry-run                 Preview without making changes
  --help, -h                Show this help
`);
        process.exit(0);
        break;
    }
  }

  fixRoundcubeSession(options).catch((error) => {
    console.error(`Fatal error: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  });
}

export { fixRoundcubeSession };

