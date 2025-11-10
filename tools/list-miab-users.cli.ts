#!/usr/bin/env ts-node

import { getStackInfoFromApp } from '@mm/admin-stack-info';
import { getSshKeyPath } from '@mm/admin-ssh';
import { spawn } from 'child_process';

interface ListUsersOptions {
  domain?: string;
  appPath?: string;
  region?: string;
  profile?: string;
  verbose?: boolean;
}

/**
 * Execute SSH command and return output
 */
async function sshCommand(
  keyPath: string,
  host: string,
  command: string,
  options?: { verbose?: boolean }
): Promise<{ success: boolean; output: string; error?: string; exitCode?: number }> {
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
      'LogLevel=ERROR', // Reduce noise from SSH
      `ubuntu@${host}`,
      command,
    ];

    if (options?.verbose) {
      console.log(`   🔍 Executing SSH command:`);
      console.log(`      ssh -i ${keyPath} ubuntu@${host}`);
      console.log(`      Command: ${command}\n`);
    }

    let output = '';
    let error = '';
    let exitCode: number | undefined;

    const ssh = spawn('ssh', sshArgs);

    ssh.stdout.on('data', (data) => {
      const text = data.toString();
      output += text;
      if (options?.verbose) {
        process.stdout.write(`   [stdout] ${text}`);
      }
    });

    ssh.stderr.on('data', (data) => {
      const text = data.toString();
      // Filter out common SSH warnings that aren't errors
      if (!text.includes('Permanently added') && !text.includes('Warning: Permanently added')) {
        error += text;
      }
      if (options?.verbose) {
        process.stderr.write(`   [stderr] ${text}`);
      }
    });

    ssh.on('close', (code) => {
      exitCode = code ?? undefined;
      if (options?.verbose) {
        console.log(`\n   🔍 SSH command exited with code: ${code}`);
      }
      resolve({
        success: code === 0,
        output: output.trim(),
        error: error.trim() || undefined,
        exitCode,
      });
    });

    ssh.on('error', (err) => {
      if (options?.verbose) {
        console.error(`\n   ❌ SSH spawn error: ${err.message}`);
      }
      resolve({
        success: false,
        output: '',
        error: err.message,
        exitCode: -1,
      });
    });
  });
}

/**
 * List Mail-in-a-Box users
 */
