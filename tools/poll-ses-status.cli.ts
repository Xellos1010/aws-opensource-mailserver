#!/usr/bin/env ts-node

/**
 * Poll SES service to verify domain verification status and DNS records
 * 
 * This tool:
 * 1. Checks SES domain verification status
 * 2. Checks DKIM verification status
 * 3. Checks Mail-From domain verification
 * 4. Verifies DNS records are visible externally
 * 5. Compares expected vs actual DNS records
 * 
 * Usage:
 *   APP_PATH=apps/cdk-emc-notary/instance DOMAIN=emcnotary.com pnpm exec tsx tools/poll-ses-status.cli.ts
 */

import { getStackInfoFromApp } from '@mm/admin-stack-info';
import { fromIni } from '@aws-sdk/credential-providers';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

const appPath = process.env['APP_PATH'] || 'apps/cdk-emc-notary/instance';
const domain = process.env['DOMAIN'] || 'emcnotary.com';
const region = process.env['AWS_REGION'] || 'us-east-1';
const profile = process.env['AWS_PROFILE'] || 'hepe-admin-mfa';
const coreAppPath = process.env['CORE_APP_PATH'] || 'apps/cdk-emc-notary/core';

interface DnsRecord {
  name: string;
  type: 'CNAME' | 'MX' | 'TXT';
  expectedValue: string;
  actualValue?: string;
  verified: boolean;
}

/**
 * Query DNS record externally
 */
async function queryDns(recordName: string, recordType: 'CNAME' | 'MX' | 'TXT'): Promise<string | null> {
  try {
    const { stdout } = await execAsync(`dig +short ${recordType} ${recordName} @8.8.8.8`);
    const result = stdout.trim();
    return result || null;
  } catch (error) {
    return null;
  }
}

/**
 * Get SES DNS records from stack outputs
 */
async function getSesDnsRecords(): Promise<DnsRecord[]> {
  const { CloudFormationClient, DescribeStacksCommand } = await import('@aws-sdk/client-cloudformation');
  const credentials = fromIni({ profile });
  const cfClient = new CloudFormationClient({ region, credentials });

  const stackInfo = await getStackInfoFromApp(coreAppPath, {
    domain,
    region,
    profile,
  });

  const coreStackName = stackInfo.stackName;
  if (!coreStackName) {
    throw new Error('Could not determine core stack name');
  }

  const stackResp = await cfClient.send(
    new DescribeStacksCommand({ StackName: coreStackName })
  );

  const stack = stackResp.Stacks?.[0];
  if (!stack?.Outputs) {
    throw new Error(`Could not retrieve core stack outputs for ${coreStackName}`);
  }

  const outputs = stack.Outputs.reduce((acc, output) => {
    acc[output.OutputKey!] = output.OutputValue!;
    return acc;
  }, {} as Record<string, string>);

  const dkimName1 = outputs['DkimDNSTokenName1'];
  const dkimValue1 = outputs['DkimDNSTokenValue1'];
  const dkimName2 = outputs['DkimDNSTokenName2'];
  const dkimValue2 = outputs['DkimDNSTokenValue2'];
  const dkimName3 = outputs['DkimDNSTokenName3'];
  const dkimValue3 = outputs['DkimDNSTokenValue3'];
  const mailFromDomain = outputs['MailFromDomain'];
  const mailFromMx = outputs['MailFromMXRecord'];
  const mailFromTxt = outputs['MailFromTXTRecord'];

  const records: DnsRecord[] = [];

  // DKIM CNAME records
  if (dkimName1 && dkimValue1) {
    records.push({
      name: dkimName1,
      type: 'CNAME',
      expectedValue: dkimValue1.endsWith('.') ? dkimValue1 : `${dkimValue1}.`,
      verified: false,
    });
  }
  if (dkimName2 && dkimValue2) {
    records.push({
      name: dkimName2,
      type: 'CNAME',
      expectedValue: dkimValue2.endsWith('.') ? dkimValue2 : `${dkimValue2}.`,
      verified: false,
    });
  }
  if (dkimName3 && dkimValue3) {
    records.push({
      name: dkimName3,
      type: 'CNAME',
      expectedValue: dkimValue3.endsWith('.') ? dkimValue3 : `${dkimValue3}.`,
      verified: false,
    });
  }

  // Mail-From MX record
  if (mailFromDomain && mailFromMx) {
    records.push({
      name: mailFromDomain,
      type: 'MX',
      expectedValue: mailFromMx,
      verified: false,
    });
  }

  // Mail-From TXT record
  if (mailFromDomain && mailFromTxt) {
    records.push({
      name: mailFromDomain,
      type: 'TXT',
      expectedValue: mailFromTxt,
      verified: false,
    });
  }

  return records;
}

