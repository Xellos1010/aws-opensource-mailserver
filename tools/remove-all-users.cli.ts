#!/usr/bin/env ts-node

/**
 * Remove All Mail-in-a-Box Users
 * 
 * Removes all users except:
 * - me@box.<domain> (default admin user)
 * - Optionally: admin@<domain> (if --keep-admin flag is set)
 */

import { listUsers, removeUser } from './manage-miab-users.cli';
import { getAdminCredentials } from '@mm/admin-credentials';
import { resolveStackName, resolveDomain, getStackInfo } from '@mm/admin-stack-info';
import { sshCommand } from '@mm/admin-account';

interface RemoveAllUsersOptions {
  domain?: string;
  appPath?: string;
  region?: string;
  profile?: string;
  keepAdmin?: boolean;
  dryRun?: boolean;
}

async function removeAllUsers(options: RemoveAllUsersOptions): Promise<void> {
  const region = options.region || process.env.AWS_REGION || 'us-east-1';
  const profile = options.profile || process.env.AWS_PROFILE || 'hepe-admin-mfa';
  const domain = options.domain || process.env.DOMAIN;
  const appPath = options.appPath || process.env.APP_PATH;
  const keepAdmin = options.keepAdmin || process.env.KEEP_ADMIN === '1';
  const dryRun = options.dryRun || process.env.DRY_RUN === '1';

  if (!domain && !appPath) {
    throw new Error('Cannot resolve domain. Provide domain or appPath');
  }

  const resolvedDomain = domain || (appPath ? resolveDomain(appPath) : null);
  if (!resolvedDomain) {
    throw new Error('Cannot resolve domain. Provide domain or appPath');
  }

  // Get instance IP for baseUrl
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

  console.log('🗑️  Remove All Mail-in-a-Box Users');
  console.log(`   Domain: ${resolvedDomain}`);
  console.log(`   Instance IP: ${instanceIp}`);
  console.log(`   Keep admin@${resolvedDomain}: ${keepAdmin ? 'YES' : 'NO'}`);
  console.log(`   Dry Run: ${dryRun ? 'YES' : 'NO'}\n`);

  // Get SSH key path (needed for fallback)
  const { getSshKeyPath } = await import('@mm/admin-ssh');
  const keyPath = await getSshKeyPath({
    appPath,
    domain: resolvedDomain,
    region,
    profile,
  });

  // Get admin credentials (for HTTP API if available)
  console.log('📋 Getting admin credentials...');
  const adminCreds = await getAdminCredentials({
    appPath,
    domain: resolvedDomain,
    region,
    profile,
  });
  
  const defaultAdminEmail = `me@box.${resolvedDomain}`;
  const adminEmail = `admin@${resolvedDomain}`;
  
  // Try to list users via HTTP API first, fallback to SSH
  console.log('📋 Listing all users...\n');
  let users: Array<{ email: string; privileges?: string[]; quota?: string; status?: string }> = [];
  let useSshForRemoval = false;
  let credentials: { email: string; password: string; domain: string; adminUrl: string } | null = null;
  
  // Try HTTP API with admin@domain
  try {
    credentials = {
      email: adminEmail,
      password: adminCreds.password,
      domain: adminCreds.domain,
      adminUrl: adminCreds.adminUrl,
    };
    users = await listUsers(baseUrl, credentials.email, credentials.password);
    console.log(`✅ Listed users via HTTP API (using ${adminEmail})\n`);
  } catch (error) {
    // Try me@box.domain
    try {
      credentials.email = defaultAdminEmail;
      users = await listUsers(baseUrl, credentials.email, credentials.password);
      console.log(`✅ Listed users via HTTP API (using ${defaultAdminEmail})\n`);
    } catch (fallbackError) {
      // Fallback to SSH for listing
      console.log(`⚠️  HTTP API failed, using SSH to list users...\n`);
      useSshForRemoval = true;
      
      const checkCliPy = `test -f /opt/mailinabox/management/cli.py && echo "CLI_EXISTS" || echo "NOT_FOUND"`;
      const cliCheck = await sshCommand(keyPath, instanceIp, checkCliPy);
      
      let listCommand: string;
      if (cliCheck.output.includes('CLI_EXISTS')) {
        listCommand = `bash -c 'cd /opt/mailinabox && git config --global --add safe.directory /opt/mailinabox 2>/dev/null || true && sudo -u user-data /opt/mailinabox/management/cli.py user 2>&1'`;
      } else {
        listCommand = `bash -c 'cd /opt/mailinabox && git config --global --add safe.directory /opt/mailinabox 2>/dev/null || true && sudo -u user-data /opt/mailinabox/management/users.py list 2>&1'`;
      }
      
      const sshResult = await sshCommand(keyPath, instanceIp, listCommand);
      if (!sshResult.success) {
        throw new Error(`Failed to list users via SSH: ${sshResult.error || sshResult.output}`);
      }
      
      // Parse SSH output to extract users (format: email [privileges] or email* [privileges])
      const lines = sshResult.output.split('\n').filter(line => line.trim() && !line.includes('ERROR'));
      users = lines.map(line => {
        // Handle format: "email* [privileges]" or "email [privileges]"
        const match = line.match(/^\s*(\S+@\S+)\*?\s*(?:\[(.*)\])?/);
        if (match) {
          return {
            email: match[1],
            privileges: match[2] ? match[2].split(',').map(p => p.trim()) : [],
            quota: 'unlimited',
            status: 'active',
          };
        }
        return null;
      }).filter((u): u is NonNullable<typeof u> => u !== null);
      
      console.log(`✅ Listed ${users.length} user(s) via SSH\n`);
    }
  }

  if (users.length === 0) {
    console.log('✅ No users found to remove');
    return;
  }

  // Filter users to remove
  
  // Sort users to remove admin@domain last (if not keeping it)
  const usersToRemove = users.filter(user => {
    if (user.email === defaultAdminEmail) {
      return false; // Never remove default admin
    }
    if (keepAdmin && user.email === adminEmail) {
      return false; // Keep admin@domain if flag is set
    }
    return true;
  }).sort((a, b) => {
    // Put admin@domain at the end so we remove it last
    if (a.email === adminEmail) return 1;
    if (b.email === adminEmail) return -1;
    return 0;
  });

  if (usersToRemove.length === 0) {
    console.log('✅ No users to remove (all protected)');
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

  // Remove users one by one
  let successCount = 0;
  let errorCount = 0;
  const errors: Array<{ email: string; error: string }> = [];

  for (const user of usersToRemove) {
    console.log(`📋 Removing ${user.email}...`);
    
    let result: { success: boolean; message: string };
    
    // Use SSH if HTTP API wasn't available, otherwise try HTTP API first
    if (useSshForRemoval || !credentials) {
      // Remove via SSH/CLI
      const emailB64 = Buffer.from(user.email).toString('base64');
      const checkCliPy = `test -f /opt/mailinabox/management/cli.py && echo "CLI_EXISTS" || echo "NOT_FOUND"`;
      const cliCheck = await sshCommand(keyPath, instanceIp, checkCliPy);
      
      let removeCommand: string;
      if (cliCheck.output.includes('CLI_EXISTS')) {
        removeCommand = `bash -c 'cd /opt/mailinabox && git config --global --add safe.directory /opt/mailinabox 2>/dev/null || true && EMAIL=\$(echo "${emailB64}" | base64 -d) && sudo -n -u user-data bash -c "cd /opt/mailinabox && /opt/mailinabox/management/cli.py user remove \\\"\$EMAIL\\\"" 2>&1'`;
      } else {
        removeCommand = `bash -c 'cd /opt/mailinabox && git config --global --add safe.directory /opt/mailinabox 2>/dev/null || true && EMAIL=\$(echo "${emailB64}" | base64 -d) && sudo -n -u user-data bash -c "cd /opt/mailinabox && /opt/mailinabox/management/users.py remove \\\"\$EMAIL\\\"" 2>&1'`;
      }
      
      const sshResult = await sshCommand(keyPath, instanceIp, removeCommand);
      
      if (sshResult.success) {
        result = { success: true, message: `User ${user.email} removed successfully via SSH` };
      } else {
        result = { success: false, message: `SSH removal failed: ${sshResult.error || sshResult.output}` };
      }
    } else {
      // Try HTTP API first
      result = await removeUser(
        baseUrl,
        credentials.email,
        credentials.password,
        user.email
      );
      
      // If we get 401, switch to SSH for remaining users
      if (!result.success && result.message.includes('401')) {
        console.log(`⚠️  HTTP API authentication failed, switching to SSH for remaining users...\n`);
        useSshForRemoval = true;
        
        // Retry with SSH
        const emailB64 = Buffer.from(user.email).toString('base64');
        const checkCliPy = `test -f /opt/mailinabox/management/cli.py && echo "CLI_EXISTS" || echo "NOT_FOUND"`;
        const cliCheck = await sshCommand(keyPath, instanceIp, checkCliPy);
        
        let removeCommand: string;
        if (cliCheck.output.includes('CLI_EXISTS')) {
          removeCommand = `bash -c 'cd /opt/mailinabox && git config --global --add safe.directory /opt/mailinabox 2>/dev/null || true && EMAIL=\$(echo "${emailB64}" | base64 -d) && sudo -n -u user-data bash -c "cd /opt/mailinabox && /opt/mailinabox/management/cli.py user remove \\\"\$EMAIL\\\"" 2>&1'`;
        } else {
          removeCommand = `bash -c 'cd /opt/mailinabox && git config --global --add safe.directory /opt/mailinabox 2>/dev/null || true && EMAIL=\$(echo "${emailB64}" | base64 -d) && sudo -n -u user-data bash -c "cd /opt/mailinabox && /opt/mailinabox/management/users.py remove \\\"\$EMAIL\\\"" 2>&1'`;
        }
        
        const sshResult = await sshCommand(keyPath, instanceIp, removeCommand);
        
        if (sshResult.success) {
          result = { success: true, message: `User ${user.email} removed successfully via SSH` };
        } else {
          result = { success: false, message: `SSH removal failed: ${sshResult.error || sshResult.output}` };
        }
      }
    }

    if (result.success) {
      console.log(`✅ ${result.message}\n`);
      successCount++;
    } else {
      console.error(`❌ ${result.message}\n`);
      errorCount++;
      errors.push({ email: user.email, error: result.message });
    }

    // Small delay between removals
    await new Promise(resolve => setTimeout(resolve, 1000));
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
      console.log(`     ${email}: ${error}`);
    }
  }

  console.log(`\n✅ User removal completed`);
}

