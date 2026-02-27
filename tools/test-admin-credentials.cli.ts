#!/usr/bin/env ts-node

import { getStackInfoFromApp } from '@mm/admin-stack-info';
import { getSshKeyPath } from '@mm/admin-ssh';
import { getAdminCredentials } from '@mm/admin-credentials';
import { checkAdminAccountExists } from '@mm/admin-account';
import { spawn } from 'child_process';
import * as https from 'https';

interface TestCredentialsOptions {
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
 * Test admin login via HTTPS
 */
async function testAdminLogin(
  url: string,
  email: string,
  password: string
): Promise<{ success: boolean; message: string; details?: string }> {
  return new Promise((resolve) => {
    // Mail-in-a-Box uses a POST request to /admin/login
    // We'll check if the login endpoint exists and is accessible
    const loginUrl = url.replace('/admin', '/admin/login');
    
    const options = {
      hostname: new URL(loginUrl).hostname,
      port: 443,
      path: '/admin/login',
      method: 'GET',
      rejectUnauthorized: false,
      timeout: 10000,
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        if (res.statusCode === 200) {
          // Check if login form is present
          if (data.includes('login') || data.includes('password') || data.includes('email')) {
            resolve({
              success: true,
              message: 'Login page is accessible',
              details: `Status: ${res.statusCode}`,
            });
          } else {
            resolve({
              success: false,
              message: 'Login page may not be accessible',
              details: `Status: ${res.statusCode}, Content length: ${data.length}`,
            });
          }
        } else {
          resolve({
            success: false,
            message: `Login endpoint returned status ${res.statusCode}`,
            details: `Expected 200, got ${res.statusCode}`,
          });
        }
      });
    });

    req.on('error', (err) => {
      resolve({
        success: false,
        message: 'Could not connect to login endpoint',
        details: err.message,
      });
    });

    req.on('timeout', () => {
      req.destroy();
      resolve({
        success: false,
        message: 'Connection timeout',
        details: 'Login endpoint did not respond',
      });
    });

    req.end();
  });
}

/**
 * Test admin credentials
 */
