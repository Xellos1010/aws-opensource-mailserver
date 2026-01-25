#!/usr/bin/env ts-node

/**
 * Create admin@domain via SSM RunCommand
 * 
 * Creates admin@domain using Mail-in-a-Box CLI via SSM RunCommand
 * This ensures the user is created properly aligned with system expectations
 */

import { resolveStackName, resolveDomain, getStackInfo } from '@mm/admin-stack-info';
import { SSMClient, SendCommandCommand, GetCommandInvocationCommand } from '@aws-sdk/client-ssm';
import { fromIni } from '@aws-sdk/credential-providers';
import { getAdminCredentials } from '@mm/admin-credentials';

interface CreateAdminViaSsmOptions {
  domain?: string;
  appPath?: string;
  region?: string;
  profile?: string;
  dryRun?: boolean;
}

async function createAdminViaSsm(options: CreateAdminViaSsmOptions): Promise<void> {
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

  // Get admin password
  const adminCreds = await getAdminCredentials({
    appPath,
    domain: resolvedDomain,
    region,
    profile,
  });
  const adminEmail = `admin@${resolvedDomain}`;
  const adminPassword = adminCreds.password;

  console.log('👤 Create Admin Account via SSM');
  console.log(`   Domain: ${resolvedDomain}`);
  console.log(`   Instance ID: ${instanceId}`);
  console.log(`   Email: ${adminEmail}`);
  console.log(`   Dry Run: ${dryRun ? 'YES' : 'NO'}\n`);

  const credentials = fromIni({ profile });
  const ssmClient = new SSMClient({ region, credentials });

  // Check if user already exists
  console.log('📋 Step 1: Checking if admin@domain exists...');
  const checkCommand = `cd /opt/mailinabox && git config --global --add safe.directory /opt/mailinabox 2>/dev/null || true && sudo -u user-data /opt/mailinabox/management/cli.py user 2>&1 | grep -i "${adminEmail}" || sudo -u user-data /opt/mailinabox/management/users.py list 2>&1 | grep -i "${adminEmail}" || echo "NOT_FOUND"`;
  
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
  if (!checkCommandId) {
    throw new Error('Failed to send check command via SSM');
  }

  await new Promise(resolve => setTimeout(resolve, 3000));
  
  const checkInvocation = await ssmClient.send(
    new GetCommandInvocationCommand({
      CommandId: checkCommandId,
      InstanceId: instanceId,
    })
  );

  if (checkInvocation.Status === 'Success') {
    const output = checkInvocation.StandardOutputContent || '';
    if (!output.includes('NOT_FOUND') && output.toLowerCase().includes(adminEmail.toLowerCase())) {
      console.log(`✅ ${adminEmail} already exists\n`);
      return;
    }
  }

  // Create user via SSM
  console.log('📋 Step 2: Creating admin@domain via SSM...');
  if (dryRun) {
    console.log(`[DRY RUN] Would create ${adminEmail} via SSM RunCommand\n`);
    return;
  }

  const emailB64 = Buffer.from(adminEmail).toString('base64');
  const passwordB64 = Buffer.from(adminPassword).toString('base64');
  
  const createCommand = `cd /opt/mailinabox && git config --global --add safe.directory /opt/mailinabox 2>/dev/null || true && EMAIL=\$(echo "${emailB64}" | base64 -d) && PASS=\$(echo "${passwordB64}" | base64 -d) && sudo -u user-data /opt/mailinabox/management/cli.py user add "\$EMAIL" "\$PASS" admin 2>&1 || sudo -u user-data /opt/mailinabox/management/users.py add "\$EMAIL" "\$PASS" admin 2>&1`;
  
  const createResult = await ssmClient.send(
    new SendCommandCommand({
      InstanceIds: [instanceId],
      DocumentName: 'AWS-RunShellScript',
      Parameters: {
        commands: [createCommand],
      },
    })
  );

  const createCommandId = createResult.Command?.CommandId;
  if (!createCommandId) {
    throw new Error('Failed to send create command via SSM');
  }

  await new Promise(resolve => setTimeout(resolve, 5000));
  
  const createInvocation = await ssmClient.send(
    new GetCommandInvocationCommand({
      CommandId: createCommandId,
      InstanceId: instanceId,
    })
  );

  const output = createInvocation.StandardOutputContent || '';
  const error = createInvocation.StandardErrorContent || '';
  
  console.log(`   Output: ${output.substring(0, 500)}`);
  if (error) {
    console.log(`   Error: ${error.substring(0, 500)}`);
  }
  
  if (createInvocation.Status === 'Success') {
    if (output.includes('already exists') || output.includes('already a mail user')) {
      console.log(`✅ ${adminEmail} already exists\n`);
    } else if (output.includes('added') || output.includes('created') || output.trim() === '') {
      console.log(`✅ ${adminEmail} created successfully\n`);
    } else {
      console.log(`⚠️  Creation completed but output unclear: ${output.substring(0, 200)}\n`);
    }
  } else {
    // Check if it's actually a success but marked as failed
    if (output.includes('already exists') || output.includes('already a mail user')) {
      console.log(`✅ ${adminEmail} already exists (command reported failure but user exists)\n`);
    } else {
      console.error(`❌ Failed to create ${adminEmail}`);
      console.error(`   Status: ${createInvocation.Status}`);
      console.error(`   Output: ${output.substring(0, 500)}`);
      console.error(`   Error: ${error.substring(0, 500)}\n`);
      throw new Error(`User creation failed: ${error || output || 'Unknown error'}`);
    }
  }

  console.log('✅ Admin account creation completed!');
}

// CLI interface
if (require.main === module) {
  const args = process.argv.slice(2);
  
  const options: CreateAdminViaSsmOptions = {};

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
Usage: create-admin-via-ssm.cli.ts [options]

Creates admin@domain via SSM RunCommand.

Options:
  --domain, -d <domain>     Domain name (default: from APP_PATH or DOMAIN env)
  --app-path <path>         App path (default: from APP_PATH env)
  --region, -r <region>     AWS region (default: us-east-1)
  --profile <profile>       AWS profile (default: hepe-admin-mfa)
  --dry-run                 Preview without creating
  --help, -h                Show this help
`);
        process.exit(0);
        break;
    }
  }

  createAdminViaSsm(options).catch((error) => {
    console.error(`Fatal error: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  });
}

export { createAdminViaSsm };

