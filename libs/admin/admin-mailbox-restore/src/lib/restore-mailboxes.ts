/**
 * Restore Mailboxes to Mail-in-a-Box Server
 * 
 * This module handles restoring aggregated users and mailboxes to the server,
 * skipping existing users and emails.
 */

import { sshCommand } from '@mm/admin-account';
import { AggregatedUser } from './aggregate-backups';
import { spawn } from 'child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';

export interface RestoreMailboxesOptions {
  /** SSH key path */
  keyPath: string;
  /** Instance IP address */
  instanceIp: string;
  /** Domain name */
  domain: string;
  /** Aggregated users to restore */
  users: Map<string, AggregatedUser>;
  /** Admin password (for admin@domain account) */
  adminPassword?: string;
  /** Admin email (for HTTP API authentication) */
  adminEmail?: string;
  /** Base URL for HTTP API (e.g., https://box.domain.com) */
  baseUrl?: string;
  /** Generate passwords for users */
  generatePasswords?: boolean;
  /** Skip user creation if user already exists */
  skipExistingUsers?: boolean;
  /** Skip emails that already exist on server */
  skipExistingEmails?: boolean;
  /** Dry run mode */
  dryRun?: boolean;
}

export interface RestoreResult {
  /** User email */
  email: string;
  /** User creation status */
  userCreated: boolean;
  /** User creation message */
  userMessage: string;
  /** Emails restored */
  emailsRestored: number;
  /** Emails skipped */
  emailsSkipped: number;
  /** Total emails processed */
  totalEmails: number;
  /** Success status */
  success: boolean;
  /** Error message if failed */
  error?: string;
}

/**
 * Check if user exists on server
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
    userCheckCommand = `bash -c 'cd /opt/mailinabox && git config --global --add safe.directory /opt/mailinabox 2>/dev/null || true && sudo -n -u user-data /opt/mailinabox/management/cli.py user 2>/dev/null | grep -i "${email}" || echo "not found"'`;
  } else {
    userCheckCommand = `bash -c 'cd /opt/mailinabox && git config --global --add safe.directory /opt/mailinabox 2>/dev/null || true && sudo -n -u user-data /opt/mailinabox/management/users.py list 2>/dev/null | grep -i "${email}" || echo "not found"'`;
  }
  
  const result = await sshCommand(keyPath, instanceIp, userCheckCommand);
  return result.success && 
         result.output.toLowerCase().includes(email.toLowerCase()) && 
         result.output !== 'not found';
}

/**
 * Create user via HTTP API (fallback when SSH fails)
 */
