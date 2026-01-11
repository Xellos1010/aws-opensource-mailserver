#!/usr/bin/env ts-node

import { getStackInfoFromApp } from '@mm/admin-stack-info';
import { getSshKeyPath } from '@mm/admin-ssh';
import { PutParameterCommand, SSMClient } from '@aws-sdk/client-ssm';
import { fromIni } from '@aws-sdk/credential-providers';
import { spawn } from 'child_process';
import * as fs from 'node:fs';
import * as crypto from 'node:crypto';

interface CreateMultipleUsersOptions {
  users: string; // JSON file path or inline JSON array
  domain?: string;
  appPath?: string;
  region?: string;
  profile?: string;
  defaultPassword?: string;
  adminUsers?: string; // Comma-separated list
  waitForApiKey?: boolean;
  retryAttempts?: number;
}

interface UserInput {
  email: string;
  password?: string;
  admin?: boolean;
}

interface UserResult {
  email: string;
  status: 'success' | 'failed' | 'skipped';
  message: string;
  password?: string;
}

/**
 * Execute SSH command and return output
 */
async function sshCommand(
  keyPath: string,
  host: string,
  command: string
): Promise<{ success: boolean; output: string; error?: string }> {
  return new Promise((resolve) => {
    const sshArgs = [
      '-i',
      keyPath,
      '-o',
      'StrictHostKeyChecking=no',
      '-o',
      'UserKnownHostsFile=/dev/null',
      '-o',
      'ConnectTimeout=10',
      '-o',
      'LogLevel=ERROR',
      `ubuntu@${host}`,
      command,
    ];

    let output = '';
    let error = '';

    const ssh = spawn('ssh', sshArgs);

    ssh.stdout.on('data', (data) => {
      output += data.toString();
    });

    ssh.stderr.on('data', (data) => {
      error += data.toString();
    });

    ssh.on('close', (code) => {
      resolve({
        success: code === 0,
        output: output.trim(),
        error: error.trim() || undefined,
      });
    });

    ssh.on('error', (err) => {
      resolve({
        success: false,
        output: '',
        error: err.message,
      });
    });
  });
}

/**
 * Wait for API key to be available
 */
async function waitForApiKey(
  keyPath: string,
  instanceIp: string,
  timeoutMs: number = 300000
): Promise<void> {
  const startTime = Date.now();
  const checkInterval = 10000; // 10 seconds
  
  console.log('Waiting for API key to be available...');
  
  while (Date.now() - startTime < timeoutMs) {
    const checkCommand = `test -f /var/lib/mailinabox/api.key && test -r /var/lib/mailinabox/api.key && echo "AVAILABLE" || echo "NOT_AVAILABLE"`;
    const result = await sshCommand(keyPath, instanceIp, checkCommand);
    
    if (result.success && result.output === 'AVAILABLE') {
      console.log('✅ API key is available');
      return;
    }
    
    const elapsed = Date.now() - startTime;
    const remaining = timeoutMs - elapsed;
    
    if (elapsed % 30000 === 0) {
      console.log(`Still waiting for API key... (${Math.floor(elapsed / 1000)}s elapsed, ${Math.floor(remaining / 1000)}s remaining)`);
    }
    
    await new Promise((resolve) => setTimeout(resolve, checkInterval));
  }
  
  throw new Error(
    `API key not available after ${timeoutMs}ms timeout. ` +
    `Mail-in-a-Box setup may still be running.`
  );
}

/**
 * Check if user exists
 */
async function checkUserExists(
  keyPath: string,
  instanceIp: string,
  email: string
): Promise<boolean> {
  // Detect which script to use
  const checkCliPy = `test -f /opt/mailinabox/management/cli.py && echo "CLI_EXISTS" || echo "NOT_FOUND"`;
  const cliCheck = await sshCommand(keyPath, instanceIp, checkCliPy);
  
  let userCheckCommand: string;
  if (cliCheck.output.includes('CLI_EXISTS')) {
    // v73+ - use cli.py
    userCheckCommand = `bash -c 'cd /opt/mailinabox && git config --global --add safe.directory /opt/mailinabox 2>/dev/null || true && sudo -n -u user-data /opt/mailinabox/management/cli.py user 2>/dev/null | grep -qi "${email}" && echo "EXISTS" || echo "NOT_FOUND'`;
  } else {
    // Older versions - use users.py
    userCheckCommand = `bash -c 'cd /opt/mailinabox && git config --global --add safe.directory /opt/mailinabox 2>/dev/null || true && sudo -n -u user-data /opt/mailinabox/management/users.py list 2>/dev/null | grep -qi "${email}" && echo "EXISTS" || echo "NOT_FOUND'`;
  }
  
  const result = await sshCommand(keyPath, instanceIp, userCheckCommand);
  return result.success && result.output.includes('EXISTS');
}

