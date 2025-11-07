#!/usr/bin/env node

import { setReverseDns } from '../src/lib/reverse-dns';

async function main() {
  const appPath = process.env['APP_PATH'];
  const stackName = process.env['STACK_NAME'];
  const domain = process.env['DOMAIN'];
  const ptrRecord = process.env['PTR_RECORD'];

  try {
    const result = await setReverseDns({
      appPath,
      stackName,
      domain,
      ptrRecord,
      region: process.env['AWS_REGION'],
      profile: process.env['AWS_PROFILE'],
    });

    if (result.success) {
      console.log('\n✓ Reverse DNS set successfully');
      console.log(`  Elastic IP: ${result.elasticIp}`);
      console.log(`  PTR Record: ${result.ptrRecord}`);
      console.log(`  Allocation ID: ${result.allocationId}`);
    } else {
      console.error(`\n✗ Failed to set reverse DNS: ${result.error}`);
      process.exit(1);
    }
  } catch (err) {
    console.error('\n✗ Error:', err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}

main();

