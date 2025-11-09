#!/usr/bin/env ts-node

import { getStackInfoFromApp } from '@mm/admin-stack-info';
import { setupSshForStack } from '@mm/admin-ssh';
import { spawn } from 'child_process';
import * as path from 'path';

/**
 * Fix SSM agent on existing instance by installing it via SSH
 */
async function fixSsmAgent(): Promise<void> {
  const domain = process.env.DOMAIN || 'emcnotary.com';
  const appPath = process.env.APP_PATH || 'apps/cdk-emc-notary/instance';
  const profile = process.env.AWS_PROFILE || 'hepe-admin-mfa';
  const region = process.env.AWS_REGION || 'us-east-1';

  console.log(`🔧 Fixing SSM agent for domain: ${domain}`);
  console.log(`   App path: ${appPath}`);
  console.log(`   Region: ${region}\n`);

  try {
    // Get stack info
    console.log('📋 Getting stack information...');
    const stackInfo = await getStackInfoFromApp(appPath, {
      domain,
      profile,
      region,
    });

    if (!stackInfo.instanceId) {
      throw new Error('Instance ID not found in stack outputs');
    }

    if (!stackInfo.instancePublicIp) {
      throw new Error('Instance public IP not found');
    }

    console.log(`✅ Found instance: ${stackInfo.instanceId}`);
    console.log(`   IP: ${stackInfo.instancePublicIp}\n`);

    // Setup SSH
    console.log('🔐 Setting up SSH access...');
    const sshResult = await setupSshForStack(stackInfo);
    console.log(`✅ SSH key ready: ${sshResult.keyFilePath}\n`);

    // Install SSM agent via SSH
    console.log('📦 Installing SSM agent on instance...');
    const sshCommand = [
      '-i',
      sshResult.keyFilePath,
      '-o',
      'StrictHostKeyChecking=no',
      '-o',
      'UserKnownHostsFile=/dev/null',
      `ubuntu@${stackInfo.instancePublicIp}`,
      `bash -c "if ! command -v amazon-ssm-agent >/dev/null 2>&1; then
        echo 'SSM agent not found, installing...';
        sudo snap install amazon-ssm-agent --classic || {
          echo 'Snap install failed, trying apt...';
          sudo apt-get update -qq;
          sudo apt-get install -y amazon-ssm-agent;
        }
      else
        echo 'SSM agent already installed';
      fi;
      # Check if installed via snap or apt
      if snap list amazon-ssm-agent >/dev/null 2>&1; then
        echo 'SSM agent installed via snap, enabling snap service...';
        sudo snap start amazon-ssm-agent || true;
        sudo snap enable amazon-ssm-agent || true;
        # Snap services use different naming
        SERVICE_NAME='snap.amazon-ssm-agent.amazon-ssm-agent.service';
      else
        echo 'SSM agent installed via apt, using systemd service...';
        SERVICE_NAME='amazon-ssm-agent.service';
        sudo systemctl enable amazon-ssm-agent || true;
        sudo systemctl restart amazon-ssm-agent || true;
      fi;
      sleep 2;
      echo '';
      echo 'SSM agent status:';
      sudo systemctl status \"\$SERVICE_NAME\" --no-pager -l 2>/dev/null || snap services amazon-ssm-agent || true;
      echo '';
      echo '✅ SSM agent installation complete';
      echo '🔄 Restarting SSM agent to refresh IAM credentials...';
      if snap list amazon-ssm-agent >/dev/null 2>&1; then
        sudo snap restart amazon-ssm-agent || true;
      else
        sudo systemctl restart amazon-ssm-agent || true;
      fi;
      echo '⏳ Waiting 15 seconds for agent to register with Systems Manager...';
      sleep 15;
      echo '✅ Done. SSM agent should be registering now.'"`,
    ];

    return new Promise((resolve, reject) => {
      const ssh = spawn('ssh', sshCommand, {
        stdio: 'inherit',
      });

      ssh.on('close', (code) => {
        if (code === 0) {
          console.log('\n✅ SSM agent fix completed successfully');
          console.log('⏳ Wait 1-2 minutes for SSM agent to register, then run:');
          console.log(`   pnpm nx run cdk-emcnotary-instance:admin:bootstrap-miab-ec2-instance:dry-run`);
          resolve();
        } else {
          reject(new Error(`SSH command exited with code ${code}`));
        }
      });

      ssh.on('error', (error) => {
        reject(error);
      });
    });
  } catch (error) {
    console.error('\n❌ Failed to fix SSM agent:');
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
  fixSsmAgent().catch((error) => {
    console.error('Unhandled error:', error);
    process.exit(1);
  });
}

