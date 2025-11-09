#!/usr/bin/env ts-node

import { getAdminCredentials } from '@mm/admin-credentials';

interface CredentialsOptions {
  domain?: string;
  appPath?: string;
  region?: string;
  profile?: string;
}

/**
 * Get and display admin credentials
 */
async function getCredentials(options: CredentialsOptions): Promise<void> {
  const region = options.region || process.env.AWS_REGION || 'us-east-1';
  const profile = options.profile || process.env.AWS_PROFILE || 'hepe-admin-mfa';
  const appPath = options.appPath || 'apps/cdk-emc-notary/instance';
  const domain = options.domain || process.env.DOMAIN || 'emcnotary.com';

  try {
    console.log(`Retrieving admin credentials for domain: ${domain}`);
    console.log(`Stack: ${appPath}`);
    console.log(`Region: ${region}`);
    console.log(`Profile: ${profile}\n`);

    const credentials = await getAdminCredentials({
      appPath,
      domain,
      region,
      profile,
    });

    console.log('✅ Admin credentials retrieved successfully\n');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📧 Mail-in-a-Box Admin Credentials');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    console.log(`   Username: ${credentials.email}`);
    console.log(`   Password: ${credentials.password}`);
    console.log(`   Domain:   ${credentials.domain}`);
    console.log(`   Admin URL: ${credentials.adminUrl}\n`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    console.log('💡 Access the admin interface at:');
    console.log(`   ${credentials.adminUrl}\n`);
    console.log('🔐 Login with:');
    console.log(`   Email:    ${credentials.email}`);
    console.log(`   Password: ${credentials.password}\n`);
  } catch (error) {
    console.error('\n❌ Failed to retrieve admin credentials:');
    if (error instanceof Error) {
      console.error(`   ${error.message}\n`);
      console.error('💡 Troubleshooting:');
      console.error('   1. Ensure the stack is deployed');
      console.error('   2. Verify the SSM parameter exists:');
      console.error(`      /MailInABoxAdminPassword-<stack-name>`);
      console.error('   3. Check AWS credentials and profile');
      console.error('   4. Verify bootstrap completed successfully\n');
    } else {
      console.error(`   ${String(error)}\n`);
    }
    process.exit(1);
  }
}

// Parse command line arguments
const args = process.argv.slice(2);
const options: CredentialsOptions = {};

// Parse --domain
const domainIndex = args.indexOf('--domain');
if (domainIndex !== -1 && args[domainIndex + 1]) {
  options.domain = args[domainIndex + 1];
}

// Run if executed directly
if (require.main === module) {
  getCredentials(options).catch((error) => {
    console.error('Unhandled error:', error);
    process.exit(1);
  });
}

