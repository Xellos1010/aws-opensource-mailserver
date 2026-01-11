#!/usr/bin/env ts-node

/**
 * Cleanup disk space on Mail-in-a-Box instance
 * Removes old logs, temp files, and other unnecessary data
 */

import { getStackInfoFromApp } from '@mm/admin-stack-info';
import { getSshKeyPath } from '@mm/admin-ssh';
import { spawn } from 'child_process';

interface CleanupOptions {
  domain?: string;
  appPath?: string;
  region?: string;
  profile?: string;
  dryRun?: boolean;
}

/**
 * Execute SSH command
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
      '-o',
      'LogLevel=ERROR',
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
        error: error.trim() || undefined,
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
 * Check disk usage
 */
async function checkDiskUsage(
  keyPath: string,
  instanceIp: string
): Promise<{ total: string; used: string; available: string; percent: string }> {
  const result = await sshCommand(
    keyPath,
    instanceIp,
    "df -h / | tail -1 | awk '{print $2,$3,$4,$5}'"
  );

  if (!result.success) {
    throw new Error(`Failed to check disk usage: ${result.error || 'Unknown error'}`);
  }

  const parts = result.output.split(/\s+/);
  return {
    total: parts[0] || 'unknown',
    used: parts[1] || 'unknown',
    available: parts[2] || 'unknown',
    percent: parts[3] || 'unknown',
  };
}

/**
 * Cleanup operations
 */
