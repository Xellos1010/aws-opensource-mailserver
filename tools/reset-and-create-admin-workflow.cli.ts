#!/usr/bin/env ts-node

/**
 * Complete Reset and Create Admin Workflow
 * 
 * This workflow:
 * 1. Creates admin@domain via HTTP API (ensures proper webmail setup)
 * 2. Removes all other users via SSM RunCommand (bypasses SSH/HTTP API restrictions)
 * 3. Verifies admin@domain works correctly
 * 
 * This ensures admin@domain is created properly aligned with system expectations.
 */

import { getAdminCredentials } from '@mm/admin-credentials';
import { resolveStackName, resolveDomain, getStackInfo } from '@mm/admin-stack-info';
import { addUser, listUsers } from './manage-miab-users.cli';
import { SSMClient, SendCommandCommand, GetCommandInvocationCommand } from '@aws-sdk/client-ssm';
import { fromIni } from '@aws-sdk/credential-providers';

interface ResetAndCreateAdminOptions {
  domain?: string;
  appPath?: string;
  region?: string;
  profile?: string;
  dryRun?: boolean;
}

async function resetAndCreateAdminWorkflow(options: ResetAndCreateAdminOptions): Promise<void> {
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
  const instanceIp = stackInfo.instancePublicIp;
  if (!instanceId || !instanceIp) {
    throw new Error(`Could not determine instance ID/IP from stack ${instanceStackName}`);
  }

  const baseUrl = `https://${instanceIp}`;
  const adminEmail = `admin@${resolvedDomain}`;
  const defaultAdminEmail = `me@box.${resolvedDomain}`;

  console.log('🔄 Reset and Create Admin Workflow');
  console.log(`   Domain: ${resolvedDomain}`);
  console.log(`   Instance ID: ${instanceId}`);
  console.log(`   Instance IP: ${instanceIp}`);
  console.log(`   Dry Run: ${dryRun ? 'YES' : 'NO'}\n`);

  // Step 1: Get admin password from SSM
  console.log('📋 Step 1: Getting admin password from SSM...');
  const adminCreds = await getAdminCredentials({
    appPath,
    domain: resolvedDomain,
    region,
    profile,
  });
  const adminPassword = adminCreds.password;
  console.log(`✅ Admin password retrieved\n`);

  // Step 2: List users via SSM
  console.log('📋 Step 2: Listing users via SSM...');
  const credentials = fromIni({ profile });
  const ssmClient = new SSMClient({ region, credentials });

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

  // Step 3: Create admin@domain via HTTP API (if it doesn't exist)
  console.log('📋 Step 3: Creating admin@domain via HTTP API...');
  const adminExists = users.some(u => u.email === adminEmail);
  
  if (!adminExists) {
    if (!dryRun) {
      // Try to use me@box.domain for API auth
      try {
        const createResult = await addUser(
          baseUrl,
          defaultAdminEmail,
          adminPassword,
          adminEmail,
          adminPassword,
          true // isAdmin
        );
        
        if (createResult.success) {
          console.log(`✅ ${createResult.message}\n`);
        } else if (createResult.message.includes('already exists')) {
          console.log(`✅ ${createResult.message}\n`);
        } else {
          console.log(`⚠️  HTTP API creation failed: ${createResult.message}`);
          console.log(`   Will continue with user removal, admin can be created manually\n`);
        }
      } catch (error) {
        console.log(`⚠️  Failed to create admin@domain via HTTP API: ${error instanceof Error ? error.message : String(error)}`);
        console.log(`   Will continue with user removal, admin can be created manually\n`);
      }
    } else {
      console.log(`[DRY RUN] Would create ${adminEmail} via HTTP API\n`);
    }
  } else {
    console.log(`✅ ${adminEmail} already exists\n`);
  }

  // Step 4: Filter users to remove (keep admin@domain and me@box.domain)
  const usersToRemove = users.filter(user => {
    return user.email !== adminEmail && user.email !== defaultAdminEmail;
  });

  if (usersToRemove.length === 0) {
    console.log('✅ No users to remove (only admin accounts remain)\n');
    
    // Verify admin@domain works
    console.log('📋 Verifying admin@domain...');
    try {
      const finalUsers = await listUsers(baseUrl, adminEmail, adminPassword);
      const adminVerified = finalUsers.some(u => u.email === adminEmail);
      
      if (adminVerified) {
        console.log(`✅ ${adminEmail} exists and is accessible via HTTP API\n`);
        console.log('✅ Workflow completed successfully!');
        console.log(`\n📝 Next Steps:`);
        console.log(`   1. Test webmail login at https://box.${resolvedDomain}`);
        console.log(`   2. Verify admin@${resolvedDomain} can access webmail`);
        console.log(`   3. Add other users one by one via HTTP API`);
      } else {
        console.log(`⚠️  ${adminEmail} not found in user list\n`);
      }
    } catch (error) {
      console.log(`⚠️  Could not verify admin@domain via HTTP API: ${error instanceof Error ? error.message : String(error)}\n`);
    }
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

  // Step 5: Remove users via SSM RunCommand
  console.log('📋 Step 4: Removing users via SSM RunCommand...\n');
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
        console.error(`❌ Failed to remove ${user.email}: ${errorMsg.substring(0, 200)}\n`);
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

  // Step 6: Verify admin@domain exists and works
  console.log('\n📋 Step 5: Verifying admin@domain...');
  try {
    const finalUsers = await listUsers(baseUrl, adminEmail, adminPassword);
    const adminVerified = finalUsers.some(u => u.email === adminEmail);
    
    if (adminVerified) {
      console.log(`✅ ${adminEmail} exists and is accessible via HTTP API\n`);
    } else {
      console.log(`⚠️  ${adminEmail} not found in user list`);
      console.log(`   You may need to create it manually via web UI\n`);
    }
  } catch (error) {
    console.log(`⚠️  Could not verify admin@domain via HTTP API: ${error instanceof Error ? error.message : String(error)}`);
    console.log(`   Admin account may need to be created manually\n`);
  }

  console.log('✅ Workflow completed!');
  console.log(`\n📝 Next Steps:`);
  console.log(`   1. Test webmail login at https://box.${resolvedDomain}`);
  console.log(`   2. Verify admin@${resolvedDomain} can access webmail`);
  console.log(`   3. If admin@${resolvedDomain} doesn't exist, create it via:`);
  console.log(`      EMAIL=admin@${resolvedDomain} PASSWORD=<password> ADMIN=1 pnpm nx run cdk-emcnotary-instance:admin:users:add`);
  console.log(`   4. Add other users one by one via HTTP API`);
}

// CLI interface
if (require.main === module) {
  const args = process.argv.slice(2);
  
  const options: ResetAndCreateAdminOptions = {};

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
Usage: reset-and-create-admin-workflow.cli.ts [options]

Complete workflow:
  1. Creates admin@domain via HTTP API (ensures proper webmail setup)
  2. Removes all other users via SSM RunCommand (bypasses SSH/HTTP API restrictions)
  3. Verifies admin@domain works correctly

Options:
  --domain, -d <domain>     Domain name (default: from APP_PATH or DOMAIN env)
  --app-path <path>         App path (default: from APP_PATH env)
  --region, -r <region>     AWS region (default: us-east-1)
  --profile <profile>       AWS profile (default: hepe-admin-mfa)
  --dry-run                 Preview changes without making them
  --help, -h                Show this help

Examples:
  # Preview workflow
  pnpm exec tsx tools/reset-and-create-admin-workflow.cli.ts --dry-run

  # Execute workflow
  pnpm exec tsx tools/reset-and-create-admin-workflow.cli.ts
`);
        process.exit(0);
        break;
    }
  }

  resetAndCreateAdminWorkflow(options).catch((error) => {
    console.error(`Fatal error: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  });
}

export { resetAndCreateAdminWorkflow };















