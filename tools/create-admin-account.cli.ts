#!/usr/bin/env ts-node

import { getStackInfoFromApp } from '@mm/admin-stack-info';
import { getSshKeyPath } from '@mm/admin-ssh';
import { getAdminCredentials } from '@mm/admin-credentials';
import { spawn } from 'child_process';

interface CreateAdminOptions {
  domain?: string;
  appPath?: string;
  region?: string;
  profile?: string;
  email?: string;
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
 * Create admin account in Mail-in-a-Box
 */
async function createAdminAccount(options: CreateAdminOptions): Promise<void> {
  const region = options.region || process.env.AWS_REGION || 'us-east-1';
  const profile = options.profile || process.env.AWS_PROFILE || 'hepe-admin-mfa';
  const appPath = options.appPath || 'apps/cdk-emc-notary/instance';
  const domain = options.domain || process.env.DOMAIN || 'emcnotary.com';

  console.log('👤 Create Admin Account');
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

    // Get credentials (use provided or retrieve from SSM)
    let email: string;
    let password: string;

    if (options.email && options.password) {
      email = options.email;
      password = options.password;
      console.log('📋 Step 2: Using provided credentials...');
      console.log(`   Email: ${email}\n`);
    } else {
      console.log('📋 Step 2: Retrieving admin credentials from SSM...');
      const credentials = await getAdminCredentials({
        appPath,
        domain,
        region,
        profile,
      });
      email = credentials.email;
      password = credentials.password;
      console.log(`✅ Credentials retrieved`);
      console.log(`   Email: ${email}\n`);
    }

    // Get SSH key
    console.log('📋 Step 3: Getting SSH key...');
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

    // Check if user already exists
    console.log('🔍 Step 4: Checking if admin account exists...');
    // Fix git ownership issue and check users
    const userCheck = await sshCommand(
      keyPath,
      instanceIp,
      `bash -c 'cd /opt/mailinabox && git config --global --add safe.directory /opt/mailinabox 2>/dev/null || true && sudo -u user-data /opt/mailinabox/management/users.py list 2>/dev/null | grep -i "${email}" || echo "not found"'`
    );

    if (userCheck.success && userCheck.output.toLowerCase().includes(email.toLowerCase()) && userCheck.output !== 'not found') {
      console.log(`✅ Admin account already exists: ${email}`);
      console.log(`   User details: ${userCheck.output}\n`);
      console.log('💡 Account is ready to use. No action needed.\n');
      return;
    }

    console.log(`⚠️  Admin account not found. Creating account...\n`);

    // Create admin account
    console.log('🔍 Step 5: Creating admin account...');
    // Escape password for shell - use base64 to avoid quoting issues
    const emailB64 = Buffer.from(email).toString('base64');
    const passwordB64 = Buffer.from(password).toString('base64');
    // Decode and pass to the script
    const createCommand = `bash -c 'cd /opt/mailinabox && git config --global --add safe.directory /opt/mailinabox 2>/dev/null || true && EMAIL=\$(echo "${emailB64}" | base64 -d) && PASS=\$(echo "${passwordB64}" | base64 -d) && sudo -u user-data /opt/mailinabox/management/users.py add "\$EMAIL" "\$PASS"' 2>&1`;

    const createResult = await sshCommand(keyPath, instanceIp, createCommand);

    if (createResult.success) {
      console.log(`✅ Admin account created successfully`);
      console.log(`   Output: ${createResult.output}\n`);
    } else {
      // Check if it's an error we can handle
      if (createResult.output.includes('already exists') || createResult.error.includes('already exists')) {
        console.log(`✅ Admin account already exists`);
        console.log(`   ${createResult.output || createResult.error}\n`);
      } else {
        throw new Error(
          `Failed to create admin account: ${createResult.output || createResult.error}`
        );
      }
    }

    // Verify account was created
    console.log('🔍 Step 6: Verifying account creation...');
    const verifyCheck = await sshCommand(
      keyPath,
      instanceIp,
      `bash -c 'cd /opt/mailinabox && git config --global --add safe.directory /opt/mailinabox 2>/dev/null || true && sudo -u user-data /opt/mailinabox/management/users.py list 2>/dev/null | grep -i "${email}" || echo "not found"'`
    );

    if (verifyCheck.success && verifyCheck.output.toLowerCase().includes(email.toLowerCase()) && verifyCheck.output !== 'not found') {
      console.log(`✅ Account verified: ${email}`);
      console.log(`   User details: ${verifyCheck.output}\n`);
    } else {
      console.log(`⚠️  Could not verify account creation`);
      console.log(`   Output: ${verifyCheck.output || verifyCheck.error}\n`);
    }

    // Summary
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✅ Admin Account Setup Complete');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    console.log(`   Email:    ${email}`);
    console.log(`   Password: ${password}`);
    console.log(`   Admin URL: https://${hostname}/admin`);
    console.log(`   Admin URL (IP): https://${instanceIp}/admin\n`);

    console.log('💡 You can now log in with these credentials:\n');
    console.log(`   URL: https://${instanceIp}/admin`);
    console.log(`   Email: ${email}`);
    console.log(`   Password: ${password}\n`);

  } catch (error) {
    console.error('\n❌ Failed to create admin account:');
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
const options: CreateAdminOptions = {};

// Parse --email
const emailIndex = args.indexOf('--email');
if (emailIndex !== -1 && args[emailIndex + 1]) {
  options.email = args[emailIndex + 1];
}

// Parse --password
const passwordIndex = args.indexOf('--password');
if (passwordIndex !== -1 && args[passwordIndex + 1]) {
  options.password = args[passwordIndex + 1];
}

// Run if executed directly
if (require.main === module) {
  createAdminAccount(options).catch((error) => {
    console.error('Unhandled error:', error);
    process.exit(1);
  });
}

