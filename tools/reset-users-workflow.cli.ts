#!/usr/bin/env ts-node

/**
 * Reset Users Workflow
 * 
 * This workflow:
 * 1. Creates admin@domain via HTTP API (ensures proper webmail setup)
 * 2. Removes all other users via HTTP API or SSH/CLI
 * 3. Verifies admin@domain works correctly
 * 
 * This ensures admin@domain is created properly aligned with system expectations.
 */

import { getAdminCredentials } from '@mm/admin-credentials';
import { resolveStackName, resolveDomain, getStackInfo } from '@mm/admin-stack-info';
import { addUser, listUsers, removeUser } from './manage-miab-users.cli';
import { sshCommand } from '@mm/admin-account';
import * as https from 'node:https';

interface ResetUsersOptions {
  domain?: string;
  appPath?: string;
  region?: string;
  profile?: string;
  dryRun?: boolean;
}

/**
 * Make HTTP API call to Mail-in-a-Box
 */
async function makeApiCall(
  method: string,
  apiPath: string,
  data: string | undefined,
  baseUrl: string,
  email: string,
  password: string
): Promise<{ httpCode: number; body: string }> {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(baseUrl);
    const fullPath = `${parsedUrl.pathname}${apiPath}`.replace(/\/+/g, '/');

    const auth = Buffer.from(`${email}:${password}`).toString('base64');
    
    const options: https.RequestOptions = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || 443,
      path: fullPath,
      method,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${auth}`,
        'User-Agent': 'Mail-in-a-Box-User-Reset/1.0',
      },
      rejectUnauthorized: false,
      timeout: 30000,
    };

    const req = https.request(options, (res) => {
      let responseBody = '';
      res.on('data', (chunk) => { responseBody += chunk; });
      res.on('end', () => {
        resolve({ httpCode: res.statusCode || 500, body: responseBody });
      });
    });

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('API call timeout'));
    });

    if (data) {
      req.write(data);
    }
    req.end();
  });
}

/**
 * Remove user via SSH/CLI (fallback when HTTP API doesn't work)
 */
async function removeUserViaSsh(
  keyPath: string,
  instanceIp: string,
  email: string
): Promise<{ success: boolean; message: string }> {
  const emailB64 = Buffer.from(email).toString('base64');
  const checkCliPy = `test -f /opt/mailinabox/management/cli.py && echo "CLI_EXISTS" || echo "NOT_FOUND"`;
  const cliCheck = await sshCommand(keyPath, instanceIp, checkCliPy);
  
  let removeCommand: string;
  if (cliCheck.output.includes('CLI_EXISTS')) {
    // Use cli.py user remove
    removeCommand = `bash -c 'cd /opt/mailinabox && git config --global --add safe.directory /opt/mailinabox 2>/dev/null || true && EMAIL=\$(echo "${emailB64}" | base64 -d) && sudo -n -u user-data bash -c "cd /opt/mailinabox && /opt/mailinabox/management/cli.py user remove \\\"\$EMAIL\\\"" 2>&1'`;
  } else {
    // Use users.py remove
    removeCommand = `bash -c 'cd /opt/mailinabox && git config --global --add safe.directory /opt/mailinabox 2>/dev/null || true && EMAIL=\$(echo "${emailB64}" | base64 -d) && sudo -n -u user-data bash -c "cd /opt/mailinabox && /opt/mailinabox/management/users.py remove \\\"\$EMAIL\\\"" 2>&1'`;
  }
  
  const result = await sshCommand(keyPath, instanceIp, removeCommand);
  
  if (result.success) {
    return { success: true, message: `User ${email} removed successfully via SSH/CLI` };
  } else {
    return { success: false, message: `SSH removal failed: ${result.error || result.output}` };
  }
}

/**
 * Remove user via HTTP API or SSH fallback
 */
async function removeUserWithFallback(
  baseUrl: string,
  adminEmail: string,
  adminPassword: string,
  email: string,
  keyPath?: string,
  instanceIp?: string
): Promise<{ success: boolean; message: string; method: string }> {
  // Try HTTP API first
  const params = new URLSearchParams();
  params.append('email', email);

  try {
    const result = await makeApiCall(
      'POST',
      '/admin/mail/users/remove',
      params.toString(),
      baseUrl,
      adminEmail,
      adminPassword
    );

    if (result.httpCode === 200) {
      return { success: true, message: `User ${email} removed successfully`, method: 'HTTP API' };
    } else if (result.body.includes('archive') || result.body.includes('Archive')) {
      // If API says to archive instead, try SSH
      if (keyPath && instanceIp) {
        console.log(`   ⚠️  HTTP API suggests archiving, trying SSH/CLI removal...`);
        const sshResult = await removeUserViaSsh(keyPath, instanceIp, email);
        return { ...sshResult, method: 'SSH/CLI' };
      }
      return { success: false, message: `HTTP ${result.httpCode}: ${result.body.substring(0, 200)}`, method: 'HTTP API' };
    } else {
      return { success: false, message: `HTTP ${result.httpCode}: ${result.body.substring(0, 200)}`, method: 'HTTP API' };
    }
  } catch (error) {
    // If HTTP API fails, try SSH
    if (keyPath && instanceIp) {
      console.log(`   ⚠️  HTTP API failed, trying SSH/CLI removal...`);
      const sshResult = await removeUserViaSsh(keyPath, instanceIp, email);
      return { ...sshResult, method: 'SSH/CLI' };
    }
    return { success: false, message: error instanceof Error ? error.message : String(error), method: 'HTTP API' };
  }
}

async function resetUsersWorkflow(options: ResetUsersOptions): Promise<void> {
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
  const defaultAdminEmail = `me@box.${resolvedDomain}`;

  console.log('🔄 Reset Users Workflow');
  console.log(`   Domain: ${resolvedDomain}`);
  console.log(`   Instance IP: ${instanceIp}`);
  console.log(`   Dry Run: ${dryRun ? 'YES' : 'NO'}\n`);

  // Get admin password from SSM
  console.log('📋 Step 1: Getting admin password from SSM...');
  const adminCreds = await getAdminCredentials({
    appPath,
    domain: resolvedDomain,
    region,
    profile,
  });
  const adminPassword = adminCreds.password;
  console.log(`✅ Admin password retrieved\n`);

  // Get SSH key for listing/removal operations
  const { getSshKeyPath } = await import('@mm/admin-ssh');
  const keyPath = await getSshKeyPath({
    appPath,
    domain: resolvedDomain,
    region,
    profile,
  });

  // Step 2: List all users via SSH (HTTP API auth may not work)
  console.log('📋 Step 2: Listing all users via SSH...');
  let users: Array<{ email: string; privileges?: string[] }> = [];
  
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
  
  // Parse SSH output (format: email [privileges] or email* [privileges])
  const lines = sshResult.output.split('\n').filter(line => line.trim() && !line.includes('ERROR'));
  users = lines.map(line => {
    // Match email (may have * suffix) and optional privileges
    // Pattern: "email* [admin]" or "email [admin]" or just "email"
    const match = line.match(/^\s*([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+(?:\.[a-zA-Z0-9._-]+)*)\*?\s*(?:\[(.*)\])?/);
    if (match) {
      return {
        email: match[1], // Email without * suffix
        privileges: match[2] ? match[2].split(',').map(p => p.trim()) : [],
        quota: 'unlimited',
        status: 'active',
      };
    }
    return null;
  }).filter((u): u is NonNullable<typeof u> => u !== null);
  
  console.log(`✅ Listed ${users.length} user(s) via SSH\n`);

  // Step 3: Check if admin@domain exists, create if needed via HTTP API
  console.log('📋 Step 3: Checking if admin@domain exists...');
  const adminExists = users.some(u => u.email === adminEmail);
  let activeAdminEmail = defaultAdminEmail; // Default to me@box.domain for API calls
  
  if (!adminExists) {
    console.log(`📋 Creating admin@domain via HTTP API...`);
    if (!dryRun) {
      // Try to use me@box.domain for API auth, fallback to trying admin@domain if it exists
      let createSuccess = false;
      let lastError: string | null = null;
      
      // Try with me@box.domain first
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
          createSuccess = true;
          activeAdminEmail = adminEmail; // Switch to admin@domain for subsequent operations
        } else if (createResult.message.includes('already exists')) {
          console.log(`✅ ${createResult.message}\n`);
          createSuccess = true;
          activeAdminEmail = adminEmail;
        } else {
          lastError = createResult.message;
        }
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error);
      }
      
      if (!createSuccess) {
        console.log(`⚠️  Failed to create with ${defaultAdminEmail}, trying alternative methods...`);
        // If HTTP API fails, we'll create via SSH/CLI as fallback
        console.log(`   Will create via SSH/CLI after user removal\n`);
      }
    } else {
      console.log(`[DRY RUN] Would create ${adminEmail} via HTTP API\n`);
    }
  } else {
    console.log(`✅ ${adminEmail} already exists\n`);
    // Try to use admin@domain for API calls
    try {
      await listUsers(baseUrl, adminEmail, adminPassword);
      activeAdminEmail = adminEmail;
    } catch (error) {
      console.log(`⚠️  ${adminEmail} exists but API auth failed, will use SSH for operations\n`);
    }
  }

  // Step 4: Filter users to remove (keep admin@domain and me@box.domain)
  // Refresh user list to get latest state
  if (!dryRun && activeAdminEmail === adminEmail) {
    users = await listUsers(baseUrl, adminEmail, adminPassword);
  }
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

  // Step 5: Remove users one by one via SSH/CLI (most reliable method)
  console.log('📋 Step 5: Removing users via SSH/CLI...\n');
  let successCount = 0;
  let errorCount = 0;
  const errors: Array<{ email: string; error: string; method: string }> = [];

  for (const user of usersToRemove) {
    console.log(`📋 Removing ${user.email}...`);
    
    // Use SSH/CLI for removal (most reliable, bypasses HTTP API restrictions)
    const result = await removeUserViaSsh(keyPath, instanceIp, user.email);

    if (result.success) {
      console.log(`✅ ${result.message}\n`);
      successCount++;
    } else {
      console.error(`❌ ${result.message}\n`);
      errorCount++;
      errors.push({ email: user.email, error: result.message, method: 'SSH/CLI' });
    }

    // Small delay between removals
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
    for (const { email, error, method } of errors) {
      console.log(`     ${email} (${method}): ${error}`);
    }
  }

  // Step 6: Create admin@domain via HTTP API if it doesn't exist (after removing other users)
  console.log('\n📋 Step 6: Ensuring admin@domain exists via HTTP API...');
  const adminStillExists = usersToRemove.length === 0 || !usersToRemove.some(u => u.email === adminEmail);
  
  if (!adminStillExists || !users.some(u => u.email === adminEmail)) {
    console.log(`📋 Creating admin@domain via HTTP API (now that other users are removed)...`);
    if (!dryRun) {
      // Try with me@box.domain (should work now)
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
          console.log(`   Admin account may need to be created manually\n`);
        }
      } catch (error) {
        console.log(`⚠️  Failed to create admin@domain via HTTP API: ${error instanceof Error ? error.message : String(error)}`);
        console.log(`   You may need to create it manually via web UI\n`);
      }
    } else {
      console.log(`[DRY RUN] Would create ${adminEmail} via HTTP API\n`);
    }
  } else {
    console.log(`✅ ${adminEmail} already exists\n`);
  }

  // Step 7: Verify admin@domain exists
  console.log('📋 Step 7: Verifying admin@domain...');
  // Re-list users via SSH to verify
  const verifyResult = await sshCommand(keyPath, instanceIp, listCommand);
  if (verifyResult.success) {
    const verifyLines = verifyResult.output.split('\n').filter(line => line.trim() && !line.includes('ERROR'));
    const verifyUsers = verifyLines.map(line => {
      const match = line.match(/^\s*(\S+@\S+)\*?\s*(?:\[(.*)\])?/);
      return match ? match[1] : null;
    }).filter((u): u is string => u !== null);
    
    const adminVerified = verifyUsers.includes(adminEmail);
    if (adminVerified) {
      console.log(`✅ ${adminEmail} exists and verified\n`);
    } else {
      console.log(`⚠️  ${adminEmail} not found in user list\n`);
    }
  } else {
    console.log(`⚠️  Could not verify admin@domain: ${verifyResult.error || verifyResult.output}\n`);
  }

  console.log('✅ User reset workflow completed');
  console.log(`\n📝 Next Steps:`);
  console.log(`   1. Test webmail login at https://box.${resolvedDomain}`);
  console.log(`   2. Verify admin@${resolvedDomain} can access webmail`);
  console.log(`   3. Add other users one by one via HTTP API`);
}

// CLI interface
if (require.main === module) {
  const args = process.argv.slice(2);
  
  const options: ResetUsersOptions = {};

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
Usage: reset-users-workflow.cli.ts [options]

Workflow:
  1. Creates admin@domain via HTTP API (ensures proper webmail setup)
  2. Removes all other users via HTTP API or SSH/CLI fallback
  3. Verifies admin@domain works correctly

Options:
  --domain, -d <domain>     Domain name (default: from APP_PATH or DOMAIN env)
  --app-path <path>         App path (default: from APP_PATH env)
  --region, -r <region>     AWS region (default: us-east-1)
  --profile <profile>       AWS profile (default: hepe-admin-mfa)
  --dry-run                  Preview changes without making them
  --help, -h                 Show this help

Examples:
  # Preview workflow
  pnpm exec tsx tools/reset-users-workflow.cli.ts --dry-run

  # Execute workflow
  pnpm exec tsx tools/reset-users-workflow.cli.ts
`);
        process.exit(0);
        break;
    }
  }

  resetUsersWorkflow(options).catch((error) => {
    console.error(`Fatal error: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  });
}

export { resetUsersWorkflow };

