#!/usr/bin/env ts-node

import { getStackInfoFromApp } from '@mm/admin-stack-info';
import { getSshKeyPath } from '@mm/admin-ssh';
import { spawn, execSync } from 'child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

interface RestoreMailboxesOptions {
  backupPath: string;
  domain?: string;
  appPath?: string;
  region?: string;
  profile?: string;
  dryRun?: boolean;
  restartServices?: boolean;
  verifyAfterRestore?: boolean;
  parallelUploads?: number;
  extractTar?: boolean;
  tempDir?: string;
  backupFormat?: 'legacy' | 'new' | 'auto';
}

interface MailboxRestoreResult {
  mailbox: string;
  status: 'success' | 'failed' | 'skipped';
  message: string;
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
 * Detect backup format
 */
function detectBackupFormat(backupPath: string): 'legacy' | 'new' {
  const stat = fs.statSync(backupPath);
  
  if (stat.isDirectory()) {
    if (backupPath.includes('mailboxes-backup-')) {
      return 'legacy';
    }
    
    const dirName = path.basename(backupPath);
    if (/^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z-\w+$/.test(dirName)) {
      return 'new';
    }
    
    const parentDir = path.dirname(backupPath);
    if (parentDir.includes('mailboxes-backup-')) {
      return 'legacy';
    }
    if (parentDir.match(/\/mail\/\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z-\w+$/)) {
      return 'new';
    }
  }
  
  return 'new'; // Default
}

/**
 * Extract tar.gz file
 */
async function extractTarGz(tarPath: string, tempDir: string): Promise<string> {
  console.log(`Extracting ${tarPath}...`);
  
  const extractDir = path.join(tempDir, `extracted-${Date.now()}`);
  fs.mkdirSync(extractDir, { recursive: true });
  
  try {
    execSync(`tar -xzf "${tarPath}" -C "${extractDir}"`, {
      stdio: 'inherit',
    });
    return extractDir;
  } catch (error) {
    throw new Error(`Failed to extract tar.gz: ${String(error)}`);
  }
}

/**
 * Auto-detect domain from backup path
 */
function detectDomain(backupPath: string): string | null {
  const parts = backupPath.split(path.sep);
  
  for (const part of parts) {
    if (part.includes('.com') || part.includes('.org') || part.includes('.net')) {
      return part;
    }
  }
  
  let currentPath = backupPath;
  for (let i = 0; i < 5; i++) {
    const parent = path.dirname(currentPath);
    const parentName = path.basename(parent);
    if (parentName.includes('.com') || parentName.includes('.org') || parentName.includes('.net')) {
      return parentName;
    }
    currentPath = parent;
    if (currentPath === '/' || currentPath === parent) {
      break;
    }
  }
  
  return null;
}

/**
 * Validate Maildir structure
 */
function validateMaildir(mailboxPath: string): boolean {
  try {
    const curDir = path.join(mailboxPath, 'cur');
    const newDir = path.join(mailboxPath, 'new');
    const tmpDir = path.join(mailboxPath, 'tmp');
    
    return (
      fs.existsSync(curDir) &&
      fs.statSync(curDir).isDirectory() &&
      fs.existsSync(newDir) &&
      fs.statSync(newDir).isDirectory() &&
      fs.existsSync(tmpDir) &&
      fs.statSync(tmpDir).isDirectory()
    );
  } catch {
    return false;
  }
}

/**
 * Find mailbox directories in backup
 */
function findMailboxDirectories(
  backupPath: string,
  domain: string,
  format: 'legacy' | 'new'
): Array<{ username: string; path: string }> {
  let domainPath: string | null = null;
  
  // Find domain subdirectory
  const entries = fs.readdirSync(backupPath, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory() && entry.name === domain) {
      domainPath = path.join(backupPath, entry.name);
      break;
    }
  }
  
