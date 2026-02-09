#!/usr/bin/env ts-node

/**
 * Recreate Users via SSM RunCommand
 * 
 * Recreates users using Mail-in-a-Box CLI via SSM RunCommand
 * This ensures users are created properly aligned with system expectations
 */

import { resolveStackName, resolveDomain, getStackInfo } from '@mm/admin-stack-info';
import { SSMClient, SendCommandCommand, GetCommandInvocationCommand } from '@aws-sdk/client-ssm';
import { fromIni } from '@aws-sdk/credential-providers';

interface RecreateUsersViaSsmOptions {
  domain?: string;
  appPath?: string;
  region?: string;
  profile?: string;
  users?: string; // Comma-separated list or JSON array
  dryRun?: boolean;
}

function generatePassword(length: number = 16): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
  let password = '';
  for (let i = 0; i < length; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return password;
}

async function recreateUsersViaSsm(options: RecreateUsersViaSsmOptions): Promise<void> {
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

  console.log('👥 Recreate Users via SSM RunCommand');
  console.log(`   Domain: ${resolvedDomain}`);
  console.log(`   Instance ID: ${instanceId}`);
  console.log(`   Dry Run: ${dryRun ? 'YES' : 'NO'}\n`);

  const credentials = fromIni({ profile });
  const ssmClient = new SSMClient({ region, credentials });

  // Parse users to create
  const usersToCreate: string[] = [];
  if (options.users) {
    try {
      const parsed = JSON.parse(options.users);
      if (Array.isArray(parsed)) {
        usersToCreate.push(...parsed);
      } else {
        usersToCreate.push(...options.users.split(',').map(u => u.trim()));
      }
    } catch {
      usersToCreate.push(...options.users.split(',').map(u => u.trim()));
    }
  } else {
    // Default users that were removed
    usersToCreate.push(
      'adobe2@emcnotary.com',
      'adobe@emcnotary.com',
      'appt@emcnotary.com',
      'inquiry@emcnotary.com',
      'me@emcnotary.com'
    );
  }

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📊 Users to Create');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  for (const email of usersToCreate) {
    console.log(`   ${email}`);
  }
  console.log(`\n   Total: ${usersToCreate.length} user(s) to create\n`);

  if (dryRun) {
    console.log('⚠️  DRY RUN MODE - No users will be created\n');
    return;
  }

  // Create users one by one
  console.log('📋 Creating users via SSM RunCommand...\n');
  let successCount = 0;
  let errorCount = 0;
  const errors: Array<{ email: string; error: string }> = [];
  const createdUsers: Array<{ email: string; password: string }> = [];

  for (const email of usersToCreate) {
    console.log(`📋 Creating ${email}...`);
    
    const password = generatePassword();
    const emailB64 = Buffer.from(email).toString('base64');
    const passwordB64 = Buffer.from(password).toString('base64');
    
    const createCommand = `cd /opt/mailinabox && git config --global --add safe.directory /opt/mailinabox 2>/dev/null || true && EMAIL=\$(echo "${emailB64}" | base64 -d) && PASS=\$(echo "${passwordB64}" | base64 -d) && sudo -u user-data /opt/mailinabox/management/cli.py user add "\$EMAIL" "\$PASS" 2>&1 || sudo -u user-data /opt/mailinabox/management/users.py add "\$EMAIL" "\$PASS" 2>&1`;
    
    try {
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
        throw new Error('Failed to send create command');
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
      
      if (createInvocation.Status === 'Success') {
        if (output.includes('already exists') || output.includes('already a mail user')) {
          console.log(`✅ ${email} already exists\n`);
          successCount++;
        } else if (output.includes('added') || output.includes('created') || output.trim() === '') {
          console.log(`✅ ${email} created successfully\n`);
          successCount++;
          createdUsers.push({ email, password });
        } else {
          console.log(`⚠️  ${email} creation completed but output unclear: ${output.substring(0, 200)}\n`);
          successCount++;
          createdUsers.push({ email, password });
        }
      } else {
        if (output.includes('already exists') || output.includes('already a mail user')) {
          console.log(`✅ ${email} already exists (command reported failure but user exists)\n`);
          successCount++;
        } else {
          const errorMsg = error || output || 'Unknown error';
          console.error(`❌ Failed to create ${email}: ${errorMsg.substring(0, 200)}\n`);
          errorCount++;
          errors.push({ email, error: errorMsg });
        }
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error(`❌ Error creating ${email}: ${errorMsg}\n`);
      errorCount++;
      errors.push({ email, error: errorMsg });
    }

    // Delay between creations
    await new Promise(resolve => setTimeout(resolve, 3000));
  }

  // Summary
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📊 Creation Summary');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`   Successful: ${successCount}`);
  console.log(`   Failed: ${errorCount}`);
  
  if (errors.length > 0) {
    console.log('\n   Errors:');
    for (const { email, error } of errors) {
      console.log(`     ${email}: ${error.substring(0, 200)}`);
    }
  }

  if (createdUsers.length > 0) {
    console.log('\n📝 Created Users (save these passwords):');
    for (const { email, password } of createdUsers) {
      console.log(`   ${email}: ${password}`);
    }
  }

  // List final users
  console.log('\n📋 Verifying users...');
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
  if (listCommandId) {
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    const listInvocation = await ssmClient.send(
      new GetCommandInvocationCommand({
        CommandId: listCommandId,
        InstanceId: instanceId,
      })
    );

    if (listInvocation.Status === 'Success') {
      const output = listInvocation.StandardOutputContent || '';
      const lines = output.split('\n').filter(line => line.trim() && !line.includes('ERROR'));
      const users = lines.map(line => {
        const match = line.match(/^\s*([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+(?:\.[a-zA-Z0-9._-]+)*)\*?\s*(?:\[(.*)\])?/);
        return match ? match[1] : null;
      }).filter((u): u is string => u !== null);
      
      console.log(`✅ Total users: ${users.length}`);
      console.log('\n   Users:');
      for (const user of users) {
        console.log(`     ${user}`);
      }
    }
  }

  console.log('\n✅ User recreation completed!');
}

// CLI interface
if (require.main === module) {
  const args = process.argv.slice(2);
  
  const options: RecreateUsersViaSsmOptions = {};

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
      case '--users':
        options.users = args[++i];
        break;
      case '--dry-run':
        options.dryRun = true;
        break;
      case '--help':
      case '-h':
        console.log(`
Usage: recreate-users-via-ssm.cli.ts [options]

Recreates users via SSM RunCommand for proper system alignment.

Options:
  --domain, -d <domain>     Domain name (default: from APP_PATH or DOMAIN env)
  --app-path <path>         App path (default: from APP_PATH env)
  --region, -r <region>      AWS region (default: us-east-1)
  --profile <profile>        AWS profile (default: hepe-admin-mfa)
  --users <list>             Comma-separated list or JSON array of emails
  --dry-run                  Preview without creating
  --help, -h                 Show this help
`);
        process.exit(0);
        break;
    }
  }

  recreateUsersViaSsm(options).catch((error) => {
    console.error(`Fatal error: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  });
}

export { recreateUsersViaSsm };

