/**
 * Create user via management scripts
 */
async function createUser(
  keyPath: string,
  instanceIp: string,
  email: string,
  password: string,
  isAdmin: boolean,
  retryAttempts: number = 3
): Promise<{ success: boolean; message: string }> {
  // Detect which script to use
  const checkCliPy = `test -f /opt/mailinabox/management/cli.py && echo "CLI_EXISTS" || echo "NOT_FOUND"`;
  const checkUsersPy = `test -f /opt/mailinabox/management/users.py && echo "USERS_EXISTS" || echo "NOT_FOUND"`;
  
  const cliCheck = await sshCommand(keyPath, instanceIp, checkCliPy);
  const usersCheck = await sshCommand(keyPath, instanceIp, checkUsersPy);
  
  // Base64 encode to avoid shell quoting issues
  const emailB64 = Buffer.from(email).toString('base64');
  const passwordB64 = Buffer.from(password).toString('base64');
  
  for (let attempt = 0; attempt < retryAttempts; attempt++) {
    if (attempt > 0) {
      const backoff = Math.pow(2, attempt);
      console.log(`   Retry attempt ${attempt + 1}/${retryAttempts} (waiting ${backoff}s)...`);
      await new Promise((resolve) => setTimeout(resolve, backoff * 1000));
    }
    
    // Try cli.py first (v73+)
    if (cliCheck.output.includes('CLI_EXISTS')) {
      const adminFlag = isAdmin ? 'admin' : '';
      const createCommand = `bash -c 'export DEBIAN_FRONTEND=noninteractive && cd /opt/mailinabox && git config --global --add safe.directory /opt/mailinabox 2>/dev/null || true && EMAIL=\$(echo "${emailB64}" | base64 -d) && PASS=\$(echo "${passwordB64}" | base64 -d) && sudo -n -u user-data bash -c "cd /opt/mailinabox && /opt/mailinabox/management/cli.py user add \\\"\$EMAIL\\\" \\\"\$PASS\\\" ${adminFlag}" 2>&1'`;
      
      const result = await sshCommand(keyPath, instanceIp, createCommand);
      
      if (result.success) {
        // If admin flag wasn't used, add admin privileges separately
        if (isAdmin && !adminFlag) {
          const adminCommand = `bash -c 'cd /opt/mailinabox && git config --global --add safe.directory /opt/mailinabox 2>/dev/null || true && EMAIL=\$(echo "${emailB64}" | base64 -d) && sudo -n -u user-data bash -c "cd /opt/mailinabox && /opt/mailinabox/management/cli.py user make-admin \\\"\$EMAIL\\\"" 2>&1'`;
          await sshCommand(keyPath, instanceIp, adminCommand);
        }
        
        return { success: true, message: 'User created successfully via cli.py' };
      }
      
      // Check for API key errors
      if (result.output.includes('PermissionError') || result.output.includes('api.key')) {
        console.log(`   ⚠️  API key permission error on attempt ${attempt + 1}`);
        continue; // Retry
      }
    }
    
    // Try users.py (older versions)
    if (usersCheck.output.includes('USERS_EXISTS')) {
      const createCommand = `bash -c 'export DEBIAN_FRONTEND=noninteractive && cd /opt/mailinabox && git config --global --add safe.directory /opt/mailinabox 2>/dev/null || true && EMAIL=\$(echo "${emailB64}" | base64 -d) && PASS=\$(echo "${passwordB64}" | base64 -d) && sudo -n -u user-data bash -c "cd /opt/mailinabox && /opt/mailinabox/management/users.py add \\\"\$EMAIL\\\" \\\"\$PASS\\\"" 2>&1'`;
      
      const result = await sshCommand(keyPath, instanceIp, createCommand);
      
      if (result.success) {
        // Add admin privileges if needed
        if (isAdmin) {
          const adminCommand = `bash -c 'cd /opt/mailinabox && git config --global --add safe.directory /opt/mailinabox 2>/dev/null || true && EMAIL=\$(echo "${emailB64}" | base64 -d) && sudo -n -u user-data bash -c "cd /opt/mailinabox && /opt/mailinabox/management/users.py privileges add \\\"\$EMAIL\\\" admin" 2>&1'`;
          await sshCommand(keyPath, instanceIp, adminCommand);
        }
        
        return { success: true, message: 'User created successfully via users.py' };
      }
    }
  }
  
  return { success: false, message: `Failed after ${retryAttempts} attempts` };
}