async function createUserViaHttpApi(
  baseUrl: string,
  adminEmail: string,
  adminPassword: string,
  email: string,
  password: string
): Promise<{ success: boolean; message: string }> {
  try {
    const auth = Buffer.from(`${adminEmail}:${adminPassword}`).toString('base64');
    const params = new URLSearchParams();
    params.append('email', email);
    params.append('password', password);
    
    const response = await fetch(`${baseUrl}/admin/mail/users/add`, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
      // @ts-expect-error - allow self-signed certificates
      rejectUnauthorized: false,
    });
    
    const responseText = await response.text();
    
    if (response.status === 200) {
      return { success: true, message: 'User created successfully via HTTP API' };
    } else if (responseText.includes('already exists') || responseText.includes('already a mail user')) {
      return { success: true, message: 'User already exists' };
    } else {
      return { success: false, message: `HTTP ${response.status}: ${responseText.substring(0, 200)}` };
    }
  } catch (error) {
    return { success: false, message: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * Create user on server via HTTP API (primary method for proper webmail setup)
 * Falls back to SSH/CLI only if HTTP API is unavailable
 */
async function createUser(
  keyPath: string,
  instanceIp: string,
  email: string,
  password: string,
  retryAttempts: number = 3,
  baseUrl?: string,
  adminEmail?: string,
  adminPassword?: string
): Promise<{ success: boolean; message: string }> {
  // Prefer HTTP API as primary method (ensures proper webmail setup)
  if (baseUrl && adminEmail && adminPassword) {
    console.log(`   Using HTTP API for user creation (ensures proper webmail setup)...`);
    return await createUserViaHttpApi(baseUrl, adminEmail, adminPassword, email, password);
  }
  
  // Fallback to SSH/CLI if HTTP API credentials not provided
  console.log(`   HTTP API credentials not available, falling back to SSH/CLI...`);
  let sshFailed = false;
  
  try {
  // Fix API key permissions
  await sshCommand(keyPath, instanceIp, 'sudo chmod 644 /var/lib/mailinabox/api.key 2>/dev/null && sudo chown user-data:user-data /var/lib/mailinabox/api.key 2>/dev/null || true');
  
  const checkCliPy = `test -f /opt/mailinabox/management/cli.py && echo "CLI_EXISTS" || echo "NOT_FOUND"`;
  const cliCheck = await sshCommand(keyPath, instanceIp, checkCliPy);
  
  const emailB64 = Buffer.from(email).toString('base64');
  const passwordB64 = Buffer.from(password).toString('base64');
    
    // Retry logic matching bootstrap script
    for (let retryCount = 0; retryCount < retryAttempts; retryCount++) {
      // Add delay between retries (exponential backoff)
      if (retryCount > 0) {
        const backoffSeconds = Math.pow(2, retryCount - 1);
        console.log(`   Retrying user creation (attempt ${retryCount + 1}/${retryAttempts}) after ${backoffSeconds}s delay...`);
        await new Promise(resolve => setTimeout(resolve, backoffSeconds * 1000));
      }
  
  let createCommand: string;
  if (cliCheck.output.includes('CLI_EXISTS')) {
        // Use cli.py (v73+) - matching bootstrap script line 463
    createCommand = `bash -c 'cd /opt/mailinabox && git config --global --add safe.directory /opt/mailinabox 2>/dev/null || true && EMAIL=\$(echo "${emailB64}" | base64 -d) && PASS=\$(echo "${passwordB64}" | base64 -d) && sudo -n -u user-data bash -c "cd /opt/mailinabox && /opt/mailinabox/management/cli.py user add \\\"\$EMAIL\\\" \\\"\$PASS\\\"" 2>&1'`;
  } else {
        // Use users.py (older versions) - matching bootstrap script line 476
    createCommand = `bash -c 'cd /opt/mailinabox && git config --global --add safe.directory /opt/mailinabox 2>/dev/null || true && EMAIL=\$(echo "${emailB64}" | base64 -d) && PASS=\$(echo "${passwordB64}" | base64 -d) && sudo -n -u user-data bash -c "cd /opt/mailinabox && /opt/mailinabox/management/users.py add \\\"\$EMAIL\\\" \\\"\$PASS\\\"" 2>&1'`;
  }
  
  const result = await sshCommand(keyPath, instanceIp, createCommand);
  
  if (result.success) {
        return { success: true, message: 'User created successfully via SSH/CLI' };
      }
      
      // If connection refused, mark SSH as failed
      if (result.error?.includes('Connection refused') || result.error?.includes('connect to host')) {
        console.log(`   SSH connection refused...`);
        sshFailed = true;
        break;
      }
      
      // If user already exists, that's success
      if (result.output?.includes('already exists') || result.output?.includes('already a mail user')) {
        return { success: true, message: 'User already exists' };
      }
    }
  } catch (error) {
    sshFailed = true;
  }
  
  return { success: false, message: `Failed after ${retryAttempts} SSH attempts${sshFailed ? ' (SSH connection refused)' : ''}` };
}

/**
 * Check if email file exists on server
 */
async function checkEmailExists(
  keyPath: string,
  instanceIp: string,
  domain: string,
  username: string,
  emailHash: string
): Promise<boolean> {
  // Check if email exists by checking for files with similar hash in mailbox
  const mailboxPath = `/home/user-data/mail/mailboxes/${domain}/${username}`;
  const checkCommand = `sudo -u user-data test -d "${mailboxPath}" && echo "EXISTS" || echo "NOT_EXISTS"`;
  
  const result = await sshCommand(keyPath, instanceIp, checkCommand);
  if (!result.success || result.output !== 'EXISTS') {
    return false;
  }
  
  // For now, we'll skip detailed email checking and rely on rsync's --ignore-existing
  // This is more efficient than checking each individual email
  return false;
}

/**
 * Upload mailbox emails using rsync
 */
async function uploadMailboxEmails(
  keyPath: string,
  instanceIp: string,
  domain: string,
  username: string,
  emailFiles: Array<{ path: string; hash: string }>,
  dryRun: boolean
): Promise<{ restored: number; skipped: number }> {
  // Create temporary staging directory
  const stagingDir = path.join(require('os').tmpdir(), `mailbox-restore-${Date.now()}-${username}`);
  
  try {
    // Create staging directory structure
    fs.mkdirSync(stagingDir, { recursive: true });
    const curDir = path.join(stagingDir, 'cur');
    const newDir = path.join(stagingDir, 'new');
    const tmpDir = path.join(stagingDir, 'tmp');
    fs.mkdirSync(curDir, { recursive: true });
    fs.mkdirSync(newDir, { recursive: true });
    fs.mkdirSync(tmpDir, { recursive: true });
    
    // Copy email files to staging directory (preserve subdirectory structure)
    let restored = 0;
    let skipped = 0;
    
    for (const emailFile of emailFiles) {
      const sourcePath = emailFile.path;
      const filename = path.basename(sourcePath);
      const subdir = path.basename(path.dirname(sourcePath)); // cur, new, or tmp
      
      const destDir = path.join(stagingDir, subdir);
      const destPath = path.join(destDir, filename);
      
      try {
        fs.copyFileSync(sourcePath, destPath);
        restored++;
      } catch (error) {
        skipped++;
        continue;
      }
    }
    
    if (restored === 0) {
      return { restored: 0, skipped };
    }
    
    // Upload staging directory to server using rsync
    const remotePath = `/home/user-data/mail/mailboxes/${domain}/${username}`;
    
    // Create remote directory if it doesn't exist
    if (!dryRun) {
      const mkdirCommand = `sudo mkdir -p "${remotePath}" && sudo chown -R user-data:user-data "${remotePath}" && sudo chmod -R 700 "${remotePath}"`;
      await sshCommand(keyPath, instanceIp, mkdirCommand);
    }
    
    // Use rsync to upload emails (--ignore-existing skips files that already exist)
    const rsyncArgs = [
      '-avz',
      '--ignore-existing', // Skip files that already exist
      '--delete', // Remove files from destination that don't exist in source
      '--exclude=dovecot-*', // Exclude dovecot index files
      '--exclude=dovecot.index*',
      '--exclude=subscriptions',
      '--exclude=maildirfolder',
      `${stagingDir}/`,
      `-e`,
      `ssh -i ${keyPath} -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o ConnectTimeout=10`,
      `ubuntu@${instanceIp}:${remotePath}/`,
    ];
    
    if (dryRun) {
      rsyncArgs.push('--dry-run');
    }
    
    return new Promise((resolve) => {
      const rsync = spawn('rsync', rsyncArgs);
      
      let output = '';
      rsync.stdout.on('data', (data) => {
        output += data.toString();
      });
      
      rsync.stderr.on('data', (data) => {
        output += data.toString();
      });
      
      rsync.on('close', (code) => {
        // Count files from rsync output
        const filesTransferred = (output.match(/^\S+\s+\d+\s+\d+%/) || []).length;
        resolve({ restored: filesTransferred, skipped: restored - filesTransferred });
      });
      
      rsync.on('error', () => {
        resolve({ restored: 0, skipped });
      });
    });
  } finally {
    // Clean up staging directory
    if (fs.existsSync(stagingDir)) {
      fs.rmSync(stagingDir, { recursive: true, force: true });
    }
  }
}

/**
 * Generate random password
 */
function generatePassword(length: number = 16): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let password = '';
  for (let i = 0; i < length; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return password;
}

/**
 * Restore mailboxes for aggregated users
 */
export async function restoreMailboxes(
  options: RestoreMailboxesOptions
): Promise<Map<string, RestoreResult>> {
  const results = new Map<string, RestoreResult>();
  const {
    keyPath,
    instanceIp,
    domain,
    users,
    adminPassword,
    adminEmail = `admin@${domain}`,
    baseUrl = `https://box.${domain}`,
    generatePasswords = true,
    skipExistingUsers = true,
    skipExistingEmails = true,
    dryRun = false,
  } = options;
  
  // Process users sequentially with delays to avoid SSH connection limits
  const userEntries = Array.from(users.entries());
  for (let i = 0; i < userEntries.length; i++) {
    const [email, user] = userEntries[i];
    
    // Add delay between users (except first one)
    if (i > 0) {
      await new Promise(resolve => setTimeout(resolve, 3000));
    }
    const result: RestoreResult = {
      email,
      userCreated: false,
      userMessage: '',
      emailsRestored: 0,
      emailsSkipped: 0,
      totalEmails: user.emailCount,
      success: false,
    };
    
    try {
      // Check if user exists
      const userExists = await checkUserExists(keyPath, instanceIp, email);
      
      if (userExists && skipExistingUsers) {
        result.userMessage = 'User already exists, skipping creation';
        result.userCreated = false;
      } else if (!userExists) {
        // Generate or use password
        let password: string;
        if (email === `admin@${domain}` && adminPassword) {
          password = adminPassword;
        } else if (generatePasswords) {
          password = generatePassword();
        } else {
          result.error = 'Password required but not provided and generation disabled';
          results.set(email, result);
          continue;
        }
        
        // Create user (with retry logic matching bootstrap script, HTTP API fallback)
        const createResult = await createUser(
          keyPath, 
          instanceIp, 
          email, 
          password, 
          3,
          baseUrl,
          adminEmail,
          adminPassword
        );
        result.userCreated = createResult.success;
        result.userMessage = createResult.message;
        
        if (!createResult.success) {
          result.error = createResult.message;
          results.set(email, result);
          continue;
        }
        
        // Add small delay after user creation to avoid connection limits
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
      
      // Upload emails
      const emailFiles = Array.from(user.emails.values()).map(e => ({
        path: e.path,
        hash: e.hash,
      }));
      
      const uploadResult = await uploadMailboxEmails(
        keyPath,
        instanceIp,
        domain,
        user.username,
        emailFiles,
        dryRun
      );
      
      result.emailsRestored = uploadResult.restored;
      result.emailsSkipped = uploadResult.skipped;
      result.success = true;
    } catch (error) {
      result.error = error instanceof Error ? error.message : String(error);
      result.success = false;
    }
    
    results.set(email, result);
  }
  
  return results;
}

