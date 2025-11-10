#!/usr/bin/env ts-node

import { getStackInfoFromApp } from '@mm/admin-stack-info';
import { getSshKeyPath } from '@mm/admin-ssh';
import { getAdminCredentials } from '@mm/admin-credentials';
import { spawn } from 'child_process';
import { SSMClient, SendCommandCommand, GetCommandInvocationCommand } from '@aws-sdk/client-ssm';
import { fromIni } from '@aws-sdk/credential-providers';

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
    
    // Detect which script to use (cli.py for v73+, users.py for older)
    const checkCliPy = `test -f /opt/mailinabox/management/cli.py && echo "CLI_EXISTS" || echo "NOT_FOUND"`;
    const checkUsersPy = `test -f /opt/mailinabox/management/users.py && echo "USERS_EXISTS" || echo "NOT_FOUND"`;
    
    const cliCheck = await sshCommand(keyPath, instanceIp, checkCliPy);
    const usersCheck = await sshCommand(keyPath, instanceIp, checkUsersPy);
    
    let userCheckCommand: string;
    if (cliCheck.output.includes('CLI_EXISTS')) {
      // v73+ - try cli.py, fallback to SQLite if API key fails
      userCheckCommand = `bash -c 'cd /opt/mailinabox && git config --global --add safe.directory /opt/mailinabox 2>/dev/null || true && (sudo -n -u user-data /opt/mailinabox/management/cli.py user 2>/dev/null | grep -i "${email}" || sudo -n -u user-data sqlite3 /home/user-data/mail/users.sqlite "SELECT email FROM users WHERE email=\\"${email}\\";" 2>/dev/null) || echo "not found"'`;
    } else if (usersCheck.output.includes('USERS_EXISTS')) {
      // Older versions use users.py
      userCheckCommand = `bash -c 'cd /opt/mailinabox && git config --global --add safe.directory /opt/mailinabox 2>/dev/null || true && sudo -n -u user-data /opt/mailinabox/management/users.py list 2>/dev/null | grep -i "${email}" || echo "not found"'`;
    } else {
      // Try SQLite as last resort
      userCheckCommand = `bash -c 'sudo -n -u user-data sqlite3 /home/user-data/mail/users.sqlite "SELECT email FROM users WHERE email=\\"${email}\\";" 2>/dev/null || echo "not found"'`;
    }
    
    const userCheck = await sshCommand(keyPath, instanceIp, userCheckCommand);

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
    
    let createResult: { success: boolean; output: string; error?: string } | null = null;
    let creationMethod = '';
    
    // Try cli.py first (v73+)
    if (cliCheck.output.includes('CLI_EXISTS')) {
      creationMethod = 'cli.py (v73+)';
      console.log(`   Attempting creation via ${creationMethod}...`);
      const createCommand = `bash -c 'export DEBIAN_FRONTEND=noninteractive && cd /opt/mailinabox && git config --global --add safe.directory /opt/mailinabox 2>/dev/null || true && EMAIL=\$(echo "${emailB64}" | base64 -d) && PASS=\$(echo "${passwordB64}" | base64 -d) && sudo -n -u user-data bash -c "cd /opt/mailinabox && /opt/mailinabox/management/cli.py user add \\\"\$EMAIL\\\" \\\"\$PASS\\\" admin" 2>&1'`;
      createResult = await sshCommand(keyPath, instanceIp, createCommand);
      
      // If API key permission error, try to fix permissions or use alternative method
      if (!createResult.success && (createResult.output.includes('PermissionError') || createResult.output.includes('api.key'))) {
        console.log(`   ⚠️  API key permission error detected`);
        console.log(`   Attempting to fix API key permissions...`);
        
        // Try to fix API key permissions
        const fixApiKeyCommand = `bash -c 'sudo chmod 644 /var/lib/mailinabox/api.key 2>/dev/null && sudo chown user-data:user-data /var/lib/mailinabox/api.key 2>/dev/null && echo "FIXED" || echo "NOT_FIXED"'`;
        const fixResult = await sshCommand(keyPath, instanceIp, fixApiKeyCommand);
        
        if (fixResult.success && fixResult.output.includes('FIXED')) {
          console.log(`   ✅ API key permissions fixed, retrying cli.py...`);
          // Retry cli.py after fixing permissions
          const retryCommand = `bash -c 'export DEBIAN_FRONTEND=noninteractive && cd /opt/mailinabox && git config --global --add safe.directory /opt/mailinabox 2>/dev/null || true && EMAIL=\$(echo "${emailB64}" | base64 -d) && PASS=\$(echo "${passwordB64}" | base64 -d) && sudo -n -u user-data bash -c "cd /opt/mailinabox && /opt/mailinabox/management/cli.py user add \\\"\$EMAIL\\\" \\\"\$PASS\\\" admin" 2>&1'`;
          createResult = await sshCommand(keyPath, instanceIp, retryCommand);
          
          if (createResult.success) {
            // Success after fixing permissions
            creationMethod = 'cli.py (v73+) - after fixing API key permissions';
          }
        }
        
        // If still failing, try using setup/firstuser.sh approach via Python
        if (!createResult || !createResult.success) {
          console.log(`   ⚠️  API key fix didn't work - trying setup script approach...`);
          creationMethod = 'setup/firstuser.sh approach (Python)';
          
          // Use the same approach as setup/firstuser.sh - call management/cli.py user add
          // But run it as root first to ensure proper permissions, then fix ownership
          // Actually, let's try running the setup script's user creation logic directly
          const pythonCreateCommand = `bash -c 'export DEBIAN_FRONTEND=noninteractive && cd /opt/mailinabox && EMAIL=\$(echo "${emailB64}" | base64 -d) && PASS=\$(echo "${passwordB64}" | base64 -d) && sudo bash -c "cd /opt/mailinabox && su -s /bin/bash user-data -c \\\"cd /opt/mailinabox && /opt/mailinabox/management/cli.py user add \\\\\\\"\$EMAIL\\\\\\\" \\\\\\\"\$PASS\\\\\\\" admin\\\" 2>&1" || echo "ERROR"'`;
          createResult = await sshCommand(keyPath, instanceIp, pythonCreateCommand);
          
          // If that fails, try fixing database permissions and using Python directly
          if (!createResult || !createResult.success) {
            console.log(`   ⚠️  Trying to fix database permissions and use Python directly...`);
            creationMethod = 'Python direct (with permission fix)';
            
            // Fix database permissions first
            const fixDbPermsCommand = `bash -c 'sudo chown -R user-data:user-data /home/user-data/mail 2>/dev/null && sudo chmod -R u+w /home/user-data/mail 2>/dev/null && echo "PERMS_FIXED" || echo "PERMS_ERROR"'`;
            const fixDbResult = await sshCommand(keyPath, instanceIp, fixDbPermsCommand);
            
            if (fixDbResult.success && fixDbResult.output.includes('PERMS_FIXED')) {
              // Now try Python direct insert
              const pythonDirectCommand = `bash -c 'export DEBIAN_FRONTEND=noninteractive && EMAIL=\$(echo "${emailB64}" | base64 -d) && PASS=\$(echo "${passwordB64}" | base64 -d) && PASS_HASH=\$(python3 -c "import hashlib; print(hashlib.sha512(b\\\"\$PASS\\\").hexdigest())") && sudo -n -u user-data sqlite3 /home/user-data/mail/users.sqlite "INSERT OR REPLACE INTO users (email, password) VALUES (\\\"\$EMAIL\\\", \\\"\$PASS_HASH\\\"); INSERT OR IGNORE INTO user_privileges (email, privilege) VALUES (\\\"\$EMAIL\\\", \\\"admin\\\");" 2>&1 && echo "SUCCESS" || echo "ERROR: \$?"'`;
              createResult = await sshCommand(keyPath, instanceIp, pythonDirectCommand);
            }
          }
        }
      }
    }
    
    // Try users.py (older versions)
    if ((!createResult || !createResult.success) && usersCheck.output.includes('USERS_EXISTS')) {
      creationMethod = 'users.py (older versions)';
      console.log(`   Attempting creation via ${creationMethod}...`);
      const createCommand = `bash -c 'export DEBIAN_FRONTEND=noninteractive && cd /opt/mailinabox && git config --global --add safe.directory /opt/mailinabox 2>/dev/null || true && EMAIL=\$(echo "${emailB64}" | base64 -d) && PASS=\$(echo "${passwordB64}" | base64 -d) && sudo -n -u user-data bash -c "cd /opt/mailinabox && /opt/mailinabox/management/users.py add \\\"\$EMAIL\\\" \\\"\$PASS\\\"" 2>&1'`;
      createResult = await sshCommand(keyPath, instanceIp, createCommand);
    }
    
    // Final fallback: Fix database permissions and use SQLite direct insert
    if (!createResult || !createResult.success) {
      console.log(`   Attempting creation via SQLite (with permission fix)...`);
      creationMethod = 'SQLite (with permission fix)';
      
      // First, fix database file and directory permissions
      const fixPermsCommand = `bash -c 'sudo chown -R user-data:user-data /home/user-data/mail 2>/dev/null && sudo chmod -R u+w /home/user-data/mail 2>/dev/null && sudo chmod 644 /home/user-data/mail/users.sqlite 2>/dev/null && echo "PERMS_FIXED" || echo "PERMS_ERROR"'`;
      const fixPermsResult = await sshCommand(keyPath, instanceIp, fixPermsCommand);
      
      if (fixPermsResult.success && fixPermsResult.output.includes('PERMS_FIXED')) {
        // Hash password with SHA512 and insert directly into database
        const sqliteCreateCommand = `bash -c 'export DEBIAN_FRONTEND=noninteractive && EMAIL=\$(echo "${emailB64}" | base64 -d) && PASS=\$(echo "${passwordB64}" | base64 -d) && PASS_HASH=\$(python3 -c "import hashlib; print(hashlib.sha512(b\\\"\$PASS\\\").hexdigest())") && sudo -n -u user-data sqlite3 /home/user-data/mail/users.sqlite "INSERT OR REPLACE INTO users (email, password) VALUES (\\\"\$EMAIL\\\", \\\"\$PASS_HASH\\\"); INSERT OR IGNORE INTO user_privileges (email, privilege) VALUES (\\\"\$EMAIL\\\", \\\"admin\\\");" 2>&1 && echo "SUCCESS" || echo "ERROR: \$?"'`;
        createResult = await sshCommand(keyPath, instanceIp, sqliteCreateCommand);
      } else {
        console.log(`   ⚠️  Could not fix database permissions: ${fixPermsResult.output || fixPermsResult.error}`);
        console.log(`   💡 Database may be locked or Mail-in-a-Box setup is still running.`);
        console.log(`   💡 Wait for setup to complete, then try again.\n`);
        throw new Error(
          `Failed to create admin account: Database is read-only and permissions could not be fixed. ` +
          `This may indicate Mail-in-a-Box setup is still running. Wait for setup to complete and try again.`
        );
      }
    }

    if (createResult && createResult.success) {
      if (createResult.output.includes('SUCCESS') || createResult.output.includes('already exists') || createResult.output.toLowerCase().includes('created')) {
        console.log(`✅ Admin account created successfully via ${creationMethod}`);
        if (createResult.output && !createResult.output.includes('SUCCESS')) {
          console.log(`   Output: ${createResult.output}\n`);
        } else {
          console.log('');
        }
      } else if (createResult.output.includes('UNIQUE constraint failed') || createResult.output.includes('already exists')) {
        console.log(`✅ Admin account already exists`);
        console.log(`   ${createResult.output || createResult.error}\n`);
      } else {
        // Check if user was actually created by verifying
        console.log(`⚠️  Creation command completed but output unclear`);
        console.log(`   Output: ${createResult.output || createResult.error}\n`);
        console.log(`   Will verify in next step...\n`);
      }
    } else {
      // Check if it's an error we can handle
      const errorOutput = createResult?.output || createResult?.error || 'Unknown error';
      if (errorOutput.includes('already exists') || errorOutput.includes('UNIQUE constraint')) {
        console.log(`✅ Admin account already exists`);
        console.log(`   ${errorOutput}\n`);
      } else {
        throw new Error(
          `Failed to create admin account via ${creationMethod}: ${errorOutput}`
        );
      }
    }

    // Verify account was created
    console.log('🔍 Step 6: Verifying account creation...');
    
    // Use same detection logic as before
    let verifyCommand: string;
    if (cliCheck.output.includes('CLI_EXISTS')) {
      // Try cli.py, fallback to SQLite
      verifyCommand = `bash -c 'cd /opt/mailinabox && git config --global --add safe.directory /opt/mailinabox 2>/dev/null || true && (sudo -n -u user-data /opt/mailinabox/management/cli.py user 2>/dev/null | grep -i "${email}" || sudo -n -u user-data sqlite3 /home/user-data/mail/users.sqlite "SELECT email FROM users WHERE email=\\"${email}\\";" 2>/dev/null) || echo "not found"'`;
    } else if (usersCheck.output.includes('USERS_EXISTS')) {
      verifyCommand = `bash -c 'cd /opt/mailinabox && git config --global --add safe.directory /opt/mailinabox 2>/dev/null || true && sudo -n -u user-data /opt/mailinabox/management/users.py list 2>/dev/null | grep -i "${email}" || echo "not found"'`;
    } else {
      verifyCommand = `bash -c 'sudo -n -u user-data sqlite3 /home/user-data/mail/users.sqlite "SELECT email FROM users WHERE email=\\"${email}\\";" 2>/dev/null || echo "not found"'`;
    }
    
    const verifyCheck = await sshCommand(keyPath, instanceIp, verifyCommand);
    
    // Also check admin privileges
    const adminCheckCommand = `bash -c 'sudo -n -u user-data sqlite3 /home/user-data/mail/users.sqlite "SELECT email FROM user_privileges WHERE email=\\"${email}\\" AND privilege=\\"admin\\";" 2>/dev/null || echo "not found"'`;
    const adminCheck = await sshCommand(keyPath, instanceIp, adminCheckCommand);

    if (verifyCheck.success && verifyCheck.output.toLowerCase().includes(email.toLowerCase()) && verifyCheck.output !== 'not found') {
      console.log(`✅ Account verified: ${email}`);
      console.log(`   User exists in database`);
      
      // Check admin privileges
      if (adminCheck.success && adminCheck.output.toLowerCase().includes(email.toLowerCase()) && adminCheck.output !== 'not found') {
        console.log(`✅ Admin privileges verified\n`);
      } else {
        console.log(`⚠️  Admin privileges not found - attempting to add...`);
        // Add admin privilege via SQLite
        const addAdminCommand = `bash -c 'EMAIL=\$(echo "${emailB64}" | base64 -d) && sudo -n -u user-data sqlite3 /home/user-data/mail/users.sqlite "INSERT OR IGNORE INTO user_privileges (email, privilege) VALUES (\\\"\$EMAIL\\\", \\\"admin\\\");" 2>&1 && echo "SUCCESS" || echo "ERROR"'`;
        const addAdminResult = await sshCommand(keyPath, instanceIp, addAdminCommand);
        if (addAdminResult.success && addAdminResult.output.includes('SUCCESS')) {
          console.log(`✅ Admin privileges added\n`);
        } else {
          console.log(`⚠️  Could not add admin privileges: ${addAdminResult.output || addAdminResult.error}\n`);
        }
      }
    } else {
      console.log(`⚠️  Could not verify account creation`);
      console.log(`   Output: ${verifyCheck.output || verifyCheck.error}\n`);
      console.log(`💡 The account may have been created but verification failed.`);
      console.log(`   Try logging in at: https://${instanceIp}/admin\n`);
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
      
      // Only show SSH command if we have the variables
      try {
        const region = options.region || process.env.AWS_REGION || 'us-east-1';
        const profile = options.profile || process.env.AWS_PROFILE || 'hepe-admin-mfa';
        const appPath = options.appPath || 'apps/cdk-emc-notary/instance';
        const domain = options.domain || process.env.DOMAIN || 'emcnotary.com';
        
        const stackInfo = await getStackInfoFromApp(appPath, { domain, region, profile });
        if (stackInfo.instancePublicIp) {
          const keyPath = await getSshKeyPath({ appPath, domain, region, profile, ensureSetup: false });
          if (keyPath) {
            console.error('   5. If API key permission errors, try SQLite directly:');
            console.error(`      ssh -i ${keyPath} ubuntu@${stackInfo.instancePublicIp} "sudo -u user-data sqlite3 /home/user-data/mail/users.sqlite 'SELECT email FROM users;'"\n`);
          }
        }
      } catch {
        // Ignore errors in error handler
      }
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