  if (!domainPath || !fs.existsSync(domainPath)) {
    throw new Error(`Domain subdirectory not found: ${domain}`);
  }
  
  // Find user directories
  const mailboxes: Array<{ username: string; path: string }> = [];
  const userEntries = fs.readdirSync(domainPath, { withFileTypes: true });
  
  for (const entry of userEntries) {
    if (entry.name.startsWith('.') || entry.name === '..') {
      continue;
    }
    
    if (!entry.isDirectory()) {
      continue;
    }
    
    const mailboxPath = path.join(domainPath, entry.name);
    
    // Validate Maildir structure
    if (!validateMaildir(mailboxPath)) {
      console.warn(`Warning: Invalid Maildir structure for ${entry.name}, skipping...`);
      continue;
    }
    
    mailboxes.push({
      username: entry.name,
      path: mailboxPath,
    });
  }
  
  return mailboxes;
}

/**
 * Upload mailbox via rsync
 */
async function uploadMailbox(
  keyPath: string,
  instanceIp: string,
  localPath: string,
  remotePath: string,
  dryRun: boolean
): Promise<{ success: boolean; message: string }> {
  if (dryRun) {
    console.log(`   [DRY RUN] Would upload ${localPath} to ${remotePath}`);
    return { success: true, message: 'Dry run - no upload performed' };
  }
  
  return new Promise((resolve) => {
    const rsyncArgs = [
      '-avz',
      '--progress',
      '-e',
      `ssh -i ${keyPath} -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o LogLevel=ERROR`,
      `${localPath}/`,
      `ubuntu@${instanceIp}:${remotePath}/`,
    ];
    
    const rsync = spawn('rsync', rsyncArgs);
    
    let output = '';
    let error = '';
    
    rsync.stdout.on('data', (data) => {
      output += data.toString();
    });
    
    rsync.stderr.on('data', (data) => {
      error += data.toString();
    });
    
    rsync.on('close', (code) => {
      if (code === 0) {
        resolve({ success: true, message: 'Upload successful' });
      } else {
        resolve({
          success: false,
          message: `rsync failed with code ${code}: ${error || output}`,
        });
      }
    });
    
    rsync.on('error', (err) => {
      resolve({
        success: false,
        message: `rsync error: ${err.message}`,
      });
    });
  });
}

/**
 * Set mailbox ownership and permissions
 */
async function setMailboxPermissions(
  keyPath: string,
  instanceIp: string,
  remotePath: string,
  dryRun: boolean
): Promise<void> {
  if (dryRun) {
    console.log(`   [DRY RUN] Would set permissions for ${remotePath}`);
    return;
  }
  
  const commands = [
    `sudo chown -R mail:mail ${remotePath}`,
    `sudo find ${remotePath} -type d -exec chmod 755 {} \\;`,
    `sudo find ${remotePath} -type f -exec chmod 644 {} \\;`,
  ];
  
  for (const command of commands) {
    const result = await sshCommand(keyPath, instanceIp, command);
    if (!result.success) {
      console.warn(`Warning: Failed to set permissions: ${result.error || result.output}`);
    }
  }
}

/**
 * Restart mail services
 */
async function restartMailServices(
  keyPath: string,
  instanceIp: string,
  dryRun: boolean
): Promise<void> {
  if (dryRun) {
    console.log('   [DRY RUN] Would restart mail services');
    return;
  }
  
  const commands = [
    'sudo systemctl restart dovecot',
    'sudo systemctl restart postfix',
  ];
  
  for (const command of commands) {
    const result = await sshCommand(keyPath, instanceIp, command);
    if (!result.success) {
      console.warn(`Warning: Failed to restart service: ${result.error || result.output}`);
    }
  }
  
  console.log('✅ Mail services restarted');
}

/**
 * Verify mailbox accessibility
 */
