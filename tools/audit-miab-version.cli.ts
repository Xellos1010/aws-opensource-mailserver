#!/usr/bin/env ts-node

import { getStackInfoFromApp } from '@mm/admin-stack-info';
import { getSshKeyPath } from '@mm/admin-ssh';
import { spawn } from 'child_process';
import * as https from 'https';
import { SSMClient, GetParameterCommand } from '@aws-sdk/client-ssm';

interface AuditOptions {
  domain?: string;
  appPath?: string;
  region?: string;
  profile?: string;
  update?: boolean;
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
      'LogLevel=ERROR',
      `ubuntu@${host}`,
      command,
    ];

    if (options?.verbose) {
      console.log(`   🔍 Executing: ${command}\n`);
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
        console.log(`\n   🔍 Exit code: ${code}\n`);
      }
      resolve({
        success: code === 0,
        output: output.trim(),
        error: error.trim() || undefined,
        exitCode,
      });
    });

    ssh.on('error', (err) => {
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
 * Get Mail-in-a-Box version from SSM Parameter Store
 */
async function getMiabVersionFromSsm(
  ssm: SSMClient,
  stackName: string
): Promise<string | null> {
  const paramName = `/MailInABoxVersion-${stackName}`;
  
  try {
    const command = new GetParameterCommand({
      Name: paramName,
      WithDecryption: false,
    });
    
    const response = await ssm.send(command);
    if (response.Parameter?.Value) {
      return response.Parameter.Value;
    }
  } catch (error) {
    // Parameter doesn't exist or other error - return null
    const err = error as { name?: string };
    if (err?.name !== 'ParameterNotFound') {
      console.log(
        `⚠️  Could not read SSM parameter ${paramName}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
  
  return null;
}

/**
 * Get latest Mail-in-a-Box release tag from GitHub API
 */
async function getLatestMiabTag(): Promise<string> {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.github.com',
      path: '/repos/mail-in-a-box/mailinabox/releases/latest',
      method: 'GET',
      headers: {
        'User-Agent': 'Mail-in-a-Box-Audit-Tool',
        'Accept': 'application/vnd.github.v3+json',
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        if (res.statusCode === 200) {
          try {
            const release = JSON.parse(data);
            resolve(release.tag_name);
          } catch (err) {
            reject(new Error('Failed to parse GitHub API response'));
          }
        } else {
          reject(new Error(`GitHub API returned status ${res.statusCode}`));
        }
      });
    });

    req.on('error', (err) => {
      reject(err);
    });

    req.end();
  });
}

/**
 * Audit Mail-in-a-Box version
 */
async function auditMiabVersion(options: AuditOptions): Promise<void> {
  const region = options.region || process.env.AWS_REGION || 'us-east-1';
  const profile = options.profile || process.env.AWS_PROFILE || 'hepe-admin-mfa';
  const appPath = options.appPath || 'apps/cdk-emc-notary/instance';
  const appPath = options.appPath || process.env.APP_PATH || 'apps/cdk-emc-notary/instance';
  const domain = options.domain || process.env.DOMAIN;
  
  if (!domain && !appPath) {
    throw new Error('Cannot resolve domain. Provide domain or appPath');
  }
  const update = options.update || process.env.UPDATE === '1' || process.env.UPDATE === 'true';
  const verbose = options.verbose || process.env.VERBOSE === '1' || process.env.VERBOSE === 'true';

  console.log('🔍 Mail-in-a-Box Version Audit');
  console.log(`   Domain: ${domain}`);
  console.log(`   Region: ${region}`);
  console.log(`   Profile: ${profile}`);
  console.log(`   Update: ${update ? 'YES' : 'NO (audit only)'}\n`);

  try {
    // Get stack info first (needed for SSM parameter lookup)
    console.log('📋 Step 1: Getting stack information...');
    const stackInfo = await getStackInfoFromApp(appPath, {
      domain,
      region,
      profile,
    });

    // Resolve latest tag using same priority as bootstrap:
    // 1. Explicit override (MAILINABOX_VERSION env var)
    // 2. SSM Parameter Store
    // 3. GitHub API
    // 4. Fail with error (no hardcoded fallback)
    console.log('📋 Step 2: Resolving Mail-in-a-Box version...');
    let latestTag: string;
    
    // Priority 1: Environment variable
    if (process.env.MAILINABOX_VERSION) {
      latestTag = process.env.MAILINABOX_VERSION;
      console.log(`✅ Using version from MAILINABOX_VERSION env var: ${latestTag}\n`);
    } else {
      // Priority 2: SSM Parameter Store
      // Note: SSM client will use AWS_PROFILE from environment if set
      // Profile is already handled via environment variable
      const ssm = new SSMClient({
        region,
      });
      
      const ssmVersion = await getMiabVersionFromSsm(ssm, stackInfo.stackName);
      if (ssmVersion) {
        latestTag = ssmVersion;
        console.log(`✅ Using version from SSM Parameter Store: ${latestTag}\n`);
      } else {
        // Priority 3: GitHub API
        try {
          latestTag = await getLatestMiabTag();
          console.log(`✅ Using version from GitHub API: ${latestTag}\n`);
        } catch (error) {
          // No fallback - fail with clear error
          const errorMessage = `Could not determine Mail-in-a-Box version. All resolution methods failed:
  1. Explicit override (MAILINABOX_VERSION env var): Not set
  2. SSM Parameter Store (/MailInABoxVersion-${stackInfo.stackName}): Not found
  3. GitHub API: ${error instanceof Error ? error.message : String(error)}

To fix this, please:
  - Set MAILINABOX_VERSION environment variable, or
  - Set SSM parameter /MailInABoxVersion-${stackInfo.stackName} with the desired version, or
  - Ensure GitHub API (api.github.com) is accessible

Example:
  MAILINABOX_VERSION=v73 pnpm nx run cdk-emcnotary-instance:admin:miab:audit`;
          throw new Error(errorMessage);
        }
      }
    }

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

    // Check current git status
    console.log('📋 Step 4: Checking current Mail-in-a-Box version on instance...');
    const gitStatus = await sshCommand(
      keyPath,
      instanceIp,
      `cd /opt/mailinabox && git rev-parse --abbrev-ref HEAD 2>&1 && echo "---" && git describe --tags 2>&1 || echo "No tag found"`,
      { verbose }
    );

    if (!gitStatus.success) {
      throw new Error(`Failed to check git status: ${gitStatus.error || gitStatus.output}`);
    }

    const [currentBranch, ...tagParts] = gitStatus.output.split('---');
    const currentTag = tagParts.join('---').trim() || 'unknown';
    const branch = currentBranch.trim();

    console.log(`   Current branch: ${branch}`);
    console.log(`   Current tag: ${currentTag}\n`);

    // Check if management directory exists
    console.log('📋 Step 5: Verifying management scripts...');
    const mgmtCheck = await sshCommand(
      keyPath,
      instanceIp,
      `test -f /opt/mailinabox/management/users.py && echo "EXISTS" || echo "NOT_FOUND"`,
      { verbose }
    );

    const hasManagementScripts = mgmtCheck.output.includes('EXISTS');
    console.log(`   Management scripts: ${hasManagementScripts ? '✅ EXISTS' : '❌ NOT FOUND'}\n`);

    // Compare versions
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📊 Version Comparison');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    console.log(`   Current:  ${currentTag}`);
    console.log(`   Latest:   ${latestTag}\n`);

    // Check if we're on the exact tag or on main branch (which may be ahead)
    const isExactTag = currentTag === latestTag;
    const isOnMainBranch = branch === 'main' || branch === 'master';
    const isAheadOfTag = currentTag.includes(latestTag) && currentTag !== latestTag;
    
    // Need update if: not exact tag AND (on main branch OR ahead of tag OR completely different)
    const needsUpdate = !isExactTag && (isOnMainBranch || isAheadOfTag || currentTag !== latestTag);
    
    if (needsUpdate) {
      if (isOnMainBranch) {
        console.log(`   ⚠️  UPDATE NEEDED: Instance is on ${branch} branch (should be on ${latestTag} tag)\n`);
      } else if (isAheadOfTag) {
        console.log(`   ⚠️  UPDATE NEEDED: Instance is ahead of ${latestTag} tag\n`);
      } else {
        console.log(`   ⚠️  UPDATE NEEDED: Instance is not on latest version\n`);
      }
    } else {
      console.log(`   ✅ UP TO DATE: Instance is on exact ${latestTag} tag\n`);
    }

    // Update if requested
    if (needsUpdate && update) {
      console.log('📋 Step 6: Updating to latest version...');
      
      // Fix git permissions first, then fetch all tags
      const fixPerms = await sshCommand(
        keyPath,
        instanceIp,
        `cd /opt/mailinabox && sudo chown -R root:root .git 2>/dev/null && sudo chmod -R u+rwX .git 2>/dev/null && git config --global --add safe.directory /opt/mailinabox 2>/dev/null || true`,
        { verbose }
      );

      // Fetch all tags
      const fetchResult = await sshCommand(
        keyPath,
        instanceIp,
        `cd /opt/mailinabox && git fetch --all --tags -q 2>&1`,
        { verbose }
      );

      if (!fetchResult.success) {
        // Try one more time after fixing permissions
        const retryFetch = await sshCommand(
          keyPath,
          instanceIp,
          `cd /opt/mailinabox && sudo chown -R root:root .git && sudo chmod -R u+rwX .git && git fetch --all --tags -q 2>&1`,
          { verbose }
        );

        if (!retryFetch.success) {
          throw new Error(
            `Failed to fetch tags after permission fix: ${retryFetch.error || retryFetch.output}\n` +
            `💡 Try running cleanup first: pnpm nx run cdk-emcnotary-instance:admin:miab:cleanup`
          );
        }
      }

      // Checkout latest tag
      const checkoutResult = await sshCommand(
        keyPath,
        instanceIp,
        `cd /opt/mailinabox && git checkout ${latestTag} -q 2>&1`,
        { verbose }
      );

      if (!checkoutResult.success) {
        throw new Error(`Failed to checkout ${latestTag}: ${checkoutResult.error || checkoutResult.output}`);
      }

      // Verify management directory exists
      const verifyMgmt = await sshCommand(
        keyPath,
        instanceIp,
        `test -d /opt/mailinabox/management && echo "EXISTS" || echo "NOT_FOUND"`,
        { verbose }
      );

      if (!verifyMgmt.output.includes('EXISTS')) {
        throw new Error(`Management directory not found after checkout. This is a critical error.`);
      }

      console.log(`✅ Successfully updated to ${latestTag}\n`);

      // Verify new tag
      const verifyTag = await sshCommand(
        keyPath,
        instanceIp,
        `cd /opt/mailinabox && git describe --tags 2>&1`,
        { verbose }
      );

      console.log(`   Verified tag: ${verifyTag.output}\n`);
    } else if (needsUpdate && !update) {
      console.log('💡 To update, run with UPDATE=1:\n');
      console.log(`   UPDATE=1 pnpm nx run cdk-emcnotary-instance:admin:miab:audit\n`);
    }

    // List users
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('👥 User Verification');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    if (hasManagementScripts) {
      console.log('📋 Step 7: Listing Mail-in-a-Box users...');
      
      // Detect which script to use (cli.py for v73+, users.py for older)
      const checkCliPy = `test -f /opt/mailinabox/management/cli.py && echo "CLI_EXISTS" || echo "NOT_FOUND"`;
      const checkUsersPy = `test -f /opt/mailinabox/management/users.py && echo "USERS_EXISTS" || echo "NOT_FOUND"`;
      
      const cliCheck = await sshCommand(keyPath, instanceIp, checkCliPy, { verbose });
      const usersCheck = await sshCommand(keyPath, instanceIp, checkUsersPy, { verbose });
      
      let usersCommand: string;
      if (cliCheck.output.includes('CLI_EXISTS')) {
        // v73+ uses cli.py
        usersCommand = `bash -c 'cd /opt/mailinabox && git config --global --add safe.directory /opt/mailinabox 2>/dev/null || true && sudo -u user-data /opt/mailinabox/management/cli.py user' 2>&1`;
      } else if (usersCheck.output.includes('USERS_EXISTS')) {
        // Older versions use users.py
        usersCommand = `bash -c 'cd /opt/mailinabox && git config --global --add safe.directory /opt/mailinabox 2>/dev/null || true && sudo -u user-data /opt/mailinabox/management/users.py list' 2>&1`;
      } else {
        console.log(`⚠️  Could not find management scripts (cli.py or users.py)\n`);
        return;
      }
      
      const usersResult = await sshCommand(keyPath, instanceIp, usersCommand, { verbose });

      if (usersResult.success && usersResult.output) {
        const users = usersResult.output
          .split('\n')
          .filter((line) => line.trim() && !line.includes('Traceback'))
          .map((line) => line.trim());

        if (users.length > 0) {
          console.log(`✅ Found ${users.length} user(s):\n`);
          users.forEach((user, index) => {
            console.log(`   ${index + 1}. ${user}`);
          });
          console.log('');

          // Check for admin user
          const adminUser = users.find((u) => u.toLowerCase().includes('admin@'));
          if (adminUser) {
            console.log(`✅ Admin user found: ${adminUser}\n`);
          } else {
            console.log(`⚠️  Admin user not found in user list\n`);
            console.log('💡 Create admin account:\n');
            console.log(`   pnpm nx run cdk-emcnotary-instance:admin:credentials:create\n`);
          }
        } else {
          console.log('⚠️  No users found\n');
          console.log('💡 Create admin account:\n');
          console.log(`   pnpm nx run cdk-emcnotary-instance:admin:credentials:create\n`);
        }
      } else {
        console.log(`⚠️  Could not list users: ${usersResult.error || usersResult.output || 'Unknown error'}\n`);
      }
    } else {
      console.log('⚠️  Cannot list users - management scripts not found\n');
      console.log('💡 Management scripts are required to list users.\n');
      console.log('💡 Try updating Mail-in-a-Box version:\n');
      console.log(`   UPDATE=1 pnpm nx run cdk-emcnotary-instance:admin:miab:audit\n`);
    }

    // Summary
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📊 Audit Summary');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    console.log(`   Version:     ${needsUpdate ? '⚠️  OUTDATED' : '✅ UP TO DATE'}`);
    console.log(`   Management:  ${hasManagementScripts ? '✅ AVAILABLE' : '❌ MISSING'}`);
    console.log(`   Users:       ${hasManagementScripts ? '✅ VERIFIED' : '⚠️  UNABLE TO VERIFY'}\n`);

    if (needsUpdate && !update) {
      console.log('💡 Next Steps:\n');
      console.log(`   1. Update to latest version:\n`);
      console.log(`      UPDATE=1 pnpm nx run cdk-emcnotary-instance:admin:miab:audit\n`);
      console.log(`   2. After update, verify users again:\n`);
      console.log(`      pnpm nx run cdk-emcnotary-instance:admin:users:list\n`);
    }

  } catch (error) {
    console.error('\n❌ Audit failed:');
    if (error instanceof Error) {
      console.error(`   ${error.message}\n`);
    } else {
      console.error(`   ${String(error)}\n`);
    }
    process.exit(1);
  }
}

// Parse command line arguments
const args = process.argv.slice(2);
const options: AuditOptions = {};

if (args.includes('--update') || args.includes('-u')) {
  options.update = true;
}
if (args.includes('--verbose') || args.includes('-v')) {
  options.verbose = true;
}

const domainIndex = args.indexOf('--domain');
if (domainIndex !== -1 && args[domainIndex + 1]) {
  options.domain = args[domainIndex + 1];
}

// Run if executed directly
if (require.main === module) {
  auditMiabVersion(options).catch((error) => {
    console.error('Unhandled error:', error);
    process.exit(1);
  });
}

