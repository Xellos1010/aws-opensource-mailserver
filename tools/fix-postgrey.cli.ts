#!/usr/bin/env ts-node

/**
 * Fix Postgrey Listener
 *
 * Repairs postgrey lock/permissions and restarts the service.
 */

import { resolveStackName, resolveDomain, getStackInfo } from '@mm/admin-stack-info';
import { SSMClient, SendCommandCommand, GetCommandInvocationCommand } from '@aws-sdk/client-ssm';
import { fromIni } from '@aws-sdk/credential-providers';

interface FixPostgreyOptions {
  domain?: string;
  appPath?: string;
  region?: string;
  profile?: string;
}

async function fixPostgrey(options: FixPostgreyOptions): Promise<void> {
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

  console.log('🛠️  Fix Postgrey');
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

  const credentials = fromIni({ profile });
  const ssmClient = new SSMClient({ region, credentials });

  const command = `
set -e
echo "=== Fixing postgrey db permissions ==="
sudo mkdir -p /home/user-data/mail/postgrey/db
sudo rm -f /home/user-data/mail/postgrey/db/postgrey.lock
sudo chown -R postgrey:postgrey /home/user-data/mail/postgrey
sudo chmod -R 750 /home/user-data/mail/postgrey
echo ""
echo "=== Restarting postgrey ==="
sudo systemctl restart postgrey
sudo systemctl status postgrey --no-pager -l | head -40 || true
echo ""
echo "=== Listener check ==="
ss -lntp | egrep "10023" || echo "No listener on 10023"
echo ""
echo "=== Recent postgrey logs ==="
journalctl -u postgrey -n 40 --no-pager || true
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
  const options: FixPostgreyOptions = {};

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
Usage: fix-postgrey.cli.ts [options]

Repairs postgrey lock/permissions and restarts the service.

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

  fixPostgrey(options).catch((error) => {
    console.error(`Fatal error: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  });
}

export { fixPostgrey };