async function verifyMailbox(
  keyPath: string,
  instanceIp: string,
  domain: string,
  username: string
): Promise<boolean> {
  const remotePath = `/home/user-data/mail/mailboxes/${domain}/${username}`;
  const checkCommand = `test -d ${remotePath} && test -d ${remotePath}/cur && test -d ${remotePath}/new && echo "VALID" || echo "INVALID"`;
  
  const result = await sshCommand(keyPath, instanceIp, checkCommand);
  return result.success && result.output === 'VALID';
}

/**
 * Restore mailboxes
 */
async function restoreMailboxes(options: RestoreMailboxesOptions): Promise<void> {
  const region = options.region || process.env.AWS_REGION || 'us-east-1';
  const profile = options.profile || process.env.AWS_PROFILE || 'hepe-admin-mfa';
  const appPath = options.appPath || 'apps/cdk-emc-notary/instance';
  const appPath = options.appPath || process.env.APP_PATH || 'apps/cdk-emc-notary/instance';
  const domain = options.domain || process.env.DOMAIN;
  
  if (!domain && !appPath) {
    throw new Error('Cannot resolve domain. Provide domain or appPath');
  }
  const dryRun = options.dryRun || false;
  const restartServices = options.restartServices !== false;
  const verifyAfterRestore = options.verifyAfterRestore !== false;
  const extractTar = options.extractTar !== false;
  
  console.log('📦 Restore Mailboxes');
  console.log(`   Domain: ${domain}`);
  console.log(`   Backup path: ${options.backupPath}`);
  console.log(`   Dry run: ${dryRun ? 'Yes' : 'No'}\n`);
  
  // Validate backup path
  if (!fs.existsSync(options.backupPath)) {
    throw new Error(`Backup path does not exist: ${options.backupPath}`);
  }
  
  // Detect backup format
  let format = options.backupFormat || 'auto';
  if (format === 'auto') {
    format = detectBackupFormat(options.backupPath);
  }
  console.log(`Detected backup format: ${format}`);
  
  // Handle tar.gz extraction
  let workingPath = options.backupPath;
  let extractedDir: string | null = null;
  
  if (options.backupPath.endsWith('.tar.gz') && extractTar) {
    const tempExtractDir = options.tempDir || os.tmpdir();
    extractedDir = await extractTarGz(options.backupPath, tempExtractDir);
    workingPath = extractedDir;
  }
  
  // Auto-detect domain if not provided
  let detectedDomain = domain;
  if (!detectedDomain) {
    detectedDomain = detectDomain(workingPath) || null;
    if (!detectedDomain) {
      throw new Error('Domain not provided and could not be auto-detected');
    }
    console.log(`Auto-detected domain: ${detectedDomain}`);
  }
  
  // Find mailbox directories
  console.log('Scanning for mailbox directories...');
  const mailboxes = findMailboxDirectories(workingPath, detectedDomain, format);
  console.log(`Found ${mailboxes.length} mailboxes\n`);
  
  if (mailboxes.length === 0) {
    console.log('No mailboxes found to restore');
    return;
  }
  
  // Get stack info
  console.log('📋 Step 1: Getting stack information...');
  const stackInfo = await getStackInfoFromApp(appPath, {
    domain: detectedDomain,
    region,
    profile,
  });
  
  if (!stackInfo.instanceId || !stackInfo.instancePublicIp) {
    throw new Error('Instance ID or IP not found');
  }
  
  const instanceIp = stackInfo.instancePublicIp;
  console.log(`✅ Found instance: ${stackInfo.instanceId}`);
  console.log(`   IP: ${instanceIp}\n`);
  
  // Get SSH key
  console.log('📋 Step 2: Getting SSH key...');
  const keyPath = await getSshKeyPath({
    appPath,
    domain: detectedDomain,
    region,
    profile,
    ensureSetup: true,
  });
  
  if (!keyPath) {
    throw new Error('SSH key not found');
  }
  console.log(`✅ SSH key ready\n`);
  
  // Restore mailboxes
  console.log(`📋 Step 3: Restoring ${mailboxes.length} mailboxes...\n`);
  const results: MailboxRestoreResult[] = [];
  
  for (const mailbox of mailboxes) {
    const email = `${mailbox.username}@${detectedDomain}`;
    const remotePath = `/home/user-data/mail/mailboxes/${detectedDomain}/${mailbox.username}`;
    
    console.log(`Restoring: ${email}`);
    
    // Create remote directory
    if (!dryRun) {
      const mkdirCommand = `sudo mkdir -p ${remotePath}`;
      const mkdirResult = await sshCommand(keyPath, instanceIp, mkdirCommand);
      if (!mkdirResult.success) {
        console.log(`   ❌ Failed to create directory: ${mkdirResult.error || mkdirResult.output}\n`);
        results.push({
          mailbox: email,
          status: 'failed',
          message: `Failed to create directory: ${mkdirResult.error || mkdirResult.output}`,
        });
        continue;
      }
    }
    
    // Upload mailbox
    const uploadResult = await uploadMailbox(
      keyPath,
      instanceIp,
      mailbox.path,
      remotePath,
      dryRun
    );
    
    if (!uploadResult.success) {
      console.log(`   ❌ ${uploadResult.message}\n`);
      results.push({
        mailbox: email,
        status: 'failed',
        message: uploadResult.message,
      });
      continue;
    }
    
    // Set permissions
    await setMailboxPermissions(keyPath, instanceIp, remotePath, dryRun);
    
    // Verify if requested
    if (verifyAfterRestore && !dryRun) {
      const isValid = await verifyMailbox(keyPath, instanceIp, detectedDomain, mailbox.username);
      if (!isValid) {
        console.log(`   ⚠️  Verification failed\n`);
        results.push({
          mailbox: email,
          status: 'failed',
          message: 'Verification failed after restore',
        });
        continue;
      }
    }
    
    console.log(`   ✅ Restored successfully\n`);
    results.push({
      mailbox: email,
      status: 'success',
      message: 'Restored successfully',
    });
  }
  
  // Restart services if requested
  if (restartServices && !dryRun && results.some((r) => r.status === 'success')) {
    console.log('📋 Step 4: Restarting mail services...');
    await restartMailServices(keyPath, instanceIp, dryRun);
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
  
  const successCount = results.filter((r) => r.status === 'success').length;
  const failedCount = results.filter((r) => r.status === 'failed').length;
  
  console.log(`Total mailboxes: ${mailboxes.length}`);
  console.log(`✅ Success: ${successCount}`);
  console.log(`❌ Failed: ${failedCount}\n`);
  
  if (failedCount > 0) {
    console.log('Failed mailboxes:');
    results
      .filter((r) => r.status === 'failed')
      .forEach((r) => {
        console.log(`  - ${r.mailbox}: ${r.message}`);
      });
  }
}

/**
 * Main function
 */
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const options: RestoreMailboxesOptions = {
    backupPath: '',
    restartServices: true,
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
    } else if (arg === '--dry-run') {
      options.dryRun = true;
    } else if (arg === '--restart-services') {
      options.restartServices = args[i + 1] !== 'false';
      i++;
    } else if (arg === '--verify-after-restore') {
      options.verifyAfterRestore = args[i + 1] !== 'false';
      i++;
    } else if (arg === '--extract-tar') {
      options.extractTar = args[i + 1] !== 'false';
      i++;
    } else if (arg === '--temp-dir' && args[i + 1]) {
      options.tempDir = args[i + 1];
      i++;
    } else if (arg === '--backup-format' && args[i + 1]) {
      options.backupFormat = args[i + 1] as 'legacy' | 'new' | 'auto';
      i++;
    }
  }
  
  // Validate required options
  if (!options.backupPath) {
    console.error('Error: --backup-path is required');
    process.exit(1);
  }
  
  try {
    await restoreMailboxes(options);
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


