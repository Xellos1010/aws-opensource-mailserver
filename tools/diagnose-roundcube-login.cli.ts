#!/usr/bin/env ts-node

/**
 * Diagnose Roundcube Login
 *
 * Checks Roundcube/PHP session storage and logs to identify
 * "Invalid request! No data was saved." issues.
 */

import { resolveStackName, resolveDomain, getStackInfo } from '@mm/admin-stack-info';
import { SSMClient, SendCommandCommand, GetCommandInvocationCommand } from '@aws-sdk/client-ssm';
import { fromIni } from '@aws-sdk/credential-providers';

interface DiagnoseRoundcubeLoginOptions {
  domain?: string;
  appPath?: string;
  region?: string;
  profile?: string;
}

async function diagnoseRoundcubeLogin(
  options: DiagnoseRoundcubeLoginOptions
): Promise<void> {
  const region = options.region || process.env.AWS_REGION || 'us-east-1';
  const profile = options.profile || process.env.AWS_PROFILE || 'hepe-admin-mfa';
  const domain = options.domain || process.env.DOMAIN;
  const appPath = options.appPath || process.env.APP_PATH;

  if (!domain && !appPath) {
    throw new Error('Cannot resolve domain. Provide domain or appPath');
  }

  const resolvedDomain = domain || (appPath ? resolveDomain(appPath) : null);
  if (!resolvedDomain) {
    throw new Error('Cannot resolve domain. Provide domain or appPath');
  }

  console.log('🔍 Diagnose Roundcube Login');
  console.log(`   Domain: ${resolvedDomain}\n`);

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
    'echo "=== PHP session.save_path ==="',
    'php -i | grep -i "session.save_path" | head -1',
    'echo ""',
    'echo "=== Session directory permissions ==="',
    'SESSION_DIR=$(php -i | awk -F"=> " \'/session.save_path/{print $2}\' | awk \'{print $1}\' | tr -d \'"\' || true)',
    'if [ -n "$SESSION_DIR" ]; then ls -ld "$SESSION_DIR" || true; else echo "No session dir found"; fi',
    'echo ""',
    'echo "=== Recent PHP-FPM errors ==="',
    'ls -la /var/log/php* 2>/dev/null || true',
    'tail -n 100 /var/log/php8.0-fpm.log 2>/dev/null || true',
    'echo ""',
    'echo "=== Nginx errors (last 100) ==="',
    'tail -n 100 /var/log/nginx/error.log 2>/dev/null || true',
    'echo ""',
    'echo "=== Roundcube locations ==="',
    'find /var/www /usr/share /opt /home/user-data -maxdepth 4 -type d -name "roundcube" 2>/dev/null | head -5',
    'echo ""',
    'echo "=== Roundcube config ==="',
    'find /var/www /usr/share /opt /home/user-data -name "config.inc.php" -path "*/roundcube/*" 2>/dev/null | head -3',
    'echo ""',
    'echo "=== Roundcube logs ==="',
    'find /var/www /usr/share /opt /home/user-data -path "*roundcube/logs*" -type f 2>/dev/null | head -5',
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
    throw new Error('Failed to send diagnose command via SSM');
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
    throw new Error(`Roundcube diagnose failed: ${error || output || 'Unknown error'}`);
  }

  console.log(output.trim() || 'No output');
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const options: DiagnoseRoundcubeLoginOptions = {};

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
      case '--help':
      case '-h':
        console.log(`
Usage: diagnose-roundcube-login.cli.ts [options]

Checks Roundcube/PHP session storage and logs to identify login failures.

Options:
  --domain, -d <domain>     Domain name (default: from APP_PATH or DOMAIN env)
  --app-path <path>         App path (default: from APP_PATH env)
  --region, -r <region>     AWS region (default: us-east-1)
  --profile <profile>       AWS profile (default: hepe-admin-mfa)
  --help, -h                Show this help
`);
        process.exit(0);
        break;
    }
  }

  diagnoseRoundcubeLogin(options).catch((error) => {
    console.error(`Fatal error: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  });
}

export { diagnoseRoundcubeLogin };

