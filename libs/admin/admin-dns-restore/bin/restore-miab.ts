#!/usr/bin/env node

import { restoreDnsFromBackup } from '../src/lib/restore-miab';

async function main() {
  const backupFile = process.env['BACKUP_FILE'];
  const appPath = process.env['APP_PATH'];
  const stackName = process.env['STACK_NAME'];
  const domain = process.env['DOMAIN'];
  const dryRun = process.env['DRY_RUN'] === '1';

  if (!backupFile) {
    console.error('\n✗ Missing BACKUP_FILE environment variable.');
    process.exit(1);
  }

  try {
    await restoreDnsFromBackup({
      backupFile,
      appPath,
      stackName,
      domain,
      region: process.env['AWS_REGION'],
      profile: process.env['AWS_PROFILE'],
      dryRun,
    });
    console.log('\n✓ DNS restore complete');
  } catch (err) {
    console.error(`\n✗ DNS restore failed: ${String(err)}`);
    process.exit(1);
  }
}

main();