async function listUsers(options: ListUsersOptions): Promise<void> {
  const region = options.region || process.env.AWS_REGION || 'us-east-1';
  const profile = options.profile || process.env.AWS_PROFILE || 'hepe-admin-mfa';
  const appPath = options.appPath || 'apps/cdk-emc-notary/instance';
  const domain = options.domain || process.env.DOMAIN || 'emcnotary.com';
  const verbose = options.verbose || process.env.VERBOSE === '1' || process.env.VERBOSE === 'true';

  console.log('👥 Mail-in-a-Box Users');
  console.log(`   Domain: ${domain}`);
  console.log(`   Region: ${region}`);
  console.log(`   Profile: ${profile}\n`);

  try {
    // Get stack info
    console.log('📋 Step 1: Getting stack information...');
    const stackInfo = await getStackInfoFromApp(appPath, {
      domain,
      region,
      profile,
    });

    if (!stackInfo.instanceId) {
      throw new Error('Instance ID not found in stack outputs');
    }

    if (!stackInfo.instancePublicIp) {
      throw new Error('Instance public IP not found');
    }

    const instanceId = stackInfo.instanceId;
    const instanceIp = stackInfo.instancePublicIp;
    // Default to 'box' for instance DNS (common Mail-in-a-Box default)
    const hostname = `box.${domain}`;

    console.log(`✅ Found instance: ${instanceId}`);
    console.log(`   IP: ${instanceIp}`);
    console.log(`   Hostname: ${hostname}\n`);

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
      throw new Error(
        'SSH key not found. Run: pnpm nx run cdk-emcnotary-instance:admin:ssh:setup'
      );
    }

    console.log(`✅ SSH key ready\n`);

    // List users
    console.log('📋 Step 3: Retrieving Mail-in-a-Box users...');
    
    // Check for both cli.py (v73+) and users.py (older versions)
    if (verbose) {
      console.log('   🔍 Step 3a: Detecting Mail-in-a-Box version and management script...');
    }
    
    const checkCliPy = `test -f /opt/mailinabox/management/cli.py && echo "CLI_EXISTS" || echo "NOT_FOUND"`;
    const checkUsersPy = `test -f /opt/mailinabox/management/users.py && echo "USERS_EXISTS" || echo "NOT_FOUND"`;
    
    const cliCheck = await sshCommand(keyPath, instanceIp, checkCliPy, { verbose });
    const usersCheck = await sshCommand(keyPath, instanceIp, checkUsersPy, { verbose });
    
    if (verbose) {
      console.log(`   📋 cli.py check: ${cliCheck.output}`);
      console.log(`   📋 users.py check: ${usersCheck.output}`);
    }
    
    let userCommand: string;
    let scriptType: string;
    
    if (cliCheck.output.includes('CLI_EXISTS')) {
      // v73+ uses cli.py
      scriptType = 'cli.py (v73+)';
      if (verbose) {
        console.log('   ✅ Detected Mail-in-a-Box v73+ (using cli.py)');
      }
      // For v73+, cli.py user lists all users (returns empty if none)
      // Note: This requires API key access, which may not exist if setup isn't complete
      userCommand = `bash -c 'cd /opt/mailinabox && git config --global --add safe.directory /opt/mailinabox 2>/dev/null || true && sudo -u user-data /opt/mailinabox/management/cli.py user 2>&1 || echo "ERROR: Could not list users (API key may not exist or setup incomplete)"'`;
    } else if (usersCheck.output.includes('USERS_EXISTS')) {
      // Older versions use users.py
      scriptType = 'users.py (older versions)';
      if (verbose) {
        console.log('   ✅ Detected older Mail-in-a-Box version (using users.py)');
      }
      userCommand = `bash -c 'cd /opt/mailinabox && git config --global --add safe.directory /opt/mailinabox 2>/dev/null || true && sudo -u user-data /opt/mailinabox/management/users.py list' 2>&1`;
    } else {
      // Neither script found - provide detailed diagnostics
      if (verbose) {
        console.log('   🔍 Step 3a.1: Checking /opt/mailinabox directory structure...');
      }
      const dirCheck = await sshCommand(
        keyPath,
        instanceIp,
        `ls -la /opt/mailinabox/ 2>&1 | head -20`,
        { verbose }
      );
      
      if (verbose && dirCheck.output) {
        console.log(`   📋 Directory contents:\n${dirCheck.output.split('\n').map(l => `      ${l}`).join('\n')}`);
      }
      
      // Check git status
      if (verbose) {
        console.log('   🔍 Step 3a.2: Checking git status...');
      }
      const gitCheck = await sshCommand(
        keyPath,
        instanceIp,
        `cd /opt/mailinabox && git rev-parse --abbrev-ref HEAD 2>&1 && git describe --tags 2>&1 || echo "Git info unavailable"`,
        { verbose }
      );
      
      if (verbose && gitCheck.output) {
        console.log(`   📋 Git status: ${gitCheck.output}`);
      }
      
      // Check if management directory exists at all
      const mgmtDirCheck = await sshCommand(
        keyPath,
        instanceIp,
        `test -d /opt/mailinabox/management && echo "EXISTS" || echo "NOT_FOUND"`,
        { verbose }
      );
      
      if (verbose) {
        console.log(`   📋 Management directory: ${mgmtDirCheck.output}`);
      }
      
      // If management directory exists, check what's in it
      if (mgmtDirCheck.output.includes('EXISTS')) {
        if (verbose) {
          console.log('   🔍 Step 3a.3: Checking management directory contents...');
        }
        const mgmtContents = await sshCommand(
          keyPath,
          instanceIp,
          `ls -la /opt/mailinabox/management/ 2>&1 | head -30`,
          { verbose }
        );
        
        if (verbose && mgmtContents.output) {
          console.log(`   📋 Management directory contents:\n${mgmtContents.output.split('\n').map(l => `      ${l}`).join('\n')}`);
        }
      }
      
      throw new Error(
        'Mail-in-a-Box management scripts not found\n' +
        'Expected either:\n' +
        '  - /opt/mailinabox/management/cli.py (v73+)\n' +
        '  - /opt/mailinabox/management/users.py (older versions)\n\n' +
        'This may indicate:\n' +
        '  1. Mail-in-a-Box git checkout failed (wrong tag/branch)\n' +
        '  2. The management scripts are missing from the checked-out branch\n' +
        '  3. Mail-in-a-Box installation is incomplete\n\n' +
        `Git status: ${gitCheck.output || 'unknown'}\n` +
        `Management directory: ${mgmtDirCheck.output || 'unknown'}\n\n` +
        '💡 Try running bootstrap again to fix the git checkout:\n' +
        `   pnpm nx run cdk-emcnotary-instance:admin:bootstrap-miab-ec2-instance\n\n` +
        '💡 Or manually fix the git checkout (check available tags first):\n' +
        `   ssh -i ${keyPath} ubuntu@${instanceIp} "cd /opt/mailinabox && git fetch --all --tags && git tag -l | sort -V -r | head -5"`
      );
    }
    
    // Now try to list users
    if (verbose) {
      console.log(`   🔍 Step 3b: Executing ${scriptType} command...`);
    }

    const result = await sshCommand(keyPath, instanceIp, userCommand, { verbose });

    if (verbose) {
      console.log(`   📋 Command exit code: ${result.exitCode}`);
      console.log(`   📋 Command stdout length: ${result.output.length} bytes`);
      console.log(`   📋 Command stderr: ${result.error || '(none)'}`);
    }

    // Check for API key permission errors (common in v73+ before setup completes)
    if (result.output.includes('PermissionError') || result.output.includes('api.key')) {
      console.log('⚠️  API key permission error detected - Mail-in-a-Box setup may not be complete');
      console.log('   This is normal if bootstrap is still running or setup hasn\'t finished\n');
      console.log('💡 Options:');
      console.log('   1. Wait for bootstrap to complete, then try again');
      console.log('   2. Check if users exist via SQLite database:');
      console.log(`      ssh -i ${keyPath} ubuntu@${instanceIp} "sudo -u user-data sqlite3 /home/user-data/mail/users.sqlite 'SELECT email FROM users;'"\n`);
      
      // Try SQLite as fallback
      if (verbose) {
        console.log('   🔍 Attempting SQLite fallback...');
      }
      const sqliteCommand = `bash -c 'sudo -u user-data sqlite3 /home/user-data/mail/users.sqlite "SELECT email FROM users;" 2>&1 || echo "SQLITE_ERROR"'`;
      const sqliteResult = await sshCommand(keyPath, instanceIp, sqliteCommand, { verbose });
      
      if (sqliteResult.success && !sqliteResult.output.includes('SQLITE_ERROR') && sqliteResult.output.trim()) {
        console.log('✅ Found users via SQLite database:\n');
        const users = sqliteResult.output
          .split('\n')
          .filter((line) => line.trim())
          .map((line) => line.trim());
        
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
        users.forEach((user, index) => {
          console.log(`   ${index + 1}. ${user}`);
        });
        console.log(`\n   Total: ${users.length} user(s)\n`);
        
        // Check for admin user
        const adminUser = users.find((u) => u.toLowerCase().includes('admin@'));
        if (adminUser) {
          console.log('✅ Admin user found:', adminUser);
        } else {
          console.log('⚠️  Admin user not found in user list');
          console.log('💡 Create admin account:');
          console.log(`   pnpm nx run cdk-emcnotary-instance:admin:credentials:create\n`);
        }
        return;
      } else {
        console.log('⚠️  SQLite fallback also failed - no users found or database doesn\'t exist\n');
        console.log('💡 This likely means Mail-in-a-Box setup hasn\'t completed yet.');
        console.log('   Wait for bootstrap to finish, then try again.\n');
        return;
      }
    }

    if (!result.success) {
      // Provide more detailed error information
      const errorDetails = [];
      if (result.exitCode !== undefined) {
        errorDetails.push(`Exit code: ${result.exitCode}`);
      }
      if (result.error) {
        errorDetails.push(`Stderr: ${result.error}`);
      }
      if (result.output) {
        errorDetails.push(`Stdout: ${result.output.substring(0, 500)}`);
      }
      
      throw new Error(
        `Failed to list users.\n` +
        `   ${errorDetails.join('\n   ')}\n\n` +
        `💡 Debugging steps:\n` +
        `   1. Check if Mail-in-a-Box is installed: ssh -i ${keyPath} ubuntu@${instanceIp} "test -d /opt/mailinabox && echo 'INSTALLED' || echo 'NOT_INSTALLED'"\n` +
        `   2. Check if user-data user exists: ssh -i ${keyPath} ubuntu@${instanceIp} "id user-data"\n` +
        `   3. Try running manually (v73+): ssh -i ${keyPath} ubuntu@${instanceIp} "sudo -u user-data /opt/mailinabox/management/cli.py user"\n` +
        `   4. Try running manually (older): ssh -i ${keyPath} ubuntu@${instanceIp} "sudo -u user-data /opt/mailinabox/management/users.py list"\n` +
        `   5. Check Mail-in-a-Box logs: ssh -i ${keyPath} ubuntu@${instanceIp} "tail -50 /var/log/mailinabox_setup.log"`
      );
    }

    const users = result.output
      .split('\n')
      .filter((line) => line.trim() && !line.includes('Traceback') && !line.includes('ERROR:'))
      .map((line) => line.trim());

    if (users.length === 0) {
      console.log('⚠️  No users found in Mail-in-a-Box\n');
      console.log('💡 To create a user, run:');
      console.log(`   pnpm nx run cdk-emcnotary-instance:admin:credentials:create\n`);
      return;
    }

    // Display users
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📋 Mail-in-a-Box Users');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    users.forEach((user, index) => {
      console.log(`   ${index + 1}. ${user}`);
    });

    console.log(`\n   Total: ${users.length} user(s)\n`);

    // Check for admin user
    const adminUser = users.find((u) => u.toLowerCase().includes('admin@'));
    if (adminUser) {
      console.log('✅ Admin user found:', adminUser);
    } else {
      console.log('⚠️  Admin user not found in user list');
      console.log('💡 Create admin account:');
      console.log(`   pnpm nx run cdk-emcnotary-instance:admin:credentials:create\n`);
    }

  } catch (error) {
    console.error('\n❌ Failed to list users:');
    if (error instanceof Error) {
      console.error(`   ${error.message}\n`);
      console.error('💡 Troubleshooting:');
      console.error('   1. Verify Mail-in-a-Box is installed and running');
      console.error('   2. Check SSH access to the instance');
      console.error('   3. Verify the management script exists:');
      console.error('      - /opt/mailinabox/management/cli.py (v73+)');
      console.error('      - /opt/mailinabox/management/users.py (older versions)');
      console.error('   4. Check Mail-in-a-Box logs: /var/log/mailinabox_setup.log\n');
    } else {
      console.error(`   ${String(error)}\n`);
    }
    process.exit(1);
  }
}

// Parse command line arguments
const args = process.argv.slice(2);
const options: ListUsersOptions = {};

// Parse --verbose
if (args.includes('--verbose') || args.includes('-v')) {
  options.verbose = true;
}

// Parse --domain
const domainIndex = args.indexOf('--domain');
if (domainIndex !== -1 && args[domainIndex + 1]) {
  options.domain = args[domainIndex + 1];
}

// Run if executed directly
if (require.main === module) {
  listUsers(options).catch((error) => {
    console.error('Unhandled error:', error);
    process.exit(1);
  });
}

