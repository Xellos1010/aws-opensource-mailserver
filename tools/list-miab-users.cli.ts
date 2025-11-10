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
    const instanceDns = stackInfo.instanceDns || 'box';
    const hostname = `${instanceDns}.${domain}`;

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
    
    // First, verify the management script exists
    if (verbose) {
      console.log('   🔍 Step 3a: Verifying management script exists...');
    }
    const checkScriptCommand = `test -f /opt/mailinabox/management/users.py && echo "EXISTS" || echo "NOT_FOUND"`;
    const scriptCheck = await sshCommand(keyPath, instanceIp, checkScriptCommand, { verbose });
    
    if (verbose) {
      console.log(`   📋 Script check result: ${scriptCheck.output}`);
      console.log(`   📋 Script check exit code: ${scriptCheck.exitCode}`);
    }
    
    if (scriptCheck.output.includes('NOT_FOUND')) {
      throw new Error(
        'Mail-in-a-Box management script not found at /opt/mailinabox/management/users.py\n' +
        'This may indicate Mail-in-a-Box is not installed or the installation is incomplete.'
      );
    }
    
    // Check if we can access the script
    if (verbose) {
      console.log('   🔍 Step 3b: Checking script permissions...');
    }
    const checkPermsCommand = `ls -la /opt/mailinabox/management/users.py 2>&1`;
    const permsCheck = await sshCommand(keyPath, instanceIp, checkPermsCommand, { verbose });
    
    if (verbose) {
      console.log(`   📋 Permissions: ${permsCheck.output}`);
    }
    
    // Now try to list users
    if (verbose) {
      console.log('   🔍 Step 3c: Executing users.py list command...');
    }
    const userCommand = `bash -c 'cd /opt/mailinabox && git config --global --add safe.directory /opt/mailinabox 2>/dev/null || true && sudo -u user-data /opt/mailinabox/management/users.py list' 2>&1`;

    const result = await sshCommand(keyPath, instanceIp, userCommand, { verbose });

    if (verbose) {
      console.log(`   📋 Command exit code: ${result.exitCode}`);
      console.log(`   📋 Command stdout length: ${result.output.length} bytes`);
      console.log(`   📋 Command stderr: ${result.error || '(none)'}`);
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
        `   3. Try running manually: ssh -i ${keyPath} ubuntu@${instanceIp} "sudo -u user-data /opt/mailinabox/management/users.py list"\n` +
        `   4. Check Mail-in-a-Box logs: ssh -i ${keyPath} ubuntu@${instanceIp} "tail -50 /var/log/mailinabox_setup.log"`
      );
    }

    const users = result.output
      .split('\n')
      .filter((line) => line.trim() && !line.includes('Traceback'))
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
      console.error('   3. Verify the management script exists: /opt/mailinabox/management/users.py');
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

