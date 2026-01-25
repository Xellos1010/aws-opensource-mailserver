#!/usr/bin/env ts-node

/**
 * Print SES DNS records in a format suitable for manual entry in GoDaddy DNS management
 * 
 * This tool retrieves SES DNS records from the core stack (using admin:info) and formats
 * them for manual entry in GoDaddy's DNS management interface.
 * 
 * These are the DNS records that AWS SES provides for domain verification:
 * - 3 DKIM CNAME records (for email signing)
 * - 1 Mail-From MX record (for bounce/complaint handling)
 * - 1 Mail-From SPF TXT record (for SPF validation)
 * 
 * Usage:
 *   APP_PATH=apps/cdk-emc-notary/core DOMAIN=emcnotary.com pnpm exec tsx tools/print-ses-dns-records.cli.ts
 * 
 * Or use the Nx target:
 *   pnpm nx run cdk-emcnotary-instance:admin:ses-dns:print
 */

import { getStackInfoFromApp } from '@mm/admin-stack-info';

const coreAppPath = process.env['APP_PATH'] || 'apps/cdk-emc-notary/core';
const domain = process.env['DOMAIN'] || 'emcnotary.com';
const region = process.env['AWS_REGION'] || 'us-east-1';
const profile = process.env['AWS_PROFILE'] || 'hepe-admin-mfa';

