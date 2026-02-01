#!/usr/bin/env ts-node

/**
 * Reset Users via SSM RunCommand
 * 
 * Uses AWS SSM RunCommand to execute user removal commands on the instance
 * This bypasses SSH connection issues and works even when SSH is rate-limited
 */

import { CloudFormationClient, DescribeStacksCommand } from '@aws-sdk/client-cloudformation';
import { SSMClient, SendCommandCommand, GetCommandInvocationCommand } from '@aws-sdk/client-ssm';
import { fromIni } from '@aws-sdk/credential-providers';
import { resolveStackName, resolveDomain, getStackInfo } from '@mm/admin-stack-info';

interface ResetUsersViaSsmOptions {
  domain?: string;
  appPath?: string;
  region?: string;
  profile?: string;
  dryRun?: boolean;
}

async function resetUsersViaSsm(options: ResetUsersViaSsmOptions): Promise<void> {
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

  console.log('🔄 Reset Users via SSM RunCommand');
  console.log(`   Domain: ${resolvedDomain}`);
  console.log(`   Instance ID: ${instanceId}`);
  console.log(`   Dry Run: ${dryRun ? 'YES' : 'NO'}\n`);

  const credentials = fromIni({ profile });
  const ssmClient = new SSMClient({ region, credentials });

  // Step 1: List users via SSM
  console.log('📋 Step 1: Listing users via SSM...');
  const listCommand = `cd /opt/mailinabox && git config --global --add safe.directory /opt/mailinabox 2>/dev/null || true && sudo -u user-data /opt/mailinabox/management/cli.py user 2>&1 || sudo -u user-data /opt/mailinabox/management/users.py list 2>&1`;
  
  const listResult = await ssmClient.send(
    new SendCommandCommand({
      InstanceIds: [instanceId],
      DocumentName: 'AWS-RunShellScript',
      Parameters: {
        commands: [listCommand],
      },
    })
  );

  const listCommandId = listResult.Command?.CommandId;
  if (!listCommandId) {
    throw new Error('Failed to send list command via SSM');
  }

  // Wait for command to complete
  await new Promise(resolve => setTimeout(resolve, 3000));
  
  const listInvocation = await ssmClient.send(
    new GetCommandInvocationCommand({
      CommandId: listCommandId,
      InstanceId: instanceId,
    })
  );

  if (listInvocation.Status !== 'Success') {
    throw new Error(`List command failed: ${listInvocation.StandardErrorContent || listInvocation.StandardOutputContent}`);
  }

  const output = listInvocation.StandardOutputContent || '';
  const lines = output.split('\n').filter(line => line.trim() && !line.includes('ERROR'));
  
  // Parse users
  const users = lines.map(line => {
    const match = line.match(/^\s*([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+(?:\.[a-zA-Z0-9._-]+)*)\*?\s*(?:\[(.*)\])?/);
    if (match) {
      return {
        email: match[1],
        privileges: match[2] ? match[2].split(',').map(p => p.trim()) : [],
      };
    }
    return null;
  }).filter((u): u is NonNullable<typeof u> => u !== null);

  console.log(`✅ Listed ${users.length} user(s)\n`);

  // Step 2: Filter users to remove
  const adminEmail = `admin@${resolvedDomain}`;
  const defaultAdminEmail = `me@box.${resolvedDomain}`;
  
  const usersToRemove = users.filter(user => {
    return user.email !== adminEmail && user.email !== defaultAdminEmail;
  });

  if (usersToRemove.length === 0) {
    console.log('✅ No users to remove (only admin accounts remain)\n');
    return;
  }

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📊 Users to Remove');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  for (const user of usersToRemove) {
    const adminBadge = user.privileges?.includes('admin') ? ' [ADMIN]' : '';
    console.log(`   ${user.email}${adminBadge}`);
  }
  console.log(`\n   Total: ${usersToRemove.length} user(s) to remove\n`);

  if (dryRun) {
    console.log('⚠️  DRY RUN MODE - No users will be removed\n');
    return;
  }

  // Step 3: Remove users via SSM (one command per user)
  console.log('📋 Step 2: Removing users via SSM...\n');
  let successCount = 0;
  let errorCount = 0;
  const errors: Array<{ email: string; error: string }> = [];

  for (const user of usersToRemove) {
    console.log(`📋 Removing ${user.email}...`);
    
    const emailB64 = Buffer.from(user.email).toString('base64');
    const removeCommand = `cd /opt/mailinabox && git config --global --add safe.directory /opt/mailinabox 2>/dev/null || true && EMAIL=\$(echo "${emailB64}" | base64 -d) && sudo -u user-data /opt/mailinabox/management/cli.py user remove "\$EMAIL" 2>&1 || sudo -u user-data /opt/mailinabox/management/users.py remove "\$EMAIL" 2>&1`;
    
    try {
      const removeResult = await ssmClient.send(
        new SendCommandCommand({
          InstanceIds: [instanceId],
          DocumentName: 'AWS-RunShellScript',
          Parameters: {
            commands: [removeCommand],
          },
        })
      );

      const removeCommandId = removeResult.Command?.CommandId;
      if (!removeCommandId) {
        throw new Error('Failed to send remove command');
      }

      // Wait for command to complete
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      const removeInvocation = await ssmClient.send(
        new GetCommandInvocationCommand({
          CommandId: removeCommandId,
          InstanceId: instanceId,
        })
      );

      if (removeInvocation.Status === 'Success') {
        console.log(`✅ User ${user.email} removed successfully\n`);
        successCount++;
      } else {
        const errorMsg = removeInvocation.StandardErrorContent || removeInvocation.StandardOutputContent || 'Unknown error';
        console.error(`❌ Failed to remove ${user.email}: ${errorMsg}\n`);
        errorCount++;
        errors.push({ email: user.email, error: errorMsg });
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error(`❌ Error removing ${user.email}: ${errorMsg}\n`);
      errorCount++;
      errors.push({ email: user.email, error: errorMsg });
    }

    // Delay between removals
    await new Promise(resolve => setTimeout(resolve, 2000));
  }

  // Summary
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📊 Removal Summary');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`   Successful: ${successCount}`);
  console.log(`   Failed: ${errorCount}`);
  
  if (errors.length > 0) {
    console.log('\n   Errors:');
    for (const { email, error } of errors) {
      console.log(`     ${email}: ${error.substring(0, 200)}`);
    }
  }

  console.log(`\n✅ User removal completed`);
}

// CLI interface
if (require.main === module) {
  const args = process.argv.slice(2);
  
  const options: ResetUsersViaSsmOptions = {};

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
Usage: reset-users-via-ssm.cli.ts [options]

Removes users via AWS SSM RunCommand (bypasses SSH connection issues).

Options:
  --domain, -d <domain>     Domain name (default: from APP_PATH or DOMAIN env)
  --app-path <path>         App path (default: from APP_PATH env)
  --region, -r <region>     AWS region (default: us-east-1)
  --profile <profile>       AWS profile (default: hepe-admin-mfa)
  --dry-run                 Preview changes without making them
  --help, -h                Show this help

Examples:
  # Preview removal
  pnpm exec tsx tools/reset-users-via-ssm.cli.ts --dry-run

  # Remove all users except admin accounts
  pnpm exec tsx tools/reset-users-via-ssm.cli.ts
`);
        process.exit(0);
        break;
    }
  }

  resetUsersViaSsm(options).catch((error) => {
    console.error(`Fatal error: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  });
}

export { resetUsersViaSsm };














