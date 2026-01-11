#!/usr/bin/env ts-node

import { getStackInfoFromApp } from '@mm/admin-stack-info';
import { getSshKeyPath } from '@mm/admin-ssh';
import { spawn } from 'child_process';
import * as path from 'path';

interface LogsOptions {
  domain?: string;
  appPath?: string;
  region?: string;
  profile?: string;
  tail?: number;
  follow?: boolean;
}

/**
 * View bootstrap logs from instance
 */
async function viewBootstrapLogs(options: LogsOptions): Promise<void> {
  const region = options.region || process.env.AWS_REGION || 'us-east-1';
  const profile = options.profile || process.env.AWS_PROFILE || 'hepe-admin-mfa';
  const appPath = options.appPath || process.env.APP_PATH || 'apps/cdk-emc-notary/instance';
  const domain = options.domain || process.env.DOMAIN;
  
  if (!domain && !appPath) {
    throw new Error('Cannot resolve domain. Provide domain or appPath');
  }
  const tail = options.tail || parseInt(process.env.TAIL || '50', 10);
  const follow = options.follow || process.env.FOLLOW === '1';

  console.log('📋 Bootstrap Logs Viewer');
  console.log(`   Domain: ${domain}`);
  console.log(`   Region: ${region}`);
  console.log(`   Profile: ${profile}\n`);

  try {
    // Get stack info (prerequisite check)
    console.log('🔍 Step 1: Getting stack information...');
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

    console.log(`✅ Found instance: ${stackInfo.instanceId}`);
    console.log(`   IP: ${stackInfo.instancePublicIp}\n`);

    // Get SSH key path (prerequisite check)
    console.log('🔍 Step 2: Getting SSH key path...');
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

    console.log(`✅ SSH key ready: ${keyPath}\n`);

    // Build SSH command
    const logFile = '/var/log/mailinabox_setup.log';
    const sshCommand = follow
      ? `tail -f ${logFile} 2>/dev/null || echo 'Log file does not exist yet'`
      : `tail -${tail} ${logFile} 2>/dev/null || echo 'Log file does not exist yet'`;

    console.log(`📝 ${follow ? 'Following' : 'Viewing'} bootstrap logs...`);
    console.log(`   Log file: ${logFile}`);
    if (!follow) {
      console.log(`   Lines: ${tail}`);
    }
    console.log(`   Press Ctrl+C to stop\n`);

    // Execute SSH command
    const sshArgs = [
      '-i',
      keyPath,
      '-o',
      'StrictHostKeyChecking=no',
      '-o',
      'UserKnownHostsFile=/dev/null',
      `ubuntu@${stackInfo.instancePublicIp}`,
      sshCommand,
    ];

    return new Promise((resolve, reject) => {
      const ssh = spawn('ssh', sshArgs, {
        stdio: 'inherit',
      });

      ssh.on('close', (code) => {
        if (code === 0 || (follow && code === null)) {
          resolve();
        } else {
          reject(new Error(`SSH command exited with code ${code}`));
        }
      });

      ssh.on('error', (error) => {
        reject(error);
      });

      // Handle Ctrl+C gracefully
      process.on('SIGINT', () => {
        console.log('\n\n⏹️  Stopping log viewer...');
        ssh.kill('SIGINT');
        resolve();
      });
    });
  } catch (error) {
    console.error('\n❌ Failed to view logs:');
    if (error instanceof Error) {
      console.error(`   ${error.message}`);
    } else {
      console.error(`   ${String(error)}`);
    }
    process.exit(1);
  }
}

// Parse command line arguments
const args = process.argv.slice(2);
const options: LogsOptions = {
  follow: args.includes('--follow') || args.includes('-f'),
};

// Parse --tail
const tailIndex = args.indexOf('--tail');
if (tailIndex !== -1 && args[tailIndex + 1]) {
  options.tail = parseInt(args[tailIndex + 1], 10);
}

// Run if executed directly
if (require.main === module) {
  viewBootstrapLogs(options).catch((error) => {
    console.error('Unhandled error:', error);
    process.exit(1);
  });
}

