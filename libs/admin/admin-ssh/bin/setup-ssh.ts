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
      hasKeyPairId: !!stackInfo.keyPairId,
      hasInstanceKeyName: !!stackInfo.instanceKeyName,
      hasInstanceIp: !!stackInfo.instancePublicIp,
    });

    // Setup SSH key
    const result = await setupSshForStack({
      keyPairId: stackInfo.keyPairId,
      instanceKeyName: stackInfo.instanceKeyName,
      instancePublicIp: stackInfo.instancePublicIp,
      domain: stackInfo.domain,
      stackName: stackInfo.stackName,
      region: stackInfo.region,
      profile: process.env['AWS_PROFILE'],
    });

    // Print results
    console.log('\n=== SSH Setup Summary ===');
    console.log(`Stack: ${stackInfo.stackName} (${stackInfo.domain})`);
    console.log(`Instance IP: ${stackInfo.instancePublicIp}`);
    console.log(`Key File: ${result.keyFilePath}`);
    console.log(`Status: ${result.success ? '✓ Success' : '✗ Failed'}`);

    if (result.sshConfigEntry) {
      console.log('\nSSH Config Entry (add to ~/.ssh/config):');
      console.log(result.sshConfigEntry);
      console.log('\nThen connect using:');
      console.log(`ssh ${stackInfo.domain}`);
    } else {
      console.log('\nConnect using:');
      console.log(`ssh -i ${result.keyFilePath} ubuntu@${stackInfo.instancePublicIp}`);
    }

    if (result.errors.length > 0) {
      console.log('\nWarnings/Errors:');
      result.errors.forEach((err) => console.log(`  - ${err}`));
    }

    if (!result.success) {
      process.exit(1);
    }
  } catch (err) {
    log('error', 'SSH setup failed', { error: String(err) });
    console.error('\nFatal error:', err);
    process.exit(1);
  }
}

main();

