#!/usr/bin/env ts-node

import { getStackInfoFromApp } from '@mm/admin-stack-info';
import { getSshKeyPath } from '@mm/admin-ssh';
import { spawn } from 'child_process';

interface ListUsersOptions {
  domain?: string;
  appPath?: string;
  region?: string;
  profile?: string;
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
        error: error.trim(),
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
 * List Mail-in-a-Box users
 */
async function listUsers(options: ListUsersOptions): Promise<void> {
  const region = options.region || process.env.AWS_REGION || 'us-east-1';
  const profile = options.profile || process.env.AWS_PROFILE || 'hepe-admin-mfa';
  const appPath = options.appPath || 'apps/cdk-emc-notary/instance';
  const domain = options.domain || process.env.DOMAIN || 'emcnotary.com';

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
    const userCommand = `bash -c 'cd /opt/mailinabox && git config --global --add safe.directory /opt/mailinabox 2>/dev/null || true && sudo -u user-data /opt/mailinabox/management/users.py list' 2>&1`;

    const result = await sshCommand(keyPath, instanceIp, userCommand);

    if (!result.success) {
      throw new Error(
        `Failed to list users: ${result.error || result.output || 'Unknown error'}`
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

// Run if executed directly
if (require.main === module) {
  listUsers({}).catch((error) => {
    console.error('Unhandled error:', error);
    process.exit(1);
  });
}

