#!/usr/bin/env node

import { setupSshForStack } from '../src/lib/ssh-setup';
import { getStackInfo, getStackInfoFromApp } from '@mm/admin-stack-info';

const log = (
  level: 'info' | 'warn' | 'error',
  msg: string,
  meta: Record<string, unknown> = {}
) =>
  console.log(
    JSON.stringify({ ts: new Date().toISOString(), level, msg, ...meta })
  );

async function main() {
  const appPath = process.env['APP_PATH'];
  const stackName = process.env['STACK_NAME'];
  const domain = process.env['DOMAIN'];

  log('info', 'Setting up SSH access', {
    appPath,
    stackName,
    domain,
  });

  try {
    // Get stack information
    let stackInfo;
    if (appPath) {
      stackInfo = await getStackInfoFromApp(appPath, {
        region: process.env['AWS_REGION'],
        profile: process.env['AWS_PROFILE'],
      });
    } else {
      stackInfo = await getStackInfo({
        stackName,
        domain,
        region: process.env['AWS_REGION'],
        profile: process.env['AWS_PROFILE'],
      });
    }

    log('info', 'Stack information retrieved', {
      stackName: stackInfo.stackName,
      domain: stackInfo.domain,
      instanceId: stackInfo.instanceId,
      instanceIp: stackInfo.instancePublicIp,
      keyPairId: stackInfo.keyPairId,
      instanceKeyName: stackInfo.instanceKeyName,
    });

    // Validate we have the required information (matching bash script validation)
    if (!stackInfo.keyPairId) {
      throw new Error('Could not retrieve KeyPairId from stack outputs');
    }

    if (!stackInfo.instanceId) {
      throw new Error('Could not find EC2 instance ID in the stack outputs');
    }

    if (!stackInfo.instancePublicIp) {
      throw new Error('Could not get instance IP address');
    }

    // Setup SSH key (follows setup-ssh-access.sh flow)
    const result = await setupSshForStack({
      keyPairId: stackInfo.keyPairId,
      instanceKeyName: stackInfo.instanceKeyName,
      instancePublicIp: stackInfo.instancePublicIp,
      instanceId: stackInfo.instanceId,
      domain: stackInfo.domain,
      stackName: stackInfo.stackName,
      region: stackInfo.region,
      profile: process.env['AWS_PROFILE'],
    });

    // Print results (matching bash script output format)
    console.log('----------------------------------------');
    console.log('SSH access has been set up successfully!');
    console.log('');
    console.log('Instance ID:', stackInfo.instanceId);
    console.log('Instance IP:', stackInfo.instancePublicIp);
    console.log('Key Pair:', result.keyFilePath.replace(/^.*\//, '').replace(/\.pem$/, ''));
    console.log('Key File:', result.keyFilePath);
    console.log('');

    if (result.sshConfigEntry) {
      console.log('To connect to your instance, use:');
      console.log(`ssh -i ${result.keyFilePath} ubuntu@${stackInfo.instancePublicIp}`);
      console.log('');
      console.log('Or create an SSH config entry by adding these lines to ~/.ssh/config:');
      console.log(result.sshConfigEntry);
      console.log('');
      console.log('Then you can simply connect using:');
      console.log(`ssh ${stackInfo.domain}`);
    } else {
      console.log('To connect to your instance, use:');
      console.log(`ssh -i ${result.keyFilePath} ubuntu@${stackInfo.instancePublicIp}`);
    }

    if (result.errors.length > 0) {
      console.log('');
      console.log('Warnings/Errors:');
      result.errors.forEach((err) => console.log(`  - ${err}`));
    }

    if (!result.success) {
      console.log('');
      console.log('SSH setup completed with errors. Please review the warnings above.');
      process.exit(1);
    }
  } catch (err) {
    log('error', 'SSH setup failed', { error: String(err) });
    console.error('\nFatal error:', err);
    process.exit(1);
  }
}

main();

