#!/usr/bin/env node

import { testSshForStack } from '../src/lib/ssh-test';
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
  const timeout = process.env['SSH_TEST_TIMEOUT']
    ? Number(process.env['SSH_TEST_TIMEOUT'])
    : undefined;

  log('info', 'Testing SSH connection', {
    appPath,
    stackName,
    domain,
    timeout,
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
      instanceIp: stackInfo.instancePublicIp,
      instanceKeyName: stackInfo.instanceKeyName,
    });

    if (!stackInfo.instancePublicIp) {
      throw new Error('Could not get instance IP address');
    }

    // Test SSH connection
    console.log(`\nTesting SSH connection to ${stackInfo.domain} (${stackInfo.instancePublicIp})...`);
    const result = await testSshForStack({
      instancePublicIp: stackInfo.instancePublicIp,
      domain: stackInfo.domain,
      instanceKeyName: stackInfo.instanceKeyName,
      keyPairId: stackInfo.keyPairId,
      instanceId: stackInfo.instanceId,
      region: stackInfo.region,
      profile: process.env['AWS_PROFILE'],
      ensureSetup: true, // Ensure SSH is set up if key missing or auth fails
    });

    console.log('');
    if (result.success) {
      console.log('✓ SSH connection test passed');
      process.exit(0);
    } else {
      console.log(`✗ SSH connection test failed: ${result.error}`);
      process.exit(1);
    }
  } catch (err) {
    log('error', 'SSH test failed', { error: String(err) });
    console.error('\nFatal error:', err);
    process.exit(1);
  }
}

main();