async function printDnsRecords() {
  console.log('\n📋 SES DNS Records for Mail-in-a-Box NSD Nameserver\n');
  console.log('='.repeat(70));
  console.log(`Domain: ${domain}`);
  console.log('='.repeat(70));
  console.log('\n📝 Mail-in-a-Box uses NSD (Name Server Daemon) as the authoritative DNS nameserver.\n');
  console.log('   These DNS records will be set via Mail-in-a-Box\'s DNS API.\n');
  console.log('   Once published in NSD, AWS SES will detect them and verify the domain.\n');

  try {
    // Get SES DNS records from core stack using admin:info equivalent
    const stackInfo = await getStackInfoFromApp(coreAppPath, { domain, region, profile });
    const outputs = stackInfo.outputs;

    const dkimName1 = outputs['DkimDNSTokenName1'];
    const dkimValue1 = outputs['DkimDNSTokenValue1'];
    const dkimName2 = outputs['DkimDNSTokenName2'];
    const dkimValue2 = outputs['DkimDNSTokenValue2'];
    const dkimName3 = outputs['DkimDNSTokenName3'];
    const dkimValue3 = outputs['DkimDNSTokenValue3'];
    const mailFromMx = outputs['MailFromMXRecord'];
    const mailFromTxt = outputs['MailFromTXTRecord'];

    if (!dkimName1 || !dkimValue1 || !dkimName2 || !dkimValue2 || !dkimName3 || !dkimValue3 ||
        !mailFromMx || !mailFromTxt) {
      throw new Error('Missing required SES DNS record outputs from core stack');
    }

    const records = {
      dkimRecords: [
        { name: dkimName1, value: dkimValue1 },
        { name: dkimName2, value: dkimValue2 },
        { name: dkimName3, value: dkimValue3 },
      ],
      mailFromMx,
      mailFromTxt,
    };

    console.log('📌 DKIM Records (CNAME) - Add these 3 records:\n');
    console.log('─'.repeat(60));
    
    records.dkimRecords.forEach((dkim, index) => {
      // For MIAB API, use normalized qname (without domain suffix)
      const normalizedName = dkim.name.replace(`.${domain}`, '');
      console.log(`\n${index + 1}. DKIM Record #${index + 1}`);
      console.log(`   Full QNAME: ${dkim.name}`);
      console.log(`   Normalized: ${normalizedName} (for MIAB API)`);
      console.log(`   Type:        CNAME`);
      console.log(`   Value:       ${dkim.value}. (with trailing period)`);
      console.log(`   API Endpoint: PUT /admin/dns/custom/${normalizedName}/CNAME`);
    });

    console.log('\n\n📌 Mail From Records - Add these 2 records:\n');
    console.log('─'.repeat(60));
    
    // MX Record
    console.log('\n4. Mail From MX Record');
    console.log(`   Full QNAME: mail.${domain}`);
    console.log(`   Normalized: mail (for MIAB API)`);
    console.log(`   Type:        MX`);
    console.log(`   Value:       ${records.mailFromMx}`);
    console.log(`   API Endpoint: PUT /admin/dns/custom/mail/MX`);

    // TXT Record
    console.log('\n5. Mail From SPF TXT Record');
    console.log(`   Full QNAME: mail.${domain}`);
    console.log(`   Normalized: mail (for MIAB API)`);
    console.log(`   Type:        TXT`);
    console.log(`   Value:       ${records.mailFromTxt}`);
    console.log(`   API Endpoint: PUT /admin/dns/custom/mail/TXT`);

    console.log('\n\n📝 Instructions for Setting DNS Records via Mail-in-a-Box API:\n');
    console.log('1. Ensure the domain is recognized by Mail-in-a-Box for DNS management');
    console.log('   - Run: pnpm nx run cdk-emcnotary-instance:admin:nameserver:audit');
    console.log('   - The domain must be in the DNS-managed domains list');
    console.log('2. Set DNS records via Mail-in-a-Box API:');
    console.log('   - Use the normalized qnames shown above (without domain suffix)');
    console.log('   - CNAME values must end with a trailing period');
    console.log('   - Use PUT method for single-value records');
    console.log('3. Or use the automated setup:');
    console.log('   - Run: pnpm nx run cdk-emcnotary-instance:admin:ses-dns');
    console.log('4. Wait for DNS propagation (typically 5-60 minutes)');
    console.log('5. Check SES console: The domain status will change to "Verified" once AWS detects the records');
    console.log('6. Verify locally with: pnpm nx run cdk-emcnotary-instance:admin:ses:status\n');

    // Also print in curl command format for MIAB API
    console.log('\n\n📋 Curl Commands for Mail-in-a-Box API:\n');
    console.log('─'.repeat(70));
    console.log(`# Set these records via MIAB API (replace ADMIN_EMAIL and ADMIN_PASSWORD)`);
    console.log(`MIAB_HOST="https://box.${domain}"`);
    console.log(`ADMIN_EMAIL="admin@${domain}"`);
    console.log(`ADMIN_PASSWORD="<your-password>"`);
    console.log('');
    
    records.dkimRecords.forEach((dkim, index) => {
      const normalizedName = dkim.name.replace(`.${domain}`, '');
      console.log(`# DKIM Record #${index + 1}`);
      console.log(`curl -k -u "\${ADMIN_EMAIL}:\${ADMIN_PASSWORD}" -X PUT -d "value=${dkim.value}." "\${MIAB_HOST}/admin/dns/custom/${normalizedName}/CNAME"`);
      console.log('');
    });
    
    console.log(`# Mail From MX Record`);
    console.log(`curl -k -u "\${ADMIN_EMAIL}:\${ADMIN_PASSWORD}" -X PUT -d "value=${records.mailFromMx}" "\${MIAB_HOST}/admin/dns/custom/mail/MX"`);
    console.log('');
    console.log(`# Mail From SPF TXT Record`);
    console.log(`curl -k -u "\${ADMIN_EMAIL}:\${ADMIN_PASSWORD}" -X PUT -d "value=${records.mailFromTxt}" "\${MIAB_HOST}/admin/dns/custom/mail/TXT"`);
    console.log('');

    console.log('\n' + '='.repeat(60) + '\n');

  } catch (error) {
    console.error('❌ Error retrieving SES DNS records:', error);
    if (error instanceof Error) {
      console.error('   Message:', error.message);
    }
    process.exit(1);
  }
}

printDnsRecords().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});

