#!/usr/bin/env node

import { GoDaddyClient, setDnsHostnames, setNameservers } from '../src';

async function main() {
  const args = process.argv.slice(2);
  const operationIndex = args.indexOf('--operation');
  const domainIndex = args.indexOf('--domain');
  const ns1IpIndex = args.indexOf('--ns1-ip');
  const ns2IpIndex = args.indexOf('--ns2-ip');
  const customerIdIndex = args.indexOf('--customer-id');
  const dryRunIndex = args.indexOf('--dry-run');

  // Parse operation (dns-hostnames or nameservers)
  if (operationIndex === -1 || operationIndex + 1 >= args.length) {
    console.error('Usage: set-godaddy-dns --operation <dns-hostnames|nameservers> [options]');
    console.error('');
    console.error('For DNS hostnames:');
    console.error('  --operation dns-hostnames --domain <domain> --ns1-ip <ip> --ns2-ip <ip> [--dry-run]');
    console.error('');
    console.error('For nameservers:');
    console.error('  --operation nameservers --domain <domain> --customer-id <id> [--dry-run]');
    console.error('');
    console.error('Environment variables:');
    console.error('  GODADDY_API_KEY (required)');
    console.error('  GODADDY_API_SECRET (required)');
    console.error('  GODADDY_CUSTOMER_ID (required for nameservers)');
    console.error('  GODADDY_BASE_URL (optional, defaults to production)');
    process.exit(1);
  }

  const operation = args[operationIndex + 1];
  const apiKey = process.env['GODADDY_API_KEY'];
  const apiSecret = process.env['GODADDY_API_SECRET'];
  const customerId = process.env['GODADDY_CUSTOMER_ID'];
  const baseUrl = process.env['GODADDY_BASE_URL'];
  const dryRun = dryRunIndex !== -1;

  if (!apiKey || !apiSecret) {
    console.error('❌ Error: GODADDY_API_KEY and GODADDY_API_SECRET environment variables are required');
    process.exit(1);
  }

  const client = new GoDaddyClient({
    apiKey,
    apiSecret,
    baseUrl,
    customerId,
  });

  if (operation === 'dns-hostnames') {
    if (domainIndex === -1 || domainIndex + 1 >= args.length) {
      console.error('❌ Error: --domain is required for dns-hostnames operation');
      process.exit(1);
    }
    if (ns1IpIndex === -1 || ns1IpIndex + 1 >= args.length) {
      console.error('❌ Error: --ns1-ip is required for dns-hostnames operation');
      process.exit(1);
    }
    if (ns2IpIndex === -1 || ns2IpIndex + 1 >= args.length) {
      console.error('❌ Error: --ns2-ip is required for dns-hostnames operation');
      process.exit(1);
    }

    const domain = args[domainIndex + 1];
    const ns1Ip = args[ns1IpIndex + 1];
    const ns2Ip = args[ns2IpIndex + 1];

    console.log(`Setting DNS hostnames for domain: ${domain}`);
    console.log(`  ns1.box -> ${ns1Ip}`);
    console.log(`  ns2.box -> ${ns2Ip}`);
    if (dryRun) {
      console.log('DRY RUN MODE - No changes will be made');
    }
    console.log('----------------------------------------');

    if (dryRun) {
      console.log('✅ DRY RUN: DNS hostnames would be set successfully!');
      console.log('\nRecords that would be configured:');
      console.log(`  A: ns1.box -> ${ns1Ip}`);
      console.log(`  A: ns2.box -> ${ns2Ip}`);
      process.exit(0);
    }

    const result = await setDnsHostnames(client, {
      domain,
      ns1Ip,
      ns2Ip,
    });

    if (result.success) {
      console.log('✅ DNS hostnames have been set successfully!');
      if (result.records) {
        console.log('\nConfigured records:');
        console.log(`  ${result.records.ns1.type}: ${result.records.ns1.name} -> ${result.records.ns1.data}`);
        console.log(`  ${result.records.ns2.type}: ${result.records.ns2.name} -> ${result.records.ns2.data}`);
      }
    } else {
      console.error('❌ Failed to set DNS hostnames:', result.error);
      process.exit(1);
    }
  } else if (operation === 'nameservers') {
    if (domainIndex === -1 || domainIndex + 1 >= args.length) {
      console.error('❌ Error: --domain is required for nameservers operation');
      process.exit(1);
    }
    const configCustomerId = customerIdIndex !== -1 && customerIdIndex + 1 < args.length
      ? args[customerIdIndex + 1]
      : customerId;
    if (!configCustomerId) {
      console.error('❌ Error: --customer-id or GODADDY_CUSTOMER_ID environment variable is required');
      process.exit(1);
    }

    const domain = args[domainIndex + 1];
    const nameservers = [`ns1.box.${domain}`, `ns2.box.${domain}`];

    console.log(`Setting nameservers for domain: ${domain}`);
    console.log(`  ${nameservers[0]}`);
    console.log(`  ${nameservers[1]}`);
    if (dryRun) {
      console.log('DRY RUN MODE - No changes will be made');
    }
    console.log('----------------------------------------');

    if (dryRun) {
      console.log('✅ DRY RUN: Nameservers would be set successfully!');
      console.log('\nNameservers that would be configured:');
      for (const ns of nameservers) {
        console.log(`  ${ns}`);
      }
      process.exit(0);
    }

    const result = await setNameservers(client, {
      domain,
      customerId: configCustomerId,
      nameservers,
    });

    if (result.success) {
      console.log('✅ Nameservers have been set successfully!');
      if (result.nameservers) {
        console.log('\nConfigured nameservers:');
        for (const ns of result.nameservers) {
          console.log(`  ${ns}`);
        }
      }
      console.log('\nNote: Nameserver changes may take up to 48 hours to propagate.');
    } else {
      console.error('❌ Failed to set nameservers:', result.error);
      process.exit(1);
    }
  } else {
    console.error(`❌ Error: Unknown operation: ${operation}`);
    console.error('Valid operations: dns-hostnames, nameservers');
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('Unexpected error:', error);
  process.exit(1);
});