/**
 * Generate random password
 */
function generateRandomPassword(length: number = 16): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const randomBytes = crypto.randomBytes(length);
  let password = '';
  for (let i = 0; i < length; i++) {
    password += chars[randomBytes[i] % chars.length];
  }
  return password;
}

/**
 * Store password in SSM
 */
async function storePasswordInSSM(
  email: string,
  password: string,
  stackName: string,
  region: string,
  profile?: string
): Promise<void> {
  const ssmClient = new SSMClient({
    region,
    credentials: profile ? fromIni({ profile }) : undefined,
  });
  
  const paramName = `/MailInABoxUserPassword-${stackName}-${email.replace(/[@.]/g, '-')}`;
  
  try {
    await ssmClient.send(
      new PutParameterCommand({
        Name: paramName,
        Value: password,
        Type: 'SecureString',
        Overwrite: true,
      })
    );
    console.log(`   Password stored in SSM: ${paramName}`);
  } catch (error) {
    console.warn(`   Warning: Failed to store password in SSM: ${String(error)}`);
  }
}

/**
 * Create multiple users
 */
async function createMultipleUsers(options: CreateMultipleUsersOptions): Promise<void> {
  const region = options.region || process.env.AWS_REGION || 'us-east-1';
  const profile = options.profile || process.env.AWS_PROFILE || 'hepe-admin-mfa';
  const appPath = options.appPath || 'apps/cdk-emc-notary/instance';
  const appPath = options.appPath || process.env.APP_PATH || 'apps/cdk-emc-notary/instance';
  const domain = options.domain || process.env.DOMAIN;
  
  if (!domain && !appPath) {
    throw new Error('Cannot resolve domain. Provide domain or appPath');
  }
  const waitForApiKey = options.waitForApiKey !== false;
  const retryAttempts = options.retryAttempts || 3;
  
  console.log('👥 Create Multiple Users');
  console.log(`   Domain: ${domain}`);
  console.log(`   Region: ${region}`);
  console.log(`   Profile: ${profile}\n`);
  
  // Parse users JSON
  let users: UserInput[];
  try {
    if (fs.existsSync(options.users)) {
      // File path
      const content = fs.readFileSync(options.users, 'utf8');
      users = JSON.parse(content);
    } else {
      // Inline JSON
      users = JSON.parse(options.users);
    }
    
    if (!Array.isArray(users)) {
      throw new Error('Users must be an array');
    }
  } catch (error) {
    throw new Error(`Failed to parse users: ${String(error)}`);
  }
  
  // Parse admin users list
  const adminEmails = new Set<string>();
  if (options.adminUsers) {
    options.adminUsers.split(',').forEach((email) => {
      adminEmails.add(email.trim().toLowerCase());
    });
  }
  
  // Get stack info
  console.log('📋 Step 1: Getting stack information...');
  const stackInfo = await getStackInfoFromApp(appPath, {
    domain,
    region,
    profile,
  });
  
  if (!stackInfo.instanceId || !stackInfo.instancePublicIp) {
    throw new Error('Instance ID or IP not found in stack outputs');
  }
  
  const instanceIp = stackInfo.instancePublicIp;
  console.log(`✅ Found instance: ${stackInfo.instanceId}`);
  console.log(`   IP: ${instanceIp}\n`);
  
  // Get SSH key
  console.log('📋 Step 2: Getting SSH key...');
  const keyPath = await getSshKeyPath({
    appPath,
    domain,
    region,
    profile,
    ensureSetup: true,
  });
  
  if (!keyPath) {
    throw new Error('SSH key not found');
  }
  console.log(`✅ SSH key ready\n`);
  
  // Wait for API key if requested
  if (waitForApiKey) {
    console.log('📋 Step 3: Waiting for API key...');
    try {
      await waitForApiKey(keyPath, instanceIp);
    } catch (error) {
      throw new Error(`API key not available: ${String(error)}`);
    }
  }
  
  // Process each user
  console.log(`📋 Step 4: Processing ${users.length} users...\n`);
  const results: UserResult[] = [];
  
  for (const user of users) {
    const email = user.email.toLowerCase();
    const isAdmin = user.admin || adminEmails.has(email);
    const password = user.password || options.defaultPassword || generateRandomPassword();
    
    console.log(`Processing: ${email}${isAdmin ? ' (admin)' : ''}`);
    
    // Check if user exists
    const exists = await checkUserExists(keyPath, instanceIp, email);
    if (exists) {
      console.log(`   ⏭️  User already exists, skipping\n`);
      results.push({
        email,
        status: 'skipped',
        message: 'User already exists',
      });
      continue;
    }
    
    // Create user
    const createResult = await createUser(
      keyPath,
      instanceIp,
      email,
      password,
      isAdmin,
      retryAttempts
    );
    
    if (createResult.success) {
      console.log(`   ✅ ${createResult.message}\n`);
      
      // Store password in SSM if generated
      if (!user.password && !options.defaultPassword) {
        await storePasswordInSSM(email, password, stackInfo.stackName, region, profile);
      }
      
      results.push({
        email,
        status: 'success',
        message: createResult.message,
        password: !user.password && !options.defaultPassword ? password : undefined,
      });
    } else {
      console.log(`   ❌ ${createResult.message}\n`);
      results.push({
        email,
        status: 'failed',
        message: createResult.message,
      });
    }
  }
  
  // Summary report
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📊 Summary Report');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  
  const successCount = results.filter((r) => r.status === 'success').length;
  const failedCount = results.filter((r) => r.status === 'failed').length;
  const skippedCount = results.filter((r) => r.status === 'skipped').length;
  
  console.log(`Total users: ${users.length}`);
  console.log(`✅ Success: ${successCount}`);
  console.log(`⏭️  Skipped: ${skippedCount}`);
  console.log(`❌ Failed: ${failedCount}\n`);
  
  if (failedCount > 0) {
    console.log('Failed users:');
    results
      .filter((r) => r.status === 'failed')
      .forEach((r) => {
        console.log(`  - ${r.email}: ${r.message}`);
      });
    console.log('');
  }
  
  if (successCount > 0) {
    const usersWithPasswords = results.filter((r) => r.password);
    if (usersWithPasswords.length > 0) {
      console.log('Generated passwords (stored in SSM):');
      usersWithPasswords.forEach((r) => {
        console.log(`  - ${r.email}: ${r.password}`);
      });
      console.log('');
    }
  }
}