async function pollSesStatus() {
  console.log('\n📊 Polling SES Service Status\n');
  console.log('='.repeat(70));
  console.log(`Domain: ${domain}`);
  console.log(`Region: ${region}`);
  console.log('='.repeat(70));
  console.log('');

  try {
    // Step 1: Get SES status
    console.log('📋 Step 1: Checking SES verification status...\n');
    
    const { SESClient, GetIdentityVerificationAttributesCommand, GetIdentityDkimAttributesCommand, GetIdentityMailFromDomainAttributesCommand } = await import('@aws-sdk/client-ses');
    const sesClient = new SESClient({
      region,
      credentials: fromIni({ profile }),
    });

    const verificationCommand = new GetIdentityVerificationAttributesCommand({
      Identities: [domain],
    });
    const verificationResponse = await sesClient.send(verificationCommand);

    const dkimCommand = new GetIdentityDkimAttributesCommand({
      Identities: [domain],
    });
    const dkimResponse = await sesClient.send(dkimCommand);

    const mailFromCommand = new GetIdentityMailFromDomainAttributesCommand({
      Identities: [domain],
    });
    const mailFromResponse = await sesClient.send(mailFromCommand);

    const verificationAttrs = verificationResponse.VerificationAttributes?.[domain];
    const dkimAttrs = dkimResponse.DkimAttributes?.[domain];
    const mailFromAttrs = mailFromResponse.MailFromDomainAttributes?.[domain];

    const domainVerificationStatus = verificationAttrs?.VerificationStatus || 'NotStarted';
    const dkimVerificationStatus = dkimAttrs?.DkimVerificationStatus || 'NotStarted';
    const mailFromVerificationStatus = mailFromAttrs?.MailFromDomainStatus?.MailFromDomainVerificationStatus || 'NotStarted';

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📊 SES Verification Status');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    const domainIcon = domainVerificationStatus === 'Success' ? '✅' : 
                       domainVerificationStatus === 'Pending' ? '⏳' : '❌';
    console.log(`${domainIcon} Domain Verification: ${domainVerificationStatus}`);

    const dkimIcon = dkimVerificationStatus === 'Success' ? '✅' : 
                     dkimVerificationStatus === 'Pending' ? '⏳' : '❌';
    console.log(`${dkimIcon} DKIM Verification: ${dkimVerificationStatus}`);
    console.log(`   DKIM Enabled: ${dkimAttrs?.DkimEnabled ? 'Yes' : 'No'}`);
    if (dkimAttrs?.DkimTokens && dkimAttrs.DkimTokens.length > 0) {
      console.log(`   DKIM Tokens: ${dkimAttrs.DkimTokens.length} token(s)`);
    }

    const mailFromIcon = mailFromVerificationStatus === 'Success' ? '✅' : 
                         mailFromVerificationStatus === 'Pending' ? '⏳' : '❌';
    console.log(`${mailFromIcon} Mail-From Verification: ${mailFromVerificationStatus || 'Not configured'}`);
    if (mailFromAttrs?.MailFromDomain) {
      console.log(`   Mail-From Domain: ${mailFromAttrs.MailFromDomain}`);
    }
    console.log('');

    // Step 2: Verify DNS records externally
    console.log('📋 Step 2: Verifying DNS records externally...\n');
    
    const expectedRecords = await getSesDnsRecords();
    
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🌐 DNS Record Verification');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    let allVerified = true;
    for (const record of expectedRecords) {
      const actualValue = await queryDns(record.name, record.type);
      record.actualValue = actualValue || undefined;
      
      // Normalize values for comparison
      const normalizedExpected = record.expectedValue.trim().toLowerCase();
      let normalizedActual = actualValue?.trim().toLowerCase() || '';
      
      // Remove quotes from TXT records (dig returns quoted values)
      if (record.type === 'TXT') {
        normalizedActual = normalizedActual.replace(/^["']|["']$/g, '');
      }
      
      // For CNAME, compare without trailing period
      const expectedCompare = normalizedExpected.replace(/\.$/, '');
      const actualCompare = normalizedActual.replace(/\.$/, '');
      
      // For MX, extract just the hostname (after priority), remove any domain suffix
      const mxMatch = normalizedActual.match(/^\d+\s+(.+?)(?:\.emcnotary\.com\.?)?$/);
      const actualMxHost = mxMatch ? mxMatch[1].replace(/\.$/, '') : normalizedActual.replace(/\.emcnotary\.com\.?$/, '').replace(/\.$/, '');
      const expectedMxHost = normalizedExpected.match(/^\d+\s+(.+)$/)?.[1]?.replace(/\.$/, '') || normalizedExpected.replace(/\.$/, '');
      
      const isVerified = record.type === 'MX' 
        ? actualMxHost === expectedMxHost
        : record.type === 'TXT'
        ? normalizedActual === normalizedExpected
        : actualCompare === expectedCompare || actualCompare === `${expectedCompare}.`;
      
      record.verified = isVerified;
      if (!isVerified) {
        allVerified = false;
      }

      const icon = isVerified ? '✅' : '❌';
      console.log(`${icon} ${record.type} ${record.name}`);
      console.log(`   Expected: ${record.expectedValue}`);
      if (actualValue) {
        console.log(`   Actual:   ${actualValue}`);
      } else {
        console.log(`   Actual:   (not found)`);
      }
      console.log('');
    }

    // Step 3: Summary
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📊 Summary');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    const verifiedCount = expectedRecords.filter(r => r.verified).length;
    const totalCount = expectedRecords.length;

    console.log(`✅ DNS Records Verified: ${verifiedCount}/${totalCount}`);
    console.log(`✅ Domain Verification: ${domainVerificationStatus}`);
    console.log(`✅ DKIM Verification: ${dkimVerificationStatus}`);
    console.log(`✅ Mail-From Verification: ${mailFromVerificationStatus || 'Not configured'}\n`);

    if (domainVerificationStatus === 'Success' && dkimVerificationStatus === 'Success' && allVerified) {
      console.log('🎉 All SES services are active and verified!\n');
    } else {
      console.log('⚠️  SES verification needs attention:\n');
      
      if (domainVerificationStatus !== 'Success') {
        console.log(`   • Domain verification is ${domainVerificationStatus}`);
        console.log(`     Action: Ensure DNS records are set and propagated\n`);
      }
      
      if (dkimVerificationStatus !== 'Success') {
        console.log(`   • DKIM verification is ${dkimVerificationStatus}`);
        console.log(`     Action: Verify DKIM CNAME records are correctly set\n`);
      }
      
      if (!allVerified) {
        const failedRecords = expectedRecords.filter(r => !r.verified);
        console.log(`   • ${failedRecords.length} DNS record(s) not matching expected values:`);
        failedRecords.forEach(r => {
          console.log(`     - ${r.name} (${r.type})`);
        });
        console.log('');
      }
    }

  } catch (error) {
    console.error('\n❌ Error polling SES status:', error);
    if (error instanceof Error) {
      console.error('   Message:', error.message);
    }
    process.exit(1);
  }
}

pollSesStatus().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});

