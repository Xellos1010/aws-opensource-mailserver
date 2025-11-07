#!/usr/bin/env node

import { provisionInstance } from '../src';

async function main() {
  const args = process.argv.slice(2);
  const domainIndex = args.indexOf('--domain');
  const skipSshIndex = args.indexOf('--skip-ssh');
  const skipSesDnsIndex = args.indexOf('--skip-ses-dns');

  if (domainIndex === -1 || domainIndex + 1 >= args.length) {
    console.error('Usage: provision-instance --domain <domain> [--skip-ssh] [--skip-ses-dns]');
    console.error('Example: provision-instance --domain emcnotary.com --skip-ssh');
    process.exit(1);
  }

  const domain = args[domainIndex + 1];
  const skipSsh = skipSshIndex !== -1;
  const skipSesDns = skipSesDnsIndex !== -1;

  console.log(`Provisioning instance for domain: ${domain}`);
  console.log(`Skip SSH: ${skipSsh}`);
  console.log(`Skip SES DNS: ${skipSesDns}`);
  console.log('----------------------------------------');

  const result = await provisionInstance({
    domain,
    region: process.env['AWS_REGION'] || 'us-east-1',
    profile: process.env['AWS_PROFILE'] || 'hepe-admin-mfa',
    skipSsh,
    skipSesDns,
  });

  if (result.success) {
    console.log('✅ Instance provisioning completed successfully!');
    console.log();

    if (result.sshResult) {
      console.log('SSH Access:');
      console.log(`  Instance: ${result.sshResult.instanceId} (${result.sshResult.instanceIp})`);
      console.log(`  Host: ${result.sshResult.host}`);
      console.log(`  Key file: ${result.sshResult.keyPath}`);
      console.log();
    }

    if (result.sesDnsResult) {
      console.log('SES DNS Records:');
      console.log(`  Records configured: ${result.sesDnsResult.recordsConfigured}`);
      console.log('  Please allow time for DNS propagation');
      console.log();
    }

    if (!result.sshResult && !result.sesDnsResult) {
      console.log('No provisioning steps were executed (both SSH and SES DNS were skipped)');
    }
  } else {
    console.error('❌ Instance provisioning failed:', result.error);
    if (result.sshResult) {
      console.error('SSH setup may have partially succeeded:', result.sshResult);
    }
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('Unexpected error:', error);
  process.exit(1);
});