async function cleanupDiskSpace(
  keyPath: string,
  instanceIp: string,
  dryRun: boolean
): Promise<{ cleaned: number; errors: string[] }> {
  const errors: string[] = [];
  let cleanedMB = 0;

  console.log('🧹 Starting disk cleanup...\n');

  // 1. Clean apt cache
  console.log('1. Cleaning apt cache...');
  if (!dryRun) {
    const aptResult = await sshCommand(
      keyPath,
      instanceIp,
      'sudo apt-get clean && sudo apt-get autoclean 2>&1'
    );
    if (aptResult.success) {
      console.log('   ✅ Apt cache cleaned');
    } else {
      errors.push(`Apt cleanup: ${aptResult.error || 'Unknown error'}`);
      console.log(`   ⚠️  Apt cleanup warning: ${aptResult.error || 'Unknown error'}`);
    }
  } else {
    console.log('   [DRY RUN] Would clean apt cache');
  }

  // 2. Remove old log files (keep last 7 days)
  console.log('\n2. Cleaning old log files...');
  if (!dryRun) {
    const logResult = await sshCommand(
      keyPath,
      instanceIp,
      'sudo find /var/log -type f -name "*.log" -mtime +7 -delete 2>&1 && echo "LOGS_CLEANED"'
    );
    if (logResult.output.includes('LOGS_CLEANED')) {
      console.log('   ✅ Old log files removed');
    } else {
      console.log(`   ⚠️  Log cleanup: ${logResult.error || 'No old logs found'}`);
    }
  } else {
    console.log('   [DRY RUN] Would remove log files older than 7 days');
  }

  // 3. Clean journal logs
  console.log('\n3. Cleaning journal logs...');
  if (!dryRun) {
    const journalResult = await sshCommand(
      keyPath,
      instanceIp,
      'sudo journalctl --vacuum-time=7d 2>&1 | grep -E "Vacuumed|Freed" || echo "JOURNAL_CLEANED"'
    );
    if (journalResult.success || journalResult.output.includes('JOURNAL_CLEANED')) {
      console.log('   ✅ Journal logs cleaned');
      // Extract freed space if available
      const freedMatch = journalResult.output.match(/Freed\s+(\d+\.?\d*)\s*(MB|GB)/i);
      if (freedMatch) {
        const value = parseFloat(freedMatch[1]);
        const unit = freedMatch[2].toUpperCase();
        cleanedMB += unit === 'GB' ? value * 1024 : value;
      }
    } else {
      errors.push(`Journal cleanup: ${journalResult.error || 'Unknown error'}`);
      console.log(`   ⚠️  Journal cleanup warning: ${journalResult.error || 'Unknown error'}`);
    }
  } else {
    console.log('   [DRY RUN] Would clean journal logs older than 7 days');
  }

  // 4. Clean temporary files
  console.log('\n4. Cleaning temporary files...');
  if (!dryRun) {
    const tmpResult = await sshCommand(
      keyPath,
      instanceIp,
      'sudo find /tmp -type f -mtime +1 -delete 2>&1 && echo "TMP_CLEANED"'
    );
    if (tmpResult.output.includes('TMP_CLEANED')) {
      console.log('   ✅ Temporary files cleaned');
    } else {
      console.log(`   ⚠️  Temp cleanup: ${tmpResult.error || 'No temp files found'}`);
    }
  } else {
    console.log('   [DRY RUN] Would remove temp files older than 1 day');
  }

  // 5. Clean Mail-in-a-Box temp files
  console.log('\n5. Cleaning Mail-in-a-Box temp files...');
  if (!dryRun) {
    const miabTmpResult = await sshCommand(
      keyPath,
      instanceIp,
      'sudo find /home/user-data -type f -name "*.tmp" -mtime +1 -delete 2>&1 && echo "MIAB_TMP_CLEANED"'
    );
    if (miabTmpResult.output.includes('MIAB_TMP_CLEANED')) {
      console.log('   ✅ Mail-in-a-Box temp files cleaned');
    } else {
      console.log(`   ⚠️  MIAB temp cleanup: ${miabTmpResult.error || 'No temp files found'}`);
    }
  } else {
    console.log('   [DRY RUN] Would remove Mail-in-a-Box temp files');
  }

  // 6. Clean old Docker images/containers (if Docker is installed)
  console.log('\n6. Checking for Docker cleanup...');
  if (!dryRun) {
    const dockerCheck = await sshCommand(keyPath, instanceIp, 'which docker >/dev/null 2>&1 && echo "DOCKER_EXISTS"');
    if (dockerCheck.output.includes('DOCKER_EXISTS')) {
      const dockerResult = await sshCommand(
        keyPath,
        instanceIp,
        'sudo docker system prune -af --volumes 2>&1 | grep -E "Total reclaimed|reclaimed" || echo "DOCKER_CLEANED"'
      );
      if (dockerResult.output.includes('DOCKER_CLEANED') || dockerResult.output.includes('reclaimed')) {
        console.log('   ✅ Docker cleanup completed');
        const reclaimedMatch = dockerResult.output.match(/(\d+\.?\d*)\s*(MB|GB)/i);
        if (reclaimedMatch) {
          const value = parseFloat(reclaimedMatch[1]);
          const unit = reclaimedMatch[2].toUpperCase();
          cleanedMB += unit === 'GB' ? value * 1024 : value;
        }
      } else {
        console.log(`   ⚠️  Docker cleanup: ${dockerResult.error || 'No Docker data to clean'}`);
      }
    } else {
      console.log('   ℹ️  Docker not installed, skipping');
    }
  } else {
    console.log('   [DRY RUN] Would clean Docker images/containers');
  }

  // 7. Remove old kernel packages (keep current and one previous)
  console.log('\n7. Cleaning old kernel packages...');
  if (!dryRun) {
    const kernelResult = await sshCommand(
      keyPath,
      instanceIp,
      'sudo apt-get autoremove -y 2>&1 | grep -E "removed|autoremoved" || echo "KERNEL_CLEANED"'
    );
    if (kernelResult.output.includes('KERNEL_CLEANED') || kernelResult.output.includes('removed')) {
      console.log('   ✅ Old kernel packages removed');
    } else {
      console.log(`   ⚠️  Kernel cleanup: ${kernelResult.error || 'No old kernels found'}`);
    }
  } else {
    console.log('   [DRY RUN] Would remove old kernel packages');
  }

  return { cleaned: cleanedMB, errors };
}

