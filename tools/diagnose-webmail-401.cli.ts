#!/usr/bin/env ts-node

/**
 * Diagnose Webmail 401 Errors
 * 
 * Diagnoses webmail 401 authentication errors by checking:
 * - PHP-FPM service status
 * - Roundcube configuration
 * - User account status
 * - Nginx configuration
 * - Authentication mechanisms
 */

import { resolveStackName, resolveDomain, getStackInfo } from '@mm/admin-stack-info';
import { SSMClient, SendCommandCommand, GetCommandInvocationCommand } from '@aws-sdk/client-ssm';
import { fromIni } from '@aws-sdk/credential-providers';

interface DiagnoseWebmail401Options {
  domain?: string;
  appPath?: string;
  region?: string;
  profile?: string;
  email?: string;
}

async function diagnoseWebmail401(options: DiagnoseWebmail401Options): Promise<void> {
  const region = options.region || process.env.AWS_REGION || 'us-east-1';
  const profile = options.profile || process.env.AWS_PROFILE || 'hepe-admin-mfa';
  const domain = options.domain || process.env.DOMAIN;
  const appPath = options.appPath || process.env.APP_PATH;
  const testEmail = options.email || process.env.TEST_EMAIL || 'test@emcnotary.com';

  if (!domain && !appPath) {
    throw new Error('Cannot resolve domain. Provide domain or appPath');
  }

  const resolvedDomain = domain || (appPath ? resolveDomain(appPath) : null);
  if (!resolvedDomain) {
    throw new Error('Cannot resolve domain. Provide domain or appPath');
  }

  console.log('🔍 Diagnose Webmail 401 Errors');
  console.log(`   Domain: ${resolvedDomain}`);
  console.log(`   Test Email: ${testEmail}\n`);

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

  // Step 1: Check PHP-FPM status
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📋 Step 1: Checking PHP-FPM Service Status');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  
  const phpFpmStatusCommand = `systemctl status php*-fpm 2>&1 | head -20 || echo "PHP-FPM service check failed"`;
  
  const phpFpmResult = await ssmClient.send(
    new SendCommandCommand({
      InstanceIds: [instanceId],
      DocumentName: 'AWS-RunShellScript',
      Parameters: {
        commands: [phpFpmStatusCommand],
      },
    })
  );

  const phpFpmCommandId = phpFpmResult.Command?.CommandId;
  if (phpFpmCommandId) {
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    const phpFpmInvocation = await ssmClient.send(
      new GetCommandInvocationCommand({
        CommandId: phpFpmCommandId,
        InstanceId: instanceId,
      })
    );

    if (phpFpmInvocation.Status === 'Success') {
      const output = phpFpmInvocation.StandardOutputContent || '';
      console.log(output);
      
      if (output.includes('active (running)')) {
        console.log('✅ PHP-FPM is running\n');
      } else if (output.includes('inactive') || output.includes('failed')) {
        console.log('❌ PHP-FPM is NOT running - THIS IS LIKELY THE CAUSE OF 401 ERRORS\n');
      }
    }
  }

  // Step 2: Check PHP-FPM socket
  console.log('📋 Step 2: Checking PHP-FPM Socket');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  
  const socketCheckCommand = `ls -la /var/run/php/*.sock 2>&1 || echo "No PHP-FPM sockets found"; systemctl list-units --type=service --state=running | grep php || echo "No PHP services running"`;
  
  const socketResult = await ssmClient.send(
    new SendCommandCommand({
      InstanceIds: [instanceId],
      DocumentName: 'AWS-RunShellScript',
      Parameters: {
        commands: [socketCheckCommand],
      },
    })
  );

  const socketCommandId = socketResult.Command?.CommandId;
  if (socketCommandId) {
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    const socketInvocation = await ssmClient.send(
      new GetCommandInvocationCommand({
        CommandId: socketCommandId,
        InstanceId: instanceId,
      })
    );

    if (socketInvocation.Status === 'Success') {
      const output = socketInvocation.StandardOutputContent || '';
      console.log(output);
      
      if (output.includes('.sock')) {
        console.log('✅ PHP-FPM socket exists\n');
      } else {
        console.log('❌ PHP-FPM socket NOT found - THIS IS THE CAUSE OF 401 ERRORS\n');
      }
    }
  }

  // Step 3: Check Roundcube configuration
  console.log('📋 Step 3: Checking Roundcube Configuration');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  
  const roundcubeConfigCommand = `test -f /var/www/roundcube/config/config.inc.php && echo "EXISTS" || echo "NOT_FOUND"; test -d /var/www/roundcube && echo "DIRECTORY_EXISTS" || echo "DIRECTORY_NOT_FOUND"; ls -la /var/www/roundcube/logs/ 2>&1 | head -10 || echo "No logs directory"`;
  
  const roundcubeResult = await ssmClient.send(
    new SendCommandCommand({
      InstanceIds: [instanceId],
      DocumentName: 'AWS-RunShellScript',
      Parameters: {
        commands: [roundcubeConfigCommand],
      },
    })
  );

  const roundcubeCommandId = roundcubeResult.Command?.CommandId;
  if (roundcubeCommandId) {
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    const roundcubeInvocation = await ssmClient.send(
      new GetCommandInvocationCommand({
        CommandId: roundcubeCommandId,
        InstanceId: instanceId,
      })
    );

    if (roundcubeInvocation.Status === 'Success') {
      const output = roundcubeInvocation.StandardOutputContent || '';
      console.log(output);
      console.log('');
    }
  }

  // Step 4: Check user account
  console.log('📋 Step 4: Checking User Account');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  
  const userCheckCommand = `cd /opt/mailinabox && git config --global --add safe.directory /opt/mailinabox 2>/dev/null || true && sudo -u user-data /opt/mailinabox/management/cli.py user 2>&1 | grep -i "${testEmail}" || echo "User not found"`;
  
  const userResult = await ssmClient.send(
    new SendCommandCommand({
      InstanceIds: [instanceId],
      DocumentName: 'AWS-RunShellScript',
      Parameters: {
        commands: [userCheckCommand],
      },
    })
  );

  const userCommandId = userResult.Command?.CommandId;
  if (userCommandId) {
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    const userInvocation = await ssmClient.send(
      new GetCommandInvocationCommand({
        CommandId: userCommandId,
        InstanceId: instanceId,
      })
    );

    if (userInvocation.Status === 'Success') {
      const output = userInvocation.StandardOutputContent || '';
      if (output.includes(testEmail) && !output.includes('not found')) {
        console.log(`✅ User ${testEmail} exists\n`);
      } else {
        console.log(`❌ User ${testEmail} NOT found\n`);
      }
    }
  }

  // Step 5: Check Dovecot authentication
  console.log('📋 Step 5: Checking Dovecot Authentication');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  
  const dovecotCheckCommand = `systemctl status dovecot 2>&1 | head -10; test -f /etc/dovecot/dovecot.conf && echo "Dovecot config exists" || echo "Dovecot config not found"`;
  
  const dovecotResult = await ssmClient.send(
    new SendCommandCommand({
      InstanceIds: [instanceId],
      DocumentName: 'AWS-RunShellScript',
      Parameters: {
        commands: [dovecotCheckCommand],
      },
    })
  );

  const dovecotCommandId = dovecotResult.Command?.CommandId;
  if (dovecotCommandId) {
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    const dovecotInvocation = await ssmClient.send(
      new GetCommandInvocationCommand({
        CommandId: dovecotCommandId,
        InstanceId: instanceId,
      })
    );

    if (dovecotInvocation.Status === 'Success') {
      const output = dovecotInvocation.StandardOutputContent || '';
      console.log(output);
      console.log('');
    }
  }

  // Step 6: Check Nginx configuration for /mail
  console.log('📋 Step 6: Checking Nginx Configuration for /mail');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  
  const nginxCheckCommand = `grep -r "location /mail" /etc/nginx/sites-enabled/ 2>&1 | head -20 || echo "No /mail location found"; nginx -t 2>&1 || echo "Nginx config test failed"`;
  
  const nginxResult = await ssmClient.send(
    new SendCommandCommand({
      InstanceIds: [instanceId],
      DocumentName: 'AWS-RunShellScript',
      Parameters: {
        commands: [nginxCheckCommand],
      },
    })
  );

  const nginxCommandId = nginxResult.Command?.CommandId;
  if (nginxCommandId) {
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    const nginxInvocation = await ssmClient.send(
      new GetCommandInvocationCommand({
        CommandId: nginxCommandId,
        InstanceId: instanceId,
      })
    );

    if (nginxInvocation.Status === 'Success') {
      const output = nginxInvocation.StandardOutputContent || '';
      console.log(output);
      console.log('');
    }
  }

  // Summary and recommendations
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📊 Diagnosis Summary');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  
  console.log('💡 Common Causes of Webmail 401 Errors:');
  console.log('   1. PHP-FPM not running (most common)');
  console.log('   2. PHP-FPM socket missing or wrong path');
  console.log('   3. Roundcube not properly configured');
  console.log('   4. User account exists but password incorrect');
  console.log('   5. Dovecot authentication backend not working');
  console.log('   6. Nginx configuration issues\n');
  
  console.log('🔧 Recommended Fixes:');
  console.log('   1. Restart PHP-FPM: sudo systemctl restart php*-fpm');
  console.log('   2. Restart Nginx: sudo systemctl restart nginx');
  console.log('   3. Restart Dovecot: sudo systemctl restart dovecot');
  console.log('   4. Verify user password: pnpm nx run cdk-emcnotary-instance:admin:credentials:sync');
  console.log('   5. Check logs: pnpm nx run cdk-emcnotary-instance:admin:logs:webmail\n');
}

// CLI interface
if (require.main === module) {
  const args = process.argv.slice(2);
  
  const options: DiagnoseWebmail401Options = {};

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
      case '--help':
      case '-h':
        console.log(`
Usage: diagnose-webmail-401.cli.ts [options]

Diagnoses webmail 401 authentication errors.

Options:
  --domain, -d <domain>     Domain name (default: from APP_PATH or DOMAIN env)
  --app-path <path>         App path (default: from APP_PATH env)
  --region, -r <region>     AWS region (default: us-east-1)
  --profile <profile>       AWS profile (default: hepe-admin-mfa)
  --email, -e <email>        Test email address (default: test@emcnotary.com)
  --help, -h                Show this help
`);
        process.exit(0);
        break;
    }
  }

  diagnoseWebmail401(options).catch((error) => {
    console.error(`Fatal error: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  });
}

export { diagnoseWebmail401 };