/**
 * Main function
 */
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const options: CreateMultipleUsersOptions = {
    users: '',
    waitForApiKey: true,
    retryAttempts: 3,
  };
  
  // Parse arguments
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    if (arg === '--users' && args[i + 1]) {
      options.users = args[i + 1];
      i++;
    } else if (arg === '--domain' && args[i + 1]) {
      options.domain = args[i + 1];
      i++;
    } else if (arg === '--default-password' && args[i + 1]) {
      options.defaultPassword = args[i + 1];
      i++;
    } else if (arg === '--admin-users' && args[i + 1]) {
      options.adminUsers = args[i + 1];
      i++;
    } else if (arg === '--wait-for-api-key') {
      options.waitForApiKey = args[i + 1] !== 'false';
      i++;
    } else if (arg === '--retry-attempts' && args[i + 1]) {
      options.retryAttempts = parseInt(args[i + 1], 10);
      i++;
    }
  }
  
  // Validate required options
  if (!options.users) {
    console.error('Error: --users is required (JSON file path or inline JSON array)');
    process.exit(1);
  }
  
  try {
    await createMultipleUsers(options);
  } catch (error) {
    console.error(`\n❌ Error: ${String(error)}`);
    if (error instanceof Error && error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

// Run if executed directly
if (require.main === module) {
  main().catch((error) => {
    console.error('Unhandled error:', error);
    process.exit(1);
  });
}


