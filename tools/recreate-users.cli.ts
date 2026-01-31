#!/usr/bin/env ts-node

/**
 * Recreate Users
 * 
 * Recreates users that were removed, using HTTP API for proper webmail setup
 */

import { addUser, listUsers } from './manage-miab-users.cli';
import { getAdminCredentials } from '@mm/admin-credentials';
import { resolveStackName, resolveDomain, getStackInfo } from '@mm/admin-stack-info';

interface RecreateUsersOptions {
  domain?: string;
  appPath?: string;
  region?: string;
  profile?: string;
  users?: string; // Comma-separated list or JSON array
  dryRun?: boolean;
}

async function recreateUsers(options: RecreateUsersOptions): Promise<void> {
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

  const instanceIp = stackInfo.instancePublicIp;
  if (!instanceIp) {
    throw new Error(`Could not determine instance IP from stack ${instanceStackName}`);
  }

  const baseUrl = `https://${instanceIp}`;
  const adminEmail = `admin@${resolvedDomain}`;

  console.log('👥 Recreate Users');
  console.log(`   Domain: ${resolvedDomain}`);
  console.log(`   Instance IP: ${instanceIp}`);
  console.log(`   Dry Run: ${dryRun ? 'YES' : 'NO'}\n`);

  // Get admin credentials
  console.log('📋 Step 1: Getting admin credentials...');
  const adminCreds = await getAdminCredentials({
    appPath,
    domain: resolvedDomain,
    region,
    profile,
  });
  const adminPassword = adminCreds.password;
  console.log(`✅ Admin credentials ready\n`);

  // Wait a moment for admin account to be fully synced
  console.log('📋 Step 2: Waiting for admin account to sync...');
  await new Promise(resolve => setTimeout(resolve, 5000));

  // List current users
  console.log('📋 Step 3: Listing current users...');
  let currentUsers: Array<{ email: string }> = [];
  try {
    currentUsers = await listUsers(baseUrl, adminEmail, adminPassword);
    console.log(`✅ Found ${currentUsers.length} existing user(s)\n`);
  } catch (error) {
    console.log(`⚠️  Could not list users via HTTP API: ${error instanceof Error ? error.message : String(error)}`);
    console.log(`   Will attempt to create users anyway\n`);
  }

  // Parse users to create
  const usersToCreate: string[] = [];
  if (options.users) {
    // Try JSON array first
    try {
      const parsed = JSON.parse(options.users);
      if (Array.isArray(parsed)) {
        usersToCreate.push(...parsed);
      } else {
        usersToCreate.push(...options.users.split(',').map(u => u.trim()));
      }
    } catch {
      // Not JSON, treat as comma-separated
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

  // Filter out users that already exist
  const existingEmails = new Set(currentUsers.map(u => u.email.toLowerCase()));
  const usersToAdd = usersToCreate.filter(email => !existingEmails.has(email.toLowerCase()));

  if (usersToAdd.length === 0) {
    console.log('✅ All users already exist\n');
    return;
  }

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📊 Users to Create');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  for (const email of usersToAdd) {
    console.log(`   ${email}`);
  }
  console.log(`\n   Total: ${usersToAdd.length} user(s) to create\n`);

  if (dryRun) {
    console.log('⚠️  DRY RUN MODE - No users will be created\n');
    return;
  }

  // Generate password function
  const generatePassword = (length: number = 16): string => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
    let password = '';
    for (let i = 0; i < length; i++) {
      password += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return password;
  };

  // Create users one by one
  console.log('📋 Step 4: Creating users via HTTP API...\n');
  let successCount = 0;
  let errorCount = 0;
  const errors: Array<{ email: string; error: string }> = [];
  const createdUsers: Array<{ email: string; password: string }> = [];

  for (const email of usersToAdd) {
    console.log(`📋 Creating ${email}...`);
    
    const password = generatePassword();
    
    try {
      const result = await addUser(
        baseUrl,
        adminEmail,
        adminPassword,
        email,
        password,
        false // isAdmin
      );

      if (result.success) {
        console.log(`✅ ${result.message}\n`);
        successCount++;
        createdUsers.push({ email, password });
      } else {
        if (result.message.includes('already exists')) {
          console.log(`✅ ${email} already exists\n`);
          successCount++;
        } else {
          console.error(`❌ ${result.message}\n`);
          errorCount++;
          errors.push({ email, error: result.message });
        }
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error(`❌ Error creating ${email}: ${errorMsg}\n`);
      errorCount++;
      errors.push({ email, error: errorMsg });
    }

    // Delay between creations
    await new Promise(resolve => setTimeout(resolve, 2000));
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

  // Final verification
  console.log('\n📋 Step 5: Verifying users...');
  try {
    const finalUsers = await listUsers(baseUrl, adminEmail, adminPassword);
    console.log(`✅ Total users: ${finalUsers.length}`);
    console.log('\n   Users:');
    for (const user of finalUsers) {
      const adminBadge = user.privileges?.includes('admin') ? ' [ADMIN]' : '';
      console.log(`     ${user.email}${adminBadge}`);
    }
  } catch (error) {
    console.log(`⚠️  Could not verify users: ${error instanceof Error ? error.message : String(error)}`);
  }

  console.log('\n✅ User recreation completed!');
}

// CLI interface
if (require.main === module) {
  const args = process.argv.slice(2);
  
  const options: RecreateUsersOptions = {};

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
Usage: recreate-users.cli.ts [options]

Recreates users via HTTP API for proper webmail setup.

Options:
  --domain, -d <domain>     Domain name (default: from APP_PATH or DOMAIN env)
  --app-path <path>         App path (default: from APP_PATH env)
  --region, -r <region>      AWS region (default: us-east-1)
  --profile <profile>       AWS profile (default: hepe-admin-mfa)
  --users <list>             Comma-separated list or JSON array of emails (default: adobe2,adobe,appt,inquiry,me@emcnotary.com)
  --dry-run                  Preview without creating
  --help, -h                 Show this help

Examples:
  # Preview default users
  pnpm exec tsx tools/recreate-users.cli.ts --dry-run

  # Create specific users
  pnpm exec tsx tools/recreate-users.cli.ts --users "user1@domain.com,user2@domain.com"

  # Create users from JSON array
  pnpm exec tsx tools/recreate-users.cli.ts --users '["user1@domain.com","user2@domain.com"]'
`);
        process.exit(0);
        break;
    }
  }

  recreateUsers(options).catch((error) => {
    console.error(`Fatal error: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  });
}

export { recreateUsers };