/**
 * Main cleanup function
 */
async function cleanupDiskSpaceMain(options: CleanupOptions): Promise<void> {
  const region = options.region || process.env.AWS_REGION || 'us-east-1';
  const profile = options.profile || process.env.AWS_PROFILE || 'hepe-admin-mfa';
  const appPath = options.appPath || process.env.APP_PATH || 'apps/cdk-emc-notary/instance';
  const domain = options.domain || process.env.DOMAIN;
  
  if (!domain && !appPath) {
    throw new Error('Cannot resolve domain. Provide domain or appPath');
  }
  const dryRun = options.dryRun || false;

  console.log('🧹 Disk Space Cleanup');
  console.log(`   Domain: ${domain}`);
  console.log(`   Region: ${region}`);
  console.log(`   Profile: ${profile}`);
  console.log(`   Dry run: ${dryRun ? 'Yes' : 'No'}\n`);

  // Get stack info
  const stackInfo = await getStackInfoFromApp(appPath, {
    domain,
    region,
    profile,
  });

  if (!stackInfo.instanceId || !stackInfo.instancePublicIp) {
    throw new Error('Instance ID or IP not found in stack outputs');
  }

  console.log(`✅ Found instance: ${stackInfo.instanceId}`);
  console.log(`   IP: ${stackInfo.instancePublicIp}\n`);

  // Get SSH key
  const keyPath = await getSshKeyPath({
    appPath,
    domain,
    region,
    profile,
    ensureSetup: true,
  });

  if (!keyPath) {
    throw new Error('SSH key not found');
  }

  // Check disk usage before
  console.log('📊 Checking disk usage before cleanup...');
  const beforeUsage = await checkDiskUsage(keyPath, stackInfo.instancePublicIp);
  console.log(`   Total: ${beforeUsage.total}`);
  console.log(`   Used: ${beforeUsage.used} (${beforeUsage.percent})`);
  console.log(`   Available: ${beforeUsage.available}\n`);

  // Perform cleanup
  const cleanupResult = await cleanupDiskSpace(keyPath, stackInfo.instancePublicIp, dryRun);

  // Check disk usage after
  console.log('\n📊 Checking disk usage after cleanup...');
  const afterUsage = await checkDiskUsage(keyPath, stackInfo.instancePublicIp);
  console.log(`   Total: ${afterUsage.total}`);
  console.log(`   Used: ${afterUsage.used} (${afterUsage.percent})`);
  console.log(`   Available: ${afterUsage.available}\n`);

  // Summary
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📊 Cleanup Summary');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  
  if (cleanupResult.cleaned > 0) {
    console.log(`✅ Cleaned approximately ${cleanupResult.cleaned.toFixed(2)} MB`);
  }
  
  if (cleanupResult.errors.length > 0) {
    console.log(`⚠️  ${cleanupResult.errors.length} warning(s) during cleanup:`);
    for (const error of cleanupResult.errors) {
      console.log(`   - ${error}`);
    }
  } else {
    console.log('✅ Cleanup completed successfully');
  }

  console.log(`\n   Disk usage: ${beforeUsage.percent} → ${afterUsage.percent}`);
  console.log(`   Available space: ${beforeUsage.available} → ${afterUsage.available}\n`);
}

/**
 * Main function
 */
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const options: CleanupOptions = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--domain' && args[i + 1]) {
      options.domain = args[i + 1];
      i++;
    } else if (arg === '--dry-run') {
      options.dryRun = true;
    }
  }

  try {
    await cleanupDiskSpaceMain(options);
  } catch (error) {
    console.error(`\n❌ Error: ${String(error)}`);
    if (error instanceof Error && error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error('Unhandled error:', error);
    process.exit(1);
  });
}


