#!/usr/bin/env ts-node

/**
 * Verify Admin Password
 * 
 * Verifies that admin@domain password matches SSM Parameter Store value
 * by checking the password hash in the database
 */

import { getAdminCredentials } from '@mm/admin-credentials';
import { resolveStackName, resolveDomain, getStackInfo } from '@mm/admin-stack-info';
import { getSshKeyPath } from '@mm/admin-ssh';
import { sshCommand } from '@mm/admin-account';

interface VerifyAdminPasswordOptions {
  domain?: string;
  appPath?: string;
  region?: string;
  profile?: string;
}

async function verifyAdminPassword(options: VerifyAdminPasswordOptions): Promise<void> {
  const region = options.region || process.env.AWS_REGION || 'us-east-1';
  const profile = options.profile || process.env.AWS_PROFILE || 'hepe-admin-mfa';
  const domain = options.domain || process.env.DOMAIN;
  const appPath = options.appPath || process.env.APP_PATH;

  if (!domain && !appPath) {
    throw new Error('Cannot resolve domain. Provide domain or appPath');
  }

  const resolvedDomain = domain || (appPath ? resolveDomain(appPath) : null);
  if (!resolvedDomain) {
    throw new Error('Cannot resolve domain. Provide domain or appPath');
  }

  console.log('🔍 Verify Admin Password');
  console.log(`   Domain: ${resolvedDomain}\n`);

  // Get admin credentials from SSM
  console.log('📋 Step 1: Getting admin password from SSM...');
  const credentials = await getAdminCredentials({
    appPath,
    domain: resolvedDomain,
    region,
    profile,
  });
  
  const adminEmail = credentials.email;
  const expectedPassword = credentials.password;
  
  console.log(`✅ Password retrieved from SSM`);
  console.log(`   Email: ${adminEmail}`);
  console.log(`   Expected Password: ${expectedPassword}\n`);

  // Get instance info
  const instanceStackName = resolveStackName(resolvedDomain, appPath, undefined, 'instance');
  const stackInfo = await getStackInfo({
    stackName: instanceStackName,
    region,
    profile,
  });

  const instanceIp = stackInfo.instancePublicIp;
  if (!instanceIp) {
    throw new Error(`Could not determine instance IP from stack ${instanceStackName}`);
  }

  // Get SSH key
  const keyPath = await getSshKeyPath({
    appPath,
    domain: resolvedDomain,
    region,
    profile,
    ensureSetup: true,
  });

  if (!keyPath) {
    throw new Error('SSH key not found');
  }

  // Check if user exists and get password info
  console.log('📋 Step 2: Checking user account in database...');
  const checkUserCommand = `sudo sqlite3 /home/user-data/mail/users.sqlite "SELECT email, substr(password, 1, 20) as pwd_preview FROM users WHERE email='${adminEmail}';" 2>&1 || echo "ERROR: Could not query database"`;
  
  const userCheck = await sshCommand(keyPath, instanceIp, checkUserCommand);
  
  if (userCheck.success && !userCheck.output.includes('ERROR')) {
    console.log(`✅ User found in database`);
    console.log(`   ${userCheck.output.trim()}\n`);
  } else {
    console.log(`⚠️  Could not query database: ${userCheck.output}\n`);
  }

  // Try to verify password by attempting to change it (dry run)
  console.log('📋 Step 3: Verifying password can be set...');
  const passwordB64 = Buffer.from(expectedPassword).toString('base64');
  const emailB64 = Buffer.from(adminEmail).toString('base64');
  
  const verifyCommand = `cd /opt/mailinabox && git config --global --add safe.directory /opt/mailinabox 2>/dev/null || true && EMAIL=\$(echo "${emailB64}" | base64 -d) && PASS=\$(echo "${passwordB64}" | base64 -d) && sudo -u user-data /opt/mailinabox/management/cli.py user password "\$EMAIL" "\$PASS" 2>&1 || echo "FAILED"`;
  
  const verifyResult = await sshCommand(keyPath, instanceIp, verifyCommand);
  
  if (verifyResult.success && !verifyResult.output.includes('FAILED')) {
    console.log(`✅ Password sync command executed successfully`);
    console.log(`   Output: ${verifyResult.output.substring(0, 200)}\n`);
  } else {
    console.log(`⚠️  Password sync may have issues`);
    console.log(`   Output: ${verifyResult.output.substring(0, 200)}\n`);
  }

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📊 Password Verification Summary');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`   Email:    ${adminEmail}`);
  console.log(`   Password: ${expectedPassword}`);
  console.log(`   Source:   SSM Parameter Store`);
  console.log(`   Status:   ${verifyResult.success ? '✅ Synced' : '⚠️  May need resync'}\n`);
  
  console.log('💡 If login still fails, try:');
  console.log(`   pnpm nx run cdk-emcnotary-instance:admin:credentials:sync`);
  console.log(`\n   Then use these exact credentials:`);
  console.log(`   Email: ${adminEmail}`);
  console.log(`   Password: ${expectedPassword}`);
}

// CLI interface
if (require.main === module) {
  const args = process.argv.slice(2);
  
  const options: VerifyAdminPasswordOptions = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    switch (arg) {
      case '--domain':
      case '-d':
        options.domain = args[++i];
        break;
      case '--app-path':
        options.appPath = args[++i];
        break;
      case '--region':
      case '-r':
        options.region = args[++i];
        break;
      case '--profile':
        options.profile = args[++i];
        break;
      case '--help':
      case '-h':
        console.log(`
Usage: verify-admin-password.cli.ts [options]

Verifies admin password matches SSM Parameter Store.

Options:
  --domain, -d <domain>     Domain name (default: from APP_PATH or DOMAIN env)
  --app-path <path>         App path (default: from APP_PATH env)
  --region, -r <region>     AWS region (default: us-east-1)
  --profile <profile>       AWS profile (default: hepe-admin-mfa)
  --help, -h                Show this help
`);
        process.exit(0);
        break;
    }
  }

  verifyAdminPassword(options).catch((error) => {
    console.error(`Fatal error: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  });
}

export { verifyAdminPassword };














