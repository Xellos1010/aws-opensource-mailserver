#!/usr/bin/env ts-node

import { getStackInfoFromApp } from '@mm/admin-stack-info';
import { getSshKeyPath } from '@mm/admin-ssh';
import { spawn } from 'child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import * as crypto from 'node:crypto';

interface RestoreUsersAndMailboxesOptions {
  backupPath: string;
  domain?: string;
  appPath?: string;
  region?: string;
  profile?: string;
  defaultPassword?: string;
  skipUsers?: boolean;
  skipMailboxes?: boolean;
  waitForApiKey?: boolean;
  verifyAfterRestore?: boolean;
  dryRun?: boolean;
  backupFormat?: 'legacy' | 'new' | 'auto';
  extractTar?: boolean;
}

// Import functions from other tools (simplified versions)
// In a real implementation, these would be extracted to shared modules

/**
 * Execute SSH command
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
 * Discover users from mailbox backup (simplified)
 */
function discoverUsersFromBackup(backupPath: string, domain: string): Array<{ email: string; username: string }> {
  // Find domain subdirectory
  let domainPath: string | null = null;
  const entries = fs.readdirSync(backupPath, { withFileTypes: true });
  
  for (const entry of entries) {
    if (entry.isDirectory() && entry.name === domain) {
      domainPath = path.join(backupPath, entry.name);
      break;
    }
  }
  
  if (!domainPath) {
    return [];
  }
  
  // Find user directories
  const users: Array<{ email: string; username: string }> = [];
  const userEntries = fs.readdirSync(domainPath, { withFileTypes: true });
  
  for (const entry of userEntries) {
    if (entry.name.startsWith('.') || entry.name === '..') {
      continue;
    }
    
    if (entry.isDirectory()) {
      users.push({
        email: `${entry.name}@${domain}`,
        username: entry.name,
      });
    }
  }
  
  return users;
}

/**
 * Wait for API key
 */
async function waitForApiKey(
  keyPath: string,
  instanceIp: string,
  timeoutMs: number = 300000
): Promise<void> {
  const startTime = Date.now();
  const checkInterval = 10000;
  
  while (Date.now() - startTime < timeoutMs) {
    const checkCommand = `test -f /var/lib/mailinabox/api.key && test -r /var/lib/mailinabox/api.key && echo "AVAILABLE" || echo "NOT_AVAILABLE"`;
    const result = await sshCommand(keyPath, instanceIp, checkCommand);
    
    if (result.success && result.output === 'AVAILABLE') {
      return;
    }
    
    await new Promise((resolve) => setTimeout(resolve, checkInterval));
  }
  
  throw new Error(`API key not available after ${timeoutMs}ms timeout`);
}

/**
 * Check if user exists
 */
async function checkUserExists(
  keyPath: string,
  instanceIp: string,
  email: string
): Promise<boolean> {
  const checkCliPy = `test -f /opt/mailinabox/management/cli.py && echo "CLI_EXISTS" || echo "NOT_FOUND"`;
  const cliCheck = await sshCommand(keyPath, instanceIp, checkCliPy);
  
  let userCheckCommand: string;
  if (cliCheck.output.includes('CLI_EXISTS')) {
    userCheckCommand = `bash -c 'cd /opt/mailinabox && git config --global --add safe.directory /opt/mailinabox 2>/dev/null || true && sudo -n -u user-data /opt/mailinabox/management/cli.py user 2>/dev/null | grep -qi "${email}" && echo "EXISTS" || echo "NOT_FOUND'`;
  } else {
    userCheckCommand = `bash -c 'cd /opt/mailinabox && git config --global --add safe.directory /opt/mailinabox 2>/dev/null || true && sudo -n -u user-data /opt/mailinabox/management/users.py list 2>/dev/null | grep -qi "${email}" && echo "EXISTS" || echo "NOT_FOUND'`;
  }
  
  const result = await sshCommand(keyPath, instanceIp, userCheckCommand);
  return result.success && result.output.includes('EXISTS');
}

/**
 * Create user (simplified)
 */