// CLI interface
if (require.main === module) {
  const args = process.argv.slice(2);
  
  const options: RemoveAllUsersOptions = {};

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
      case '--keep-admin':
        options.keepAdmin = true;
        break;
      case '--dry-run':
        options.dryRun = true;
        break;
      case '--help':
      case '-h':
        console.log(`
Usage: remove-all-users.cli.ts [options]

Removes all Mail-in-a-Box users except:
  - me@box.<domain> (default admin user, always kept)
  - admin@<domain> (kept if --keep-admin flag is set)

Options:
  --domain, -d <domain>     Domain name (default: from APP_PATH or DOMAIN env)
  --app-path <path>         App path (default: from APP_PATH env)
  --region, -r <region>    AWS region (default: us-east-1)
  --profile <profile>       AWS profile (default: hepe-admin-mfa)
  --keep-admin              Keep admin@<domain> user
  --dry-run                 Preview changes without removing users
  --help, -h                Show this help

Examples:
  # Preview removal (dry run)
  pnpm exec tsx tools/remove-all-users.cli.ts --dry-run

  # Remove all users except me@box.domain
  pnpm exec tsx tools/remove-all-users.cli.ts

  # Remove all users except me@box.domain and admin@domain
  pnpm exec tsx tools/remove-all-users.cli.ts --keep-admin
`);
        process.exit(0);
        break;
    }
  }

  removeAllUsers(options).catch((error) => {
    console.error(`Fatal error: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  });
}

export { removeAllUsers };

