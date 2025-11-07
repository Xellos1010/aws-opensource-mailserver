#!/usr/bin/env node

import { backupUsers } from '../src/lib/backup';

async function main() {
  const appPath = process.env['APP_PATH'];
  const stackName = process.env['STACK_NAME'];
  const domain = process.env['DOMAIN'];

  try {
    const result = await backupUsers({
      appPath,
      stackName,
      domain,
      region: process.env['AWS_REGION'],
      profile: process.env['AWS_PROFILE'],
      outputDir: process.env['OUTPUT_DIR'],
    });

    console.log(`\n✓ Users backup complete`);
    console.log(`  Output directory: ${result.outputDir}`);
    console.log(`  Users backed up: ${result.userCount}`);
  } catch (err) {
    console.error(`\n✗ Users backup failed: ${String(err)}`);
    process.exit(1);
  }
}

main();

