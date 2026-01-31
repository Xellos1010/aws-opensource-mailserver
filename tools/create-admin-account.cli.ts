#!/usr/bin/env ts-node

import { getStackInfoFromApp } from '@mm/admin-stack-info';
import { getSshKeyPath } from '@mm/admin-ssh';
import { getAdminCredentials } from '@mm/admin-credentials';
import { createAdminAccount as createAdminAccountLib } from '@mm/admin-account';

interface CreateAdminOptions {
  domain?: string;
  appPath?: string;
  region?: string;
  profile?: string;
  email?: string;
  password?: string;
}

/**
 * Create admin account in Mail-in-a-Box
 */
async function createAdminAccount(options: CreateAdminOptions): Promise<void> {
  const region = options.region || process.env.AWS_REGION || 'us-east-1';
  const profile = options.profile || process.env.AWS_PROFILE || 'hepe-admin-mfa';
  const appPath = options.appPath || process.env.APP_PATH || 'apps/cdk-emc-notary/instance';
  const domain = options.domain || process.env.DOMAIN;
  
  if (!domain && !appPath) {
    throw new Error('Cannot resolve domain. Provide domain or appPath');
  }

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

    // Create admin account using library
    console.log('🔍 Step 4: Creating admin account...');
    const result = await createAdminAccountLib({
      keyPath,
      instanceIp,
      email,
      password,
    });

    if (result.success) {
      console.log(`✅ ${result.message}`);
      console.log(`   Account exists:   ${result.accountExists ? '✅' : '❌'}`);
      console.log(`   Mailbox created:  ${result.mailboxCreated ? '✅' : '❌'}`);
      console.log(`   Password synced:  ${result.passwordSynced ? '✅' : '❌'}`);
      console.log('');
    } else {
      throw new Error(`Failed to create admin account: ${result.message}`);
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
      console.error('   3. Verify the management script exists:');
      console.error('      - /opt/mailinabox/management/cli.py (v73+)');
      console.error('      - /opt/mailinabox/management/users.py (older versions)');
      console.error('   4. Check Mail-in-a-Box logs: /var/log/mailinabox_setup.log');
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
