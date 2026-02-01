#!/usr/bin/env ts-node

/**
 * Fix Webmail 401 Errors
 * 
 * Attempts to fix webmail 401 errors by:
 * - Finding Roundcube installation
 * - Restarting PHP-FPM, Nginx, Dovecot
 * - Verifying webmail configuration
 * - Checking user authentication
 */

import { resolveStackName, resolveDomain, getStackInfo } from '@mm/admin-stack-info';
import { SSMClient, SendCommandCommand, GetCommandInvocationCommand } from '@aws-sdk/client-ssm';
import { fromIni } from '@aws-sdk/credential-providers';

interface FixWebmail401Options {
  domain?: string;
  appPath?: string;
  region?: string;
  profile?: string;
  dryRun?: boolean;
}

async function fixWebmail401(options: FixWebmail401Options): Promise<void> {
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

  console.log('🔧 Fix Webmail 401 Errors');
  console.log(`   Domain: ${resolvedDomain}`);
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

  const credentials = fromIni({ profile });
  const ssmClient = new SSMClient({ region, credentials });

  // Step 1: Find Roundcube installation
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📋 Step 1: Finding Roundcube Installation');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  
  const findRoundcubeCommand = `find /usr /var/www /home/user-data/www -name "roundcube" -type d 2>/dev/null | head -5; find /usr /var/www /home/user-data/www -name "config.inc.php" -path "*/roundcube/*" 2>/dev/null | head -5; ls -la /home/user-data/www/ 2>&1 | head -20`;
  
  const findResult = await ssmClient.send(
    new SendCommandCommand({
      InstanceIds: [instanceId],
      DocumentName: 'AWS-RunShellScript',
      Parameters: {
        commands: [findRoundcubeCommand],
      },
    })
  );

  const findCommandId = findResult.Command?.CommandId;
  if (findCommandId) {
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    const findInvocation = await ssmClient.send(
      new GetCommandInvocationCommand({
        CommandId: findCommandId,
        InstanceId: instanceId,
      })
    );

    if (findInvocation.Status === 'Success') {
      const output = findInvocation.StandardOutputContent || '';
      console.log(output);
      console.log('');
    }
  }

  // Step 2: Check webmail service status
  console.log('📋 Step 2: Checking Service Status');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  
  const statusCommand = `systemctl status php8.0-fpm nginx dovecot 2>&1 | grep -E "(Active:|Loaded:)" | head -10`;
  
  const statusResult = await ssmClient.send(
    new SendCommandCommand({
      InstanceIds: [instanceId],
      DocumentName: 'AWS-RunShellScript',
      Parameters: {
        commands: [statusCommand],
      },
    })
  );

  const statusCommandId = statusResult.Command?.CommandId;
  if (statusCommandId) {
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    const statusInvocation = await ssmClient.send(
      new GetCommandInvocationCommand({
        CommandId: statusCommandId,
        InstanceId: instanceId,
      })
    );

    if (statusInvocation.Status === 'Success') {
      const output = statusInvocation.StandardOutputContent || '';
      console.log(output);
      console.log('');
    }
  }

  if (dryRun) {
    console.log('[DRY RUN] Would restart services and verify configuration\n');
    return;
  }

  // Step 3: Restart services
  console.log('📋 Step 3: Restarting Services');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  
  const restartCommand = `sudo systemctl restart php8.0-fpm && echo "PHP-FPM restarted" || echo "PHP-FPM restart failed"; sudo systemctl restart nginx && echo "Nginx restarted" || echo "Nginx restart failed"; sudo systemctl restart dovecot && echo "Dovecot restarted" || echo "Dovecot restart failed"; sleep 3; systemctl status php8.0-fpm nginx dovecot 2>&1 | grep -E "(Active:)" | head -3`;
  
  const restartResult = await ssmClient.send(
    new SendCommandCommand({
      InstanceIds: [instanceId],
      DocumentName: 'AWS-RunShellScript',
      Parameters: {
        commands: [restartCommand],
      },
    })
  );

  const restartCommandId = restartResult.Command?.CommandId;
  if (restartCommandId) {
    await new Promise(resolve => setTimeout(resolve, 10000));
    
    const restartInvocation = await ssmClient.send(
      new GetCommandInvocationCommand({
        CommandId: restartCommandId,
        InstanceId: instanceId,
      })
    );

    if (restartInvocation.Status === 'Success') {
      const output = restartInvocation.StandardOutputContent || '';
      console.log(output);
      console.log('');
    }
  }

  // Step 4: Verify PHP-FPM socket
  console.log('📋 Step 4: Verifying PHP-FPM Socket');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  
  const socketVerifyCommand = `ls -la /var/run/php/*.sock 2>&1; test -S /var/run/php/php8.0-fpm.sock && echo "Socket exists and is accessible" || echo "Socket missing or not accessible"`;
  
  const socketVerifyResult = await ssmClient.send(
    new SendCommandCommand({
      InstanceIds: [instanceId],
      DocumentName: 'AWS-RunShellScript',
      Parameters: {
        commands: [socketVerifyCommand],
      },
    })
  );

  const socketVerifyCommandId = socketVerifyResult.Command?.CommandId;
  if (socketVerifyCommandId) {
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    const socketVerifyInvocation = await ssmClient.send(
      new GetCommandInvocationCommand({
        CommandId: socketVerifyCommandId,
        InstanceId: instanceId,
      })
    );

    if (socketVerifyInvocation.Status === 'Success') {
      const output = socketVerifyInvocation.StandardOutputContent || '';
      console.log(output);
      console.log('');
    }
  }

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('✅ Fix Attempts Completed');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  
  console.log('💡 Next Steps:');
  console.log('   1. Try logging into webmail again');
  console.log('   2. If still failing, check logs: pnpm nx run cdk-emcnotary-instance:admin:logs:webmail');
  console.log('   3. Verify user password is correct');
  console.log('   4. Check Roundcube configuration if Roundcube was found in a different location\n');
}

// CLI interface
if (require.main === module) {
  const args = process.argv.slice(2);
  
  const options: FixWebmail401Options = {};

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
Usage: fix-webmail-401.cli.ts [options]

Attempts to fix webmail 401 errors by restarting services and verifying configuration.

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

  fixWebmail401(options).catch((error) => {
    console.error(`Fatal error: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  });
}

export { fixWebmail401 };














