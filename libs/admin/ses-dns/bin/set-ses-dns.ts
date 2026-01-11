#!/usr/bin/env node

import { setSesDnsRecords } from '../src';

async function main() {
  const args = process.argv.slice(2);
  const domainIndex = args.indexOf('--domain');
  const dryRunIndex = args.indexOf('--dry-run');

  const domain = domainIndex !== -1 && domainIndex + 1 < args.length ? args[domainIndex + 1] : undefined;
  const appPath = process.env['APP_PATH'];
  const dryRun = dryRunIndex !== -1;

  if (!domain && !appPath) {
    console.error('Error: Either --domain or APP_PATH environment variable is required');
    console.error('Usage: set-ses-dns --domain <domain> [--dry-run]');
    console.error('   or: APP_PATH=apps/cdk-emc-notary/core set-ses-dns [--dry-run]');
    console.error('Example: set-ses-dns --domain emcnotary.com --dry-run');
    process.exit(1);
  }

  console.log(`Setting SES DNS records${domain ? ` for domain: ${domain}` : ''}${appPath ? ` for app path: ${appPath}` : ''}`);
  if (dryRun) {
    console.log('DRY RUN MODE - No changes will be made');
  }
  console.log('----------------------------------------');

  const result = await setSesDnsRecords({
    domain,
    appPath,
    region: process.env['AWS_REGION'] || 'us-east-1',
    profile: process.env['AWS_PROFILE'] || 'hepe-admin-mfa',
    dryRun,
  });

  if (result.success) {
    if (dryRun) {
      console.log('✅ DRY RUN: DNS records would be set successfully!');
      console.log('\nRecords that would be configured:');
      if (result.records) {
        console.log(`  ${result.records.dkim1.type}: ${result.records.dkim1.name} -> ${result.records.dkim1.value}`);
        console.log(`  ${result.records.dkim2.type}: ${result.records.dkim2.name} -> ${result.records.dkim2.value}`);
        console.log(`  ${result.records.dkim3.type}: ${result.records.dkim3.name} -> ${result.records.dkim3.value}`);
        console.log(`  ${result.records.mailFromMx.type}: ${result.records.mailFromMx.name} -> ${result.records.mailFromMx.value}`);
        console.log(`  ${result.records.mailFromTxt.type}: ${result.records.mailFromTxt.name} -> ${result.records.mailFromTxt.value}`);
      }
    } else {
      console.log('✅ SES DNS records have been set successfully!');
      console.log('Please allow time for DNS propagation and verify the SES identity status in the AWS SES Console.');
      console.log('You can check DNS records using:');
      if (result.records) {
        console.log(`  dig ${result.records.dkim1.name} CNAME`);
        console.log(`  dig ${result.records.mailFromMx.name} MX`);
        console.log(`  dig ${result.records.mailFromTxt.name} TXT`);
      }
    }
  } else {
    console.error('❌ SES DNS setup failed:', result.error);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('Unexpected error:', error);
  process.exit(1);
});