async function createUser(
  keyPath: string,
  instanceIp: string,
  email: string,
  password: string,
  isAdmin: boolean
): Promise<{ success: boolean; message: string }> {
  const checkCliPy = `test -f /opt/mailinabox/management/cli.py && echo "CLI_EXISTS" || echo "NOT_FOUND"`;
  const cliCheck = await sshCommand(keyPath, instanceIp, checkCliPy);
  
  const emailB64 = Buffer.from(email).toString('base64');
  const passwordB64 = Buffer.from(password).toString('base64');
  
  if (cliCheck.output.includes('CLI_EXISTS')) {
    const adminFlag = isAdmin ? 'admin' : '';
    const createCommand = `bash -c 'export DEBIAN_FRONTEND=noninteractive && cd /opt/mailinabox && git config --global --add safe.directory /opt/mailinabox 2>/dev/null || true && EMAIL=\$(echo "${emailB64}" | base64 -d) && PASS=\$(echo "${passwordB64}" | base64 -d) && sudo -n -u user-data bash -c "cd /opt/mailinabox && /opt/mailinabox/management/cli.py user add \\\"\$EMAIL\\\" \\\"\$PASS\\\" ${adminFlag}" 2>&1'`;
    
    const result = await sshCommand(keyPath, instanceIp, createCommand);
    
    if (result.success) {
      return { success: true, message: 'User created successfully' };
    }
  }
  
  return { success: false, message: 'Failed to create user' };
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
 * Combined restore workflow
 */
async function restoreUsersAndMailboxes(options: RestoreUsersAndMailboxesOptions): Promise<void> {
  const region = options.region || process.env.AWS_REGION || 'us-east-1';
  const profile = options.profile || process.env.AWS_PROFILE || 'hepe-admin-mfa';
  const appPath = options.appPath || process.env.APP_PATH || 'apps/cdk-emc-notary/instance';
  const domain = options.domain || process.env.DOMAIN;
  
  if (!domain && !appPath) {
    throw new Error('Cannot resolve domain. Provide domain or appPath');
  }
  const skipUsers = options.skipUsers || false;
  const skipMailboxes = options.skipMailboxes || false;
  const shouldWaitForApiKey = options.waitForApiKey !== false;
  const verifyAfterRestore = options.verifyAfterRestore !== false;
  const dryRun = options.dryRun || false;
  
  console.log('🔄 Combined Restore: Users and Mailboxes');
  console.log(`   Domain: ${domain}`);
  console.log(`   Backup path: ${options.backupPath}`);
  console.log(`   Skip users: ${skipUsers ? 'Yes' : 'No'}`);
  console.log(`   Skip mailboxes: ${skipMailboxes ? 'Yes' : 'No'}`);
  console.log(`   Dry run: ${dryRun ? 'Yes' : 'No'}\n`);
  
  // Validate backup path
  if (!fs.existsSync(options.backupPath)) {
    throw new Error(`Backup path does not exist: ${options.backupPath}`);
  }
  
  // Handle tar.gz extraction if needed
  let workingPath = options.backupPath;
  let extractedDir: string | null = null;
  
  if (options.backupPath.endsWith('.tar.gz') && options.extractTar !== false) {
    const tempExtractDir = os.tmpdir();
    const extractDir = path.join(tempExtractDir, `extracted-${Date.now()}`);
    fs.mkdirSync(extractDir, { recursive: true });
    
    const { execSync } = require('child_process');
    execSync(`tar -xzf "${options.backupPath}" -C "${extractDir}"`, {
      stdio: 'inherit',
    });
    
    extractedDir = extractDir;
    workingPath = extractDir;
  }
  
  // Step 1: Discover users from backup
  console.log('📋 Step 1: Discovering users from mailbox backup...');
  const discoveredUsers = discoverUsersFromBackup(workingPath, domain);
  console.log(`✅ Discovered ${discoveredUsers.length} users\n`);
  
  if (discoveredUsers.length === 0) {
    console.log('No users found in backup');
    return;
  }
  
  // Step 2: Get stack info
  console.log('📋 Step 2: Getting stack information...');
  const stackInfo = await getStackInfoFromApp(appPath, {
    domain,
    region,
    profile,
  });
  
  if (!stackInfo.instanceId || !stackInfo.instancePublicIp) {
    throw new Error('Instance ID or IP not found');
  }
  
  const instanceIp = stackInfo.instancePublicIp;
  console.log(`✅ Found instance: ${stackInfo.instanceId}`);
  console.log(`   IP: ${instanceIp}\n`);
  
  // Step 3: Get SSH key
  console.log('📋 Step 3: Getting SSH key...');
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
  
  // Step 4: Wait for API key if creating users
  if (!skipUsers && shouldWaitForApiKey) {
    console.log('📋 Step 4: Waiting for API key...');
    try {
      await waitForApiKey(keyPath, instanceIp);
      console.log('✅ API key is available\n');
    } catch (error) {
      throw new Error(`API key not available: ${String(error)}`);
    }
  }
  
  // Step 5: Create users
  let usersCreated = 0;
  let usersSkipped = 0;
  let usersFailed = 0;
  
  if (!skipUsers) {
    console.log(`📋 Step 5: Creating ${discoveredUsers.length} users...\n`);
    
    const defaultPassword = options.defaultPassword || generateRandomPassword();
    
    for (const user of discoveredUsers) {
      console.log(`Processing: ${user.email}`);
      
      // Check if user exists
      const exists = await checkUserExists(keyPath, instanceIp, user.email);
      if (exists) {
        console.log(`   ⏭️  User already exists, skipping\n`);
        usersSkipped++;
        continue;
      }
      
      // Create user
      const createResult = await createUser(
        keyPath,
        instanceIp,
        user.email,
        defaultPassword,
        false // Not admin by default
      );
      
      if (createResult.success) {
        console.log(`   ✅ ${createResult.message}\n`);
        usersCreated++;
      } else {
        console.log(`   ❌ ${createResult.message}\n`);
        usersFailed++;
      }
    }
    
    console.log(`Users created: ${usersCreated}, skipped: ${usersSkipped}, failed: ${usersFailed}\n`);
  }
  
  // Step 6: Restore mailboxes (call restore-mailboxes tool logic)
  if (!skipMailboxes) {
    console.log(`📋 Step 6: Restoring mailboxes...\n`);
    
    // Call the restore-mailboxes tool via spawn to ensure proper execution
    const restoreMailboxes = spawn(
      'pnpm',
      [
        'exec',
        'tsx',
        '--tsconfig',
        'tools/tsconfig.json',
        'tools/restore-mailboxes.cli.ts',
        '--backup-path',
        workingPath,
        '--domain',
        domain,
        ...(verifyAfterRestore ? ['--verify-after-restore'] : []),
        ...(dryRun ? ['--dry-run'] : []),
      ],
      { stdio: 'inherit', shell: true }
    );
    
    await new Promise<void>((resolve, reject) => {
      restoreMailboxes.on('close', (code) => {
        if (code === 0) {
          console.log('   ✅ Mailbox restore completed\n');
          resolve();
        } else {
          reject(new Error(`Mailbox restore failed with code ${code}`));
        }
      });
      
      restoreMailboxes.on('error', (error) => {
        reject(new Error(`Mailbox restore error: ${error.message}`));
      });
    });
  }
  
  // Clean up extracted directory
  if (extractedDir && fs.existsSync(extractedDir)) {
    console.log(`Cleaning up extracted directory: ${extractedDir}`);
    fs.rmSync(extractedDir, { recursive: true, force: true });
  }
  
  // Summary report
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📊 Summary Report');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  
  console.log(`Total users discovered: ${discoveredUsers.length}`);
  if (!skipUsers) {
    console.log(`✅ Users created: ${usersCreated}`);
    console.log(`⏭️  Users skipped: ${usersSkipped}`);
    console.log(`❌ Users failed: ${usersFailed}`);
  }
  if (!skipMailboxes) {
    console.log(`📦 Mailboxes: Restored via restore-mailboxes.cli.ts`);
  }
}

/**
 * Main function
 */
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const options: RestoreUsersAndMailboxesOptions = {
    backupPath: '',
    waitForApiKey: true,
    verifyAfterRestore: true,
    extractTar: true,
    backupFormat: 'auto',
  };
  
  // Parse arguments
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    if (arg === '--backup-path' && args[i + 1]) {
      options.backupPath = args[i + 1];
      i++;
    } else if (arg === '--domain' && args[i + 1]) {
      options.domain = args[i + 1];
      i++;
    } else if (arg === '--default-password' && args[i + 1]) {
      options.defaultPassword = args[i + 1];
      i++;
    } else if (arg === '--skip-users') {
      options.skipUsers = true;
    } else if (arg === '--skip-mailboxes') {
      options.skipMailboxes = true;
    } else if (arg === '--wait-for-api-key') {
      options.waitForApiKey = args[i + 1] !== 'false';
      i++;
    } else if (arg === '--verify-after-restore') {
      options.verifyAfterRestore = args[i + 1] !== 'false';
      i++;
    } else if (arg === '--dry-run') {
      options.dryRun = true;
    } else if (arg === '--backup-format' && args[i + 1]) {
      options.backupFormat = args[i + 1] as 'legacy' | 'new' | 'auto';
      i++;
    } else if (arg === '--extract-tar') {
      options.extractTar = args[i + 1] !== 'false';
      i++;
    }
  }
  
  // Validate required options
  if (!options.backupPath) {
    console.error('Error: --backup-path is required');
    process.exit(1);
  }
  
  try {
    await restoreUsersAndMailboxes(options);
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

