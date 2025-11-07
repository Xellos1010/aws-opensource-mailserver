#!/usr/bin/env node

import { setSesDnsRecords } from '../src';

async function main() {
  const args = process.argv.slice(2);
  const domainIndex = args.indexOf('--domain');
  const dryRunIndex = args.indexOf('--dry-run');

  if (domainIndex === -1 || domainIndex + 1 >= args.length) {
    console.error('Usage: set-ses-dns --domain <domain> [--dry-run]');
    console.error('Example: set-ses-dns --domain emcnotary.com --dry-run');
    process.exit(1);
  }

  const domain = args[domainIndex + 1];
  const dryRun = dryRunIndex !== -1;

  console.log(`Setting SES DNS records for domain: ${domain}`);
  if (dryRun) {
    console.log('DRY RUN MODE - No changes will be made');
  }
  console.log('----------------------------------------');

  const result = await setSesDnsRecords({
    domain,
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
