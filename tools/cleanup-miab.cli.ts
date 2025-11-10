#!/usr/bin/env ts-node

import { getStackInfoFromApp } from '@mm/admin-stack-info';
import { getSshKeyPath } from '@mm/admin-ssh';
import { spawn } from 'child_process';

interface CleanupOptions {
  domain?: string;
  appPath?: string;
  region?: string;
  profile?: string;
  verbose?: boolean;
  preserveData?: boolean;
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
 * Cleanup Mail-in-a-Box installation
 */
async function cleanupMiab(options: CleanupOptions): Promise<void> {
  const region = options.region || process.env.AWS_REGION || 'us-east-1';
  const profile = options.profile || process.env.AWS_PROFILE || 'hepe-admin-mfa';
  const appPath = options.appPath || 'apps/cdk-emc-notary/instance';
  const domain = options.domain || process.env.DOMAIN || 'emcnotary.com';
  const verbose = options.verbose || process.env.VERBOSE === '1' || process.env.VERBOSE === 'true';
  const preserveData = options.preserveData || process.env.PRESERVE_DATA === '1' || process.env.PRESERVE_DATA === 'true';

  console.log('🧹 Mail-in-a-Box Cleanup');
  console.log(`   Domain: ${domain}`);
  console.log(`   Region: ${region}`);
  console.log(`   Profile: ${profile}`);
  console.log(`   Preserve Data: ${preserveData ? 'YES' : 'NO'}\n`);

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

    // Check current state
    console.log('📋 Step 3: Checking current Mail-in-a-Box installation...');
    const checkMiab = await sshCommand(
      keyPath,
      instanceIp,
      `test -d /opt/mailinabox && echo "EXISTS" || echo "NOT_FOUND"`,
      { verbose }
    );

    if (checkMiab.output.includes('NOT_FOUND')) {
      console.log('✅ No Mail-in-a-Box installation found - nothing to clean up\n');
      return;
    }

    console.log('⚠️  Mail-in-a-Box installation found\n');

    // Check if services are running
    console.log('📋 Step 4: Checking Mail-in-a-Box services...');
    const servicesCheck = await sshCommand(
      keyPath,
      instanceIp,
      `systemctl list-units --type=service --state=running | grep -E '(postfix|dovecot|nginx|nsd|opendkim)' | wc -l`,
      { verbose }
    );

    const runningServices = parseInt(servicesCheck.output.trim()) || 0;
    console.log(`   Running Mail-in-a-Box services: ${runningServices}\n`);

    if (runningServices > 0 && !preserveData) {
      console.log('⚠️  WARNING: Mail-in-a-Box services are running!');
      console.log('   Stopping services before cleanup...\n');
      
      const stopServices = await sshCommand(
        keyPath,
        instanceIp,
        `sudo systemctl stop postfix dovecot nginx nsd opendkim rspamd spamassassin 2>&1 || true`,
        { verbose }
      );

      if (verbose && stopServices.output) {
        console.log(`   ${stopServices.output}\n`);
      }
    }

    // Remove Mail-in-a-Box git repository
    console.log('📋 Step 5: Removing Mail-in-a-Box git repository...');
    const removeRepo = await sshCommand(
      keyPath,
      instanceIp,
      `sudo rm -rf /opt/mailinabox 2>&1`,
      { verbose }
    );

    if (!removeRepo.success) {
      throw new Error(`Failed to remove repository: ${removeRepo.error || removeRepo.output}`);
    }

    console.log('✅ Mail-in-a-Box repository removed\n');

    // Remove completion markers (so bootstrap can run fresh)
    console.log('📋 Step 6: Removing bootstrap completion markers...');
    const removeMarkers = await sshCommand(
      keyPath,
      instanceIp,
      `sudo rm -f /home/user-data/.miab_setup_complete /home/user-data/.miab_installing /home/user-data/.bootstrap_complete /home/user-data/.ses_relay_configured /home/user-data/.initial_backup_complete 2>&1 || true`,
      { verbose }
    );

    if (verbose && removeMarkers.output) {
      console.log(`   ${removeMarkers.output}\n`);
    }

    console.log('✅ Bootstrap markers removed\n');

    // Remove package markers (optional - allows package reinstall)
    if (!preserveData) {
      console.log('📋 Step 7: Removing package installation markers...');
      const removePackageMarkers = await sshCommand(
        keyPath,
        instanceIp,
        `sudo rm -f /root/.miab_packages_installed /root/.duplicity_installed 2>&1 || true`,
        { verbose }
      );

      if (verbose && removePackageMarkers.output) {
        console.log(`   ${removePackageMarkers.output}\n`);
      }

      console.log('✅ Package markers removed\n');
    } else {
      console.log('📋 Step 7: Skipping package marker removal (preserve data mode)\n');
    }

    // Verify cleanup
    console.log('📋 Step 8: Verifying cleanup...');
    const verifyCleanup = await sshCommand(
      keyPath,
      instanceIp,
      `test -d /opt/mailinabox && echo "STILL_EXISTS" || echo "REMOVED"`,
      { verbose }
    );

    if (verifyCleanup.output.includes('STILL_EXISTS')) {
      throw new Error('Cleanup verification failed - /opt/mailinabox still exists');
    }

    console.log('✅ Cleanup verified - repository removed\n');

    // Summary
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✅ Cleanup Complete');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    console.log('📋 What was removed:');
    console.log('   ✅ /opt/mailinabox (git repository)');
    console.log('   ✅ Bootstrap completion markers');
    if (!preserveData) {
      console.log('   ✅ Package installation markers\n');
    } else {
      console.log('   ⏭️  Package markers preserved (preserve data mode)\n');
    }

    console.log('📋 What was preserved:');
    if (preserveData) {
      console.log('   ✅ /home/user-data (all Mail-in-a-Box data)');
      console.log('   ✅ Installed packages');
      console.log('   ✅ System configuration\n');
    } else {
      console.log('   ⏭️  Nothing preserved (full cleanup)\n');
    }

    console.log('💡 Next Steps:\n');
    console.log('   1. Run bootstrap to install correct version:\n');
    console.log(`      pnpm nx run cdk-emcnotary-instance:admin:bootstrap-miab-ec2-instance\n`);
    console.log('   2. Verify installation:\n');
    console.log(`      pnpm nx run cdk-emcnotary-instance:admin:miab:audit\n`);
    console.log('   3. List users:\n');
    console.log(`      pnpm nx run cdk-emcnotary-instance:admin:users:list\n`);

  } catch (error) {
    console.error('\n❌ Cleanup failed:');
    if (error instanceof Error) {
      console.error(`   ${error.message}\n`);
      console.error('💡 Troubleshooting:');
      console.error('   1. Verify SSH access to the instance');
      console.error('   2. Check instance is running');
      console.error('   3. Verify you have sudo permissions');
      console.error('   4. Try running with VERBOSE=1 for detailed output\n');
    } else {
      console.error(`   ${String(error)}\n`);
    }
    process.exit(1);
  }
}

// Parse command line arguments
const args = process.argv.slice(2);
const options: CleanupOptions = {};

if (args.includes('--preserve-data') || args.includes('-p')) {
  options.preserveData = true;
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
  cleanupMiab(options).catch((error) => {
    console.error('Unhandled error:', error);
    process.exit(1);
  });
}