async function testCredentials(options: TestCredentialsOptions): Promise<void> {
  const region = options.region || process.env.AWS_REGION || 'us-east-1';
  const profile = options.profile || process.env.AWS_PROFILE || 'hepe-admin-mfa';
  const appPath = options.appPath || process.env.APP_PATH || 'apps/cdk-emc-notary/instance';
  const domain = options.domain || process.env.DOMAIN;
  
  if (!domain && !appPath) {
    throw new Error('Cannot resolve domain. Provide domain or appPath');
  }

  console.log('🔐 Admin Credentials Test');
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

    // Get credentials
    console.log('📋 Step 2: Retrieving admin credentials...');
    const credentials = await getAdminCredentials({
      appPath,
      domain,
      region,
      profile,
    });

    console.log(`✅ Credentials retrieved`);
    console.log(`   Email: ${credentials.email}`);
    console.log(`   Password: ${credentials.password.substring(0, 4)}****\n`);

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

    // Check 1: Verify admin user exists in Mail-in-a-Box
    console.log('🔍 Step 4: Checking admin user account...');
    
    const accountExists = await checkAdminAccountExists(keyPath, instanceIp, credentials.email);

    if (accountExists) {
      console.log(`✅ Admin user exists: ${credentials.email}\n`);
    } else {
      console.log(`⚠️  Admin user not found in Mail-in-a-Box user list`);
      console.log(`   This may indicate the account was not created during bootstrap\n`);
    }

    // Check 2: Verify admin password in Mail-in-a-Box config
    console.log('🔍 Step 5: Checking Mail-in-a-Box configuration...');
    const configCheck = await sshCommand(
      keyPath,
      instanceIp,
      'grep -E "EMAIL_ADDR|EMAIL_PW" /var/log/mailinabox_setup.log 2>/dev/null | tail -5 || echo "not found"'
    );

    if (configCheck.success && configCheck.output !== 'not found') {
      console.log(`✅ Found email configuration in setup log`);
      console.log(`   ${configCheck.output}\n`);
    } else {
      console.log(`⚠️  Email configuration not found in setup log\n`);
    }

    // Check 3: Test login page accessibility
    console.log('🔍 Step 6: Testing admin login page accessibility...');
    
    // Try both hostname and IP
    const urlsToTest = [
      `https://${hostname}/admin`,
      `https://${instanceIp}/admin`,
    ];

    for (const url of urlsToTest) {
      console.log(`   Testing: ${url}`);
      const loginTest = await testAdminLogin(url, credentials.email, credentials.password);
      
      if (loginTest.success) {
        console.log(`   ✅ Login page accessible\n`);
        break;
      } else {
        console.log(`   ⚠️  ${loginTest.message}`);
        if (loginTest.details) {
          console.log(`      ${loginTest.details}`);
        }
      }
    }

    // Check 4: Verify Mail-in-a-Box setup completed
    console.log('🔍 Step 7: Verifying Mail-in-a-Box setup completion...');
    const setupCheck = await sshCommand(
      keyPath,
      instanceIp,
      'tail -20 /var/log/mailinabox_setup.log 2>/dev/null | grep -i "complete\|finished\|done" || echo "not found"'
    );

    if (setupCheck.success && setupCheck.output !== 'not found') {
      console.log(`✅ Setup completion found in logs`);
      console.log(`   ${setupCheck.output}\n`);
    } else {
      console.log(`⚠️  Setup completion not clearly indicated in logs\n`);
    }

    // Check 5: Check if admin account needs to be created manually
    console.log('🔍 Step 8: Checking if admin account exists in system...');

    // Detect which Mail-in-a-Box management script is available.
    const cliCheck = await sshCommand(
      keyPath,
      instanceIp,
      'test -f /opt/mailinabox/management/cli.py && echo CLI_EXISTS || echo CLI_MISSING'
    );
    const usersCheck = await sshCommand(
      keyPath,
      instanceIp,
      'test -f /opt/mailinabox/management/users.py && echo USERS_EXISTS || echo USERS_MISSING'
    );

    // Use the same detection logic as above
    let adminListCommand: string;
    if (cliCheck.output.includes('CLI_EXISTS')) {
      adminListCommand = `bash -c 'cd /opt/mailinabox && git config --global --add safe.directory /opt/mailinabox 2>/dev/null || true && sudo -u user-data /opt/mailinabox/management/cli.py user 2>/dev/null | head -10 || echo "error"'`;
    } else if (usersCheck.output.includes('USERS_EXISTS')) {
      adminListCommand = `bash -c 'cd /opt/mailinabox && git config --global --add safe.directory /opt/mailinabox 2>/dev/null || true && sudo -u user-data /opt/mailinabox/management/users.py list 2>/dev/null | head -10 || echo "error"'`;
    } else {
      adminListCommand = `echo "error"`;
    }
    
    const adminExistsCheck = await sshCommand(keyPath, instanceIp, adminListCommand);

    if (adminExistsCheck.success && adminExistsCheck.output !== 'error') {
      console.log(`📋 Current Mail-in-a-Box users:`);
      console.log(`   ${adminExistsCheck.output}\n`);
      
      if (!adminExistsCheck.output.toLowerCase().includes(credentials.email.toLowerCase())) {
        console.log(`⚠️  WARNING: Admin user ${credentials.email} not found in user list!`);
        console.log(`   The account may need to be created manually.\n`);
      }
    } else {
      console.log(`⚠️  Could not retrieve user list`);
      console.log(`   Error: ${adminExistsCheck.error || 'Unknown error'}\n`);
    }

    // Summary and recommendations
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📊 Credentials Test Summary');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    console.log(`   Email:    ${credentials.email}`);
    console.log(`   Password: ${credentials.password}`);
    console.log(`   Admin URL: https://${hostname}/admin`);
    console.log(`   Admin URL (IP): https://${instanceIp}/admin\n`);

    console.log('💡 Troubleshooting Steps:\n');
    console.log('   1. Try logging in with the IP address instead of hostname:');
    console.log(`      https://${instanceIp}/admin\n`);
    console.log('   2. Verify the admin account was created during bootstrap:');
    console.log(`      ssh -i ${keyPath} ubuntu@${instanceIp}`);
    if (cliCheck.output.includes('CLI_EXISTS')) {
      console.log(`      sudo -u user-data /opt/mailinabox/management/cli.py user\n`);
      console.log('   3. If account doesn\'t exist, create it manually (v73+):');
      console.log(`      sudo -u user-data /opt/mailinabox/management/cli.py user add ${credentials.email} "${credentials.password}" admin\n`);
    } else {
      console.log(`      sudo -u user-data /opt/mailinabox/management/users.py list\n`);
      console.log('   3. If account doesn\'t exist, create it manually (older version):');
      console.log(`      sudo -u user-data /opt/mailinabox/management/users.py add ${credentials.email} "${credentials.password}"\n`);
    }
    console.log('   4. Check Mail-in-a-Box setup logs:');
    console.log(`      tail -100 /var/log/mailinabox_setup.log\n`);
    console.log('   5. Verify DNS is configured correctly:');
    console.log(`      The admin URL should be: https://${hostname}/admin\n`);

  } catch (error) {
    console.error('\n❌ Credentials test failed:');
    if (error instanceof Error) {
      console.error(`   ${error.message}`);
    } else {
      console.error(`   ${String(error)}`);
    }
    process.exit(1);
  }
}

// Run if executed directly
if (require.main === module) {
  testCredentials({}).catch((error) => {
    console.error('Unhandled error:', error);
    process.exit(1);
  });
}
