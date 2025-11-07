#!/usr/bin/env node

import { setupSshAccess } from '../src';

async function main() {
  const args = process.argv.slice(2);
  const domainIndex = args.indexOf('--domain');

  if (domainIndex === -1 || domainIndex + 1 >= args.length) {
    console.error('Usage: setup-ssh-access --domain <domain>');
    console.error('Example: setup-ssh-access --domain emcnotary.com');
    process.exit(1);
  }

  const domain = args[domainIndex + 1];

  console.log(`Setting up SSH access for domain: ${domain}`);
  console.log('----------------------------------------');

  const result = await setupSshAccess({
    domain,
    region: process.env['AWS_REGION'] || 'us-east-1',
    profile: process.env['AWS_PROFILE'] || 'hepe-admin-mfa',
  });

  if (result.success) {
    console.log('✅ SSH access has been set up successfully!');
    console.log();
    console.log('Instance details:');
    console.log(`  Instance ID: ${result.instanceId}`);
    console.log(`  Instance IP: ${result.instanceIp}`);
    console.log(`  Host: ${result.host}`);
    console.log(`  Key file: ${result.keyPath}`);
    console.log();
    console.log('To connect to your instance:');
    console.log(`ssh -i ${result.keyPath} ${result.host}`);
    console.log();
    console.log('Or add to ~/.ssh/config:');
    console.log(`Host ${domain}`);
    console.log(`    HostName ${result.instanceIp}`);
    console.log(`    User ubuntu`);
    console.log(`    IdentityFile ${result.keyPath}`);
    console.log(`    StrictHostKeyChecking no`);
    console.log();
    console.log(`Then: ssh ${domain}`);
  } else {
    console.error('❌ SSH setup failed:', result.error);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('Unexpected error:', error);
  process.exit(1);
});


