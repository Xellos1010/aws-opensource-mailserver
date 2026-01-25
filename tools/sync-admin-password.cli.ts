#!/usr/bin/env ts-node

/**
 * Sync Admin Password
 * 
 * Syncs the admin@domain password from SSM Parameter Store to the Mail-in-a-Box account
 * This ensures the password matches what's returned by admin:credentials
 */

import { getAdminCredentials } from '@mm/admin-credentials';
import { resolveStackName, resolveDomain, getStackInfo } from '@mm/admin-stack-info';
import { SSMClient, SendCommandCommand, GetCommandInvocationCommand } from '@aws-sdk/client-ssm';
import { fromIni } from '@aws-sdk/credential-providers';

interface SyncAdminPasswordOptions {
  domain?: string;
  appPath?: string;
  region?: string;
  profile?: string;
  dryRun?: boolean;
}

async function syncAdminPassword(options: SyncAdminPasswordOptions): Promise<void> {
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

  console.log('🔐 Sync Admin Password');
  console.log(`   Domain: ${resolvedDomain}`);
  console.log(`   Dry Run: ${dryRun ? 'YES' : 'NO'}\n`);

  // Get admin credentials from SSM
  console.log('📋 Step 1: Getting admin password from SSM...');
  const credentials = await getAdminCredentials({
    appPath,
    domain: resolvedDomain,
    region,
    profile,
  });
  
  const adminEmail = credentials.email;
  const adminPassword = credentials.password;
  
  console.log(`✅ Password retrieved from SSM`);
  console.log(`   Email: ${adminEmail}`);
  console.log(`   Password: ${adminPassword}\n`);

  // Get instance info
  const instanceStackName = resolveStackName(resolvedDomain, appPath, undefined, 'instance');
  const stackInfo = await getStackInfo({
    stackName: instanceStackName,
    region,
    profile,
  });

  const instanceIp = stackInfo.instancePublicIp;
  if (!instanceIp) {
    throw new Error(`Could not determine instance IP from stack ${instanceStackName}`);
  }

  const instanceId = stackInfo.instanceId;
  if (!instanceId) {
    throw new Error(`Could not determine instance ID from stack ${instanceStackName}`);
  }

  console.log(`✅ Instance ID: ${instanceId}\n`);

  if (dryRun) {
    console.log(`[DRY RUN] Would sync password for ${adminEmail} to match SSM password\n`);
    return;
  }

  // Sync password via SSM RunCommand
  console.log('📋 Step 2: Syncing password via SSM RunCommand...');
  const ssmCredentials = fromIni({ profile });
  const ssmClient = new SSMClient({ region, credentials: ssmCredentials });

  const emailB64 = Buffer.from(adminEmail).toString('base64');
  const passwordB64 = Buffer.from(adminPassword).toString('base64');
  
  const syncCommand = `cd /opt/mailinabox && git config --global --add safe.directory /opt/mailinabox 2>/dev/null || true && EMAIL=\$(echo "${emailB64}" | base64 -d) && PASS=\$(echo "${passwordB64}" | base64 -d) && sudo -u user-data /opt/mailinabox/management/cli.py user password "\$EMAIL" "\$PASS" 2>&1 || sudo -u user-data /opt/mailinabox/management/users.py password "\$EMAIL" "\$PASS" 2>&1`;
  
  const syncResult = await ssmClient.send(
    new SendCommandCommand({
      InstanceIds: [instanceId],
      DocumentName: 'AWS-RunShellScript',
      Parameters: {
        commands: [syncCommand],
      },
    })
  );

  const syncCommandId = syncResult.Command?.CommandId;
  if (!syncCommandId) {
    throw new Error('Failed to send sync command via SSM');
  }

  // Wait for command to complete
  await new Promise(resolve => setTimeout(resolve, 5000));
  
  const syncInvocation = await ssmClient.send(
    new GetCommandInvocationCommand({
      CommandId: syncCommandId,
      InstanceId: instanceId,
    })
  );

  const output = syncInvocation.StandardOutputContent || '';
  const error = syncInvocation.StandardErrorContent || '';

  if (syncInvocation.Status === 'Success') {
    if (output.includes('OK') || output.includes('password') || output.trim() === '') {
      console.log(`✅ Password synced successfully\n`);
    } else {
      console.log(`⚠️  Password sync completed but output unclear: ${output.substring(0, 200)}\n`);
    }
  } else {
    console.log(`⚠️  Password sync status: ${syncInvocation.Status}`);
    console.log(`   Output: ${output.substring(0, 200)}`);
    console.log(`   Error: ${error.substring(0, 200)}\n`);
    throw new Error(`Password sync failed: ${error || output || 'Unknown error'}`);
  }

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('✅ Password Sync Complete');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  console.log(`   Email:    ${adminEmail}`);
  console.log(`   Password: ${adminPassword}`);
  console.log(`   Admin URL: ${credentials.adminUrl}\n`);
  console.log('💡 You can now log in with these credentials');
}

// CLI interface
if (require.main === module) {
  const args = process.argv.slice(2);
  
  const options: SyncAdminPasswordOptions = {};

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
Usage: sync-admin-password.cli.ts [options]

Syncs admin@domain password from SSM Parameter Store to Mail-in-a-Box account.

Options:
  --domain, -d <domain>     Domain name (default: from APP_PATH or DOMAIN env)
  --app-path <path>         App path (default: from APP_PATH env)
  --region, -r <region>     AWS region (default: us-east-1)
  --profile <profile>       AWS profile (default: hepe-admin-mfa)
  --dry-run                 Preview without syncing
  --help, -h                Show this help
`);
        process.exit(0);
        break;
    }
  }

  syncAdminPassword(options).catch((error) => {
    console.error(`Fatal error: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  });
}

export { syncAdminPassword };

