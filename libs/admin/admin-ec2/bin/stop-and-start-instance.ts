#!/usr/bin/env node

import { getStackInfo } from '@mm/admin-stack-info';
import { stopAndStart } from '../src/lib/ec2';

async function main() {
  // Get domain from argument or environment variable, default to emcnotary.com
  const domain =
    process.argv[2] || process.env['DOMAIN'] || 'emcnotary.com';

  console.log(`Resolving EC2 instance for domain: ${domain}`);

  try {
    // Get stack info which will resolve the instance ID
    // Try instance stack first, then fallback to legacy format
    let stackInfo;
    try {
      stackInfo = await getStackInfo({
        domain,
        region: process.env['AWS_REGION'],
        profile: process.env['AWS_PROFILE'],
      });
    } catch (err: unknown) {
      // If canonical stack name fails, try legacy format: {domain}-mailserver
      const error = err as { Code?: string };
      if (error?.Code === 'ValidationError') {
        console.log(`Stack not found with canonical name, trying legacy format...`);
        const legacyStackName = domain.replace(/\./g, '-') + '-mailserver';
        stackInfo = await getStackInfo({
          stackName: legacyStackName,
          domain,
          region: process.env['AWS_REGION'],
          profile: process.env['AWS_PROFILE'],
        });
      } else {
        throw err;
      }
    }

    if (!stackInfo.instanceId) {
      throw new Error(
        `Instance ID not found in stack outputs for ${stackInfo.stackName}. Available outputs: ${Object.keys(stackInfo.outputs).join(', ')}`
      );
    }

    console.log(`Found instance ID: ${stackInfo.instanceId}`);
    console.log(`Stack: ${stackInfo.stackName}`);
    console.log(`Region: ${stackInfo.region}`);
    console.log('');

    // Perform stop-and-start operation
    await stopAndStart(stackInfo.instanceId);
  } catch (err) {
    console.error('\nError:', err);
    process.exit(1);
  }
}

main();

