#!/usr/bin/env node

import { getStackInfo, getStackInfoFromApp } from '../src/lib/stack-info';

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
  const outputFormat = process.env['OUTPUT_FORMAT'] || 'json';

  log('info', 'Retrieving stack information', {
    appPath,
    stackName,
    domain,
    outputFormat,
  });

  try {
    let stackInfo;
    if (appPath) {
      stackInfo = await getStackInfoFromApp(appPath, {
        domain,
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

    if (outputFormat === 'json') {
      console.log(JSON.stringify(stackInfo, null, 2));
    } else {
      // Human-readable format
      console.log('\n=== Stack Information ===');
      console.log(`Stack Name: ${stackInfo.stackName}`);
      console.log(`Domain: ${stackInfo.domain}`);
      console.log(`Region: ${stackInfo.region}`);
      if (stackInfo.instanceId) {
        console.log(`Instance ID: ${stackInfo.instanceId}`);
      }
      if (stackInfo.instancePublicIp) {
        console.log(`Instance IP: ${stackInfo.instancePublicIp}`);
      }
      if (stackInfo.instanceKeyName) {
        console.log(`Instance Key Name: ${stackInfo.instanceKeyName}`);
      }
      if (stackInfo.keyPairId) {
        console.log(`Key Pair ID: ${stackInfo.keyPairId}`);
      }
      if (stackInfo.hostedZoneId) {
        console.log(`Hosted Zone ID: ${stackInfo.hostedZoneId}`);
      }
      if (stackInfo.adminPassword) {
        console.log(`Admin Password: ${stackInfo.adminPassword.substring(0, 8)}...`);
      }
      console.log('\n=== Stack Outputs ===');
      Object.entries(stackInfo.outputs).forEach(([key, value]) => {
        console.log(`${key}: ${value}`);
      });
    }
  } catch (err) {
    log('error', 'Failed to get stack info', { error: String(err) });
    console.error('\nError:', err);
    process.exit(1);
  }
}

main();

