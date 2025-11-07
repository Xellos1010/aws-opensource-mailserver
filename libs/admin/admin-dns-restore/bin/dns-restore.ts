#!/usr/bin/env node

import { restoreDns } from '../src/lib/restore';
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
  const backupFile = process.env['BACKUP_FILE'];
  const hostedZoneId = process.env['HOSTED_ZONE_ID'];
  const domain = process.env['DOMAIN'];
  const appPath = process.env['APP_PATH'];
  const stackName = process.env['STACK_NAME'];
  const dryRun = process.env['DRY_RUN'] === '1' || process.env['DRY_RUN'] === 'true';

  if (!backupFile) {
    console.error('Error: BACKUP_FILE environment variable is required');
    console.error('\nUsage:');
    console.error('  BACKUP_FILE=/path/to/backup.json [HOSTED_ZONE_ID=...] [DOMAIN=...] [APP_PATH=...] [DRY_RUN=1] node dns-restore.mjs');
    console.error('\nExamples:');
    console.error('  BACKUP_FILE=Archive/backups/askdaokapra.com/dns/dns-backup-20250915-120236.json HOSTED_ZONE_ID=Z123456789 node dns-restore.mjs');
    console.error('  BACKUP_FILE=backup.json APP_PATH=apps/cdk-askdaokapra node dns-restore.mjs');
    console.error('  BACKUP_FILE=backup.json APP_PATH=apps/cdk-askdaokapra DRY_RUN=1 node dns-restore.mjs');
    process.exit(1);
  }

  let resolvedHostedZoneId = hostedZoneId;
  let resolvedDomain = domain;

  // Try to get hosted zone ID from stack info if app path is provided
  if (appPath && !resolvedHostedZoneId) {
    try {
      log('info', 'Getting stack info from app path', { appPath });
      const stackInfo = await getStackInfoFromApp(appPath, {
        region: process.env['AWS_REGION'],
        profile: process.env['AWS_PROFILE'],
      });
      resolvedHostedZoneId = stackInfo.hostedZoneId;
      resolvedDomain = stackInfo.domain;
      log('info', 'Retrieved stack info', {
        stackName: stackInfo.stackName,
        domain: resolvedDomain,
        hostedZoneId: resolvedHostedZoneId,
      });
    } catch (err) {
      log('warn', 'Could not get stack info from app path', {
        error: String(err),
      });
    }
  } else if ((stackName || domain) && !resolvedHostedZoneId) {
    try {
      log('info', 'Getting stack info', { stackName, domain });
      const stackInfo = await getStackInfo({
        stackName,
        domain,
        region: process.env['AWS_REGION'],
        profile: process.env['AWS_PROFILE'],
      });
      resolvedHostedZoneId = stackInfo.hostedZoneId;
      resolvedDomain = stackInfo.domain;
      log('info', 'Retrieved stack info', {
        stackName: stackInfo.stackName,
        domain: resolvedDomain,
        hostedZoneId: resolvedHostedZoneId,
      });
    } catch (err) {
      log('warn', 'Could not get stack info', { error: String(err) });
    }
  }

  if (dryRun) {
    console.log('\n⚠️  DRY RUN MODE - No changes will be applied\n');
  }

  try {
    const result = await restoreDns({
      backupFile,
      hostedZoneId: resolvedHostedZoneId,
      domain: resolvedDomain,
      region: process.env['AWS_REGION'],
      profile: process.env['AWS_PROFILE'],
      dryRun,
    });

    console.log('\n✓ DNS restore completed');
    console.log(`  Changes: ${result.changes}`);
    console.log(`  Created: ${result.created}`);
    console.log(`  Updated: ${result.updated}`);
    console.log(`  Skipped: ${result.skipped}`);

    if (dryRun) {
      console.log('\n⚠️  This was a dry run. Set DRY_RUN=0 to apply changes.');
    }
  } catch (err) {
    log('error', 'DNS restore failed', { error: String(err) });
    console.error('\n✗ DNS restore failed:', err);
    process.exit(1);
  }
}

main();

