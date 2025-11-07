#!/usr/bin/env node

import { backupBridge } from '../src/lib/backup-bridge';

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

  // Determine which backup to run
  const skipDns = process.env['SKIP_DNS'] === '1' || process.env['SKIP_DNS'] === 'true';
  const skipMail = process.env['SKIP_MAIL'] === '1' || process.env['SKIP_MAIL'] === 'true';

  log('info', 'Starting backup bridge', {
    appPath,
    stackName,
    domain,
    skipDns,
    skipMail,
  });

  try {
    const result = await backupBridge({
      appPath,
      stackName,
      domain,
      region: process.env['AWS_REGION'],
      profile: process.env['AWS_PROFILE'],
      skipDns,
      skipMail,
      dnsBucket: process.env['DNS_BACKUP_BUCKET'],
      dnsPrefix: process.env['DNS_BACKUP_PREFIX'],
      mailBucket: process.env['MAIL_BACKUP_BUCKET'],
      mailPrefix: process.env['MAIL_BACKUP_PREFIX'],
      mailInclude: process.env['MAIL_INCLUDE']?.split(',').filter(Boolean),
      mailExclude: process.env['MAIL_EXCLUDE']?.split(',').filter(Boolean),
    });

    // Print summary
    console.log('\n=== Backup Summary ===');
    console.log(`Stack: ${result.stackInfo.stackName} (${result.stackInfo.domain})`);
    console.log(`Timestamp: ${result.timestamp}`);
    console.log(`DNS Backup: ${result.summary.dnsSuccess ? '✓ Success' : '✗ Failed'}`);
    if (result.dnsBackup) {
      console.log(`  Output: ${result.dnsBackup.outputDir}`);
    }
    console.log(`Mail Backup: ${result.summary.mailSuccess ? '✓ Success' : '✗ Failed'}`);
    if (result.mailBackup) {
      console.log(`  Output: ${result.mailBackup.outDir}`);
      console.log(`  Archive: ${result.mailBackup.tarPath}`);
      if (result.mailBackup.s3Uri) {
        console.log(`  S3: ${result.mailBackup.s3Uri}`);
      }
    }

    if (result.summary.errors.length > 0) {
      console.log('\nErrors:');
      result.summary.errors.forEach((err) => console.log(`  - ${err}`));
      process.exit(1);
    }

    log('info', 'Backup bridge completed successfully', {
      dnsSuccess: result.summary.dnsSuccess,
      mailSuccess: result.summary.mailSuccess,
    });
  } catch (err) {
    log('error', 'Backup bridge failed', { error: String(err) });
    console.error('\nFatal error:', err);
    process.exit(1);
  }
}

main();

