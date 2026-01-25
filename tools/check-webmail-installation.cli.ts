#!/usr/bin/env ts-node

/**
 * Check Webmail Installation
 * 
 * Checks if Roundcube/webmail is properly installed and configured
 */

import { resolveStackName, resolveDomain, getStackInfo } from '@mm/admin-stack-info';
import { SSMClient, SendCommandCommand, GetCommandInvocationCommand } from '@aws-sdk/client-ssm';
import { fromIni } from '@aws-sdk/credential-providers';

interface CheckWebmailInstallationOptions {
  domain?: string;
  appPath?: string;
  region?: string;
  profile?: string;
}

async function checkWebmailInstallation(options: CheckWebmailInstallationOptions): Promise<void> {
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

  console.log('🔍 Check Webmail Installation');
  console.log(`   Domain: ${resolvedDomain}\n`);

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

  const credentials = fromIni({ profile });
  const ssmClient = new SSMClient({ region, credentials });

  // Check for Roundcube in various locations
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📋 Checking Roundcube Installation');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  
  const checkCommand = `
# Check common Roundcube locations
echo "=== Checking /home/user-data/www ==="
ls -la /home/user-data/www/ 2>&1 | head -20
echo ""
echo "=== Checking /usr/share/roundcube ==="
ls -la /usr/share/roundcube/ 2>&1 | head -10 || echo "Not found"
echo ""
echo "=== Checking /var/www/roundcube ==="
ls -la /var/www/roundcube/ 2>&1 | head -10 || echo "Not found"
echo ""
echo "=== Finding Roundcube config files ==="
find /home/user-data /usr /var/www -name "config.inc.php" -path "*/roundcube/*" 2>/dev/null | head -5
echo ""
echo "=== Checking Nginx webmail config ==="
grep -r "roundcube\|/mail" /etc/nginx/sites-enabled/ 2>&1 | head -10
echo ""
echo "=== Checking if webmail service exists ==="
systemctl list-units --type=service | grep -i "mail\|roundcube" || echo "No webmail services found"
`;

  const checkResult = await ssmClient.send(
    new SendCommandCommand({
      InstanceIds: [instanceId],
      DocumentName: 'AWS-RunShellScript',
      Parameters: {
        commands: [checkCommand],
      },
    })
  );

  const checkCommandId = checkResult.Command?.CommandId;
  if (checkCommandId) {
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    const checkInvocation = await ssmClient.send(
      new GetCommandInvocationCommand({
        CommandId: checkCommandId,
        InstanceId: instanceId,
      })
    );

    if (checkInvocation.Status === 'Success') {
      const output = checkInvocation.StandardOutputContent || '';
      console.log(output);
      
      if (output.includes('roundcube') || output.includes('config.inc.php')) {
        console.log('\n✅ Roundcube installation found\n');
      } else {
        console.log('\n❌ Roundcube installation NOT found - webmail may not be installed\n');
      }
    }
  }

  // Check Mail-in-a-Box webmail status
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📋 Checking Mail-in-a-Box Webmail Status');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  
  const miabStatusCommand = `cd /opt/mailinabox && git config --global --add safe.directory /opt/mailinabox 2>/dev/null || true && sudo -u user-data /opt/mailinabox/management/status.py 2>&1 | grep -i "webmail\|roundcube" || echo "No webmail status found"`;
  
  const miabStatusResult = await ssmClient.send(
    new SendCommandCommand({
      InstanceIds: [instanceId],
      DocumentName: 'AWS-RunShellScript',
      Parameters: {
        commands: [miabStatusCommand],
      },
    })
  );

  const miabStatusCommandId = miabStatusResult.Command?.CommandId;
  if (miabStatusCommandId) {
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    const miabStatusInvocation = await ssmClient.send(
      new GetCommandInvocationCommand({
        CommandId: miabStatusCommandId,
        InstanceId: instanceId,
      })
    );

    if (miabStatusInvocation.Status === 'Success') {
      const output = miabStatusInvocation.StandardOutputContent || '';
      console.log(output);
      console.log('');
    }
  }

  console.log('💡 If Roundcube is not installed, you may need to:');
  console.log('   1. Run Mail-in-a-Box setup again');
  console.log('   2. Or manually install Roundcube');
  console.log('   3. Or check if webmail is accessible at a different URL\n');
}

// CLI interface
if (require.main === module) {
  const args = process.argv.slice(2);
  
  const options: CheckWebmailInstallationOptions = {};

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
Usage: check-webmail-installation.cli.ts [options]

Checks if Roundcube/webmail is properly installed.

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

  checkWebmailInstallation(options).catch((error) => {
    console.error(`Fatal error: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  });
}

export { checkWebmailInstallation };





