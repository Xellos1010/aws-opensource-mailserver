#!/usr/bin/env ts-node

/**
 * Set SES DNS records via Mail-in-a-Box DNS API
 * 
 * This tool:
 * 1. Ensures the domain is DNS-managed by MIAB
 * 2. Retrieves SES DNS records from core stack outputs
 * 3. Sets DNS records via Mail-in-a-Box HTTP API
 * 
 * Usage:
 *   APP_PATH=apps/cdk-emc-notary/instance DOMAIN=emcnotary.com pnpm exec tsx tools/set-ses-dns-miab.cli.ts
 */

import { getStackInfoFromApp } from '@mm/admin-stack-info';
import { getAdminCredentials } from '@mm/admin-credentials';

const appPath = process.env['APP_PATH'] || 'apps/cdk-emc-notary/instance';
const domain = process.env['DOMAIN'] || 'emcnotary.com';
const region = process.env['AWS_REGION'] || 'us-east-1';
const profile = process.env['AWS_PROFILE'] || 'hepe-admin-mfa';
const coreAppPath = process.env['CORE_APP_PATH'] || 'apps/cdk-emc-notary/core';

interface SesDnsRecord {
  name: string;
  normalizedName: string; // Without domain suffix for MIAB API
  type: 'CNAME' | 'MX' | 'TXT';
  value: string;
}

/**
 * Make API call to Mail-in-a-Box DNS API
 * Uses fetch API (matching restore-miab.ts implementation)
 */
async function makeApiCall(
  method: string,
  path: string,
  data: string | undefined,
  baseUrl: string,
  email: string,
  password: string
): Promise<{ httpCode: number; body: string }> {
  const url = `${baseUrl}${path}`;
  
  const headers: Record<string, string> = {
    'Content-Type': 'application/x-www-form-urlencoded',
  };

  const auth = Buffer.from(`${email}:${password}`).toString('base64');
  headers['Authorization'] = `Basic ${auth}`;

  // Mail-in-a-Box API: Based on restore-miab.ts, send value directly
  // fetch with Content-Type form-urlencoded will handle it
  const body = data || undefined;

  try {
    const response = await fetch(url, {
      method,
      headers,
      body,
      // @ts-expect-error - allow self-signed certificates
      rejectUnauthorized: false,
    });

    const responseBody = await response.text();
    const httpCode = response.status;

    return { httpCode, body: responseBody };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    throw new Error(`API call failed: ${errorMessage}`);
  }
}

/**
 * Check if domain is DNS-managed by Mail-in-a-Box
 */
async function checkDomainManaged(
  baseUrl: string,
  email: string,
  password: string,
  domain: string
): Promise<boolean> {
  try {
    // Try to get DNS records for the domain
    // If domain is managed, this will succeed (even if empty)
    const result = await makeApiCall(
      'GET',
      `/admin/dns/custom/${domain}`,
      undefined,
      baseUrl,
      email,
      password
    );

    // 200 means domain is managed (even if no records)
    // 400 means domain is not managed
    return result.httpCode === 200;
  } catch (error) {
    console.log(`   ⚠️  Error checking domain: ${error instanceof Error ? error.message : String(error)}`);
    return false;
  }
}

/**
 * Normalize qname for MIAB API (remove domain suffix)
 */
function normalizeQname(qname: string, domain: string): string {
  // Remove trailing domain if present
  if (qname.endsWith(`.${domain}`)) {
    return qname.slice(0, -(domain.length + 1));
  }
  return qname;
}

/**
 * Normalize DNS value for Mail-in-a-Box API
 */
function normalizeValue(value: string, rtype: string): string {
  // CNAME values MUST have a trailing period per Mail-in-a-Box API docs
  if (rtype === 'CNAME' && !value.endsWith('.')) {
    return `${value}.`;
  }
  // Keep trailing dots for CNAME, remove for others if present
  if ((rtype === 'MX' || rtype === 'NS') && value.endsWith('.')) {
    return value.slice(0, -1);
  }
  return value;
}

/**
 * Set a DNS record via MIAB API
 */
async function setDnsRecord(
  record: SesDnsRecord,
  baseUrl: string,
  email: string,
  password: string
): Promise<{ success: boolean; error?: string }> {
  try {
    // Normalize value based on record type
    const normalizedValue = normalizeValue(record.value, record.type);

    console.log(`   Setting ${record.type} record: ${record.name} → ${normalizedValue}`);

    // Mail-in-a-Box API requires full qname (with domain suffix) in the path
    // Based on successful tests, use full qname directly
    const apiPath = `/admin/dns/custom/${record.name}/${record.type}`;
    const result = await makeApiCall(
      'PUT',
      apiPath,
      normalizedValue,
      baseUrl,
      email,
      password
    );

    if (result.httpCode === 200) {
      console.log(`   ✅ Successfully set ${record.type} record for ${record.name}`);
      return { success: true };
    } else {
      const error = `HTTP ${result.httpCode}: ${result.body.substring(0, 200)}`;
      console.log(`   ❌ Failed: ${error}`);
      return { success: false, error };
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.log(`   ❌ Error: ${errorMsg}`);
    return { success: false, error: errorMsg };
  }
}

async function setSesDnsRecords() {
  console.log('\n📋 Setting SES DNS Records via Mail-in-a-Box API\n');
  console.log('='.repeat(70));
  console.log(`Domain: ${domain}`);
  console.log('='.repeat(70));
  console.log('');

  try {
    // Step 1: Get instance stack info
    console.log('📋 Step 1: Getting instance stack information...');
    const instanceStackInfo = await getStackInfoFromApp(appPath, {
      domain,
      region,
      profile,
    });

    const instanceIp = instanceStackInfo.instancePublicIp;
    const hostname = `box.${domain}`;
    const baseUrl = `https://${hostname}`;

    if (!instanceIp) {
      throw new Error('Could not determine instance IP address');
    }

    console.log(`✅ Instance IP: ${instanceIp}`);
    console.log(`✅ Base URL: ${baseUrl}\n`);

    // Step 2: Get admin credentials
    console.log('📋 Step 2: Getting Mail-in-a-Box admin credentials...');
    const credentials = await getAdminCredentials({
      domain,
      region,
      profile,
      appPath,
    });

    console.log(`✅ Admin email: ${credentials.email}\n`);

    // Step 3: Check if domain is DNS-managed
    console.log('📋 Step 3: Checking if domain is DNS-managed...');
    const isManaged = await checkDomainManaged(baseUrl, credentials.email, credentials.password, domain);
    
    if (!isManaged) {
      console.log(`   ⚠️  Domain ${domain} is not recognized as DNS-managed`);
      console.log(`   💡 The domain needs to be added to Mail-in-a-Box DNS management first.`);
      console.log(`   💡 Options:`);
      console.log(`      1. Add a mail user for ${domain} (triggers DNS zone creation)`);
      console.log(`      2. Add domain via Mail-in-a-Box UI: ${baseUrl}/admin`);
      console.log(`      3. Configure nameservers at GoDaddy to point to this instance\n`);
      
      // Try to check if mail users exist (which might trigger DNS management)
      try {
        const usersResult = await makeApiCall(
          'GET',
          '/admin/mail/users?format=json',
          undefined,
          baseUrl,
          credentials.email,
          credentials.password
        );
        
        if (usersResult.httpCode === 200) {
          const users = JSON.parse(usersResult.body);
          const domainUsers = Array.isArray(users) 
            ? users.filter((u: { email: string }) => u.email.endsWith(`@${domain}`))
            : [];
          
          if (domainUsers.length > 0) {
            console.log(`   ℹ️  Found ${domainUsers.length} mail user(s) for ${domain}`);
            console.log(`   ℹ️  Mail users exist but domain is not DNS-managed yet.`);
            console.log(`   ℹ️  You may need to add the domain explicitly via the UI.\n`);
          }
        }
      } catch (error) {
        // Ignore errors checking users
      }
      
      throw new Error(`Domain ${domain} is not DNS-managed by Mail-in-a-Box. Please add it first.`);
    }

    console.log(`✅ Domain ${domain} is DNS-managed\n`);

    // Step 4: Get SES DNS records from core stack
    console.log('📋 Step 4: Retrieving SES DNS records from core stack...');
    const coreStackInfo = await getStackInfoFromApp(coreAppPath, {
      domain,
      region,
      profile,
    });

    const coreStackName = coreStackInfo.stackName;
    if (!coreStackName) {
      throw new Error('Could not determine core stack name');
    }

    const { CloudFormationClient, DescribeStacksCommand } = await import('@aws-sdk/client-cloudformation');
    const { fromIni } = await import('@aws-sdk/credential-providers');

    const credentials_aws = fromIni({ profile });
    const cfClient = new CloudFormationClient({ region, credentials: credentials_aws });

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

    if (!dkimName1 || !dkimValue1 || !dkimName2 || !dkimValue2 || !dkimName3 || !dkimValue3 ||
        !mailFromDomain || !mailFromMx || !mailFromTxt) {
      throw new Error('Missing required SES DNS record outputs from core stack');
    }

    console.log(`✅ Retrieved SES DNS records from ${coreStackName}\n`);

    // Step 5: Prepare DNS records
    console.log('📋 Step 5: Preparing DNS records...');
    const records: SesDnsRecord[] = [
      {
        name: dkimName1,
        normalizedName: normalizeQname(dkimName1, domain),
        type: 'CNAME',
        value: dkimValue1,
      },
      {
        name: dkimName2,
        normalizedName: normalizeQname(dkimName2, domain),
        type: 'CNAME',
        value: dkimValue2,
      },
      {
        name: dkimName3,
        normalizedName: normalizeQname(dkimName3, domain),
        type: 'CNAME',
        value: dkimValue3,
      },
      {
        name: mailFromDomain,
        normalizedName: normalizeQname(mailFromDomain, domain),
        type: 'MX',
        value: mailFromMx,
      },
      {
        name: mailFromDomain,
        normalizedName: normalizeQname(mailFromDomain, domain),
        type: 'TXT',
        value: mailFromTxt,
      },
    ];

    console.log(`✅ Prepared ${records.length} DNS records\n`);

    // Step 6: Set DNS records
    console.log('📋 Step 6: Setting DNS records via Mail-in-a-Box API...\n');
    const results: Array<{ record: SesDnsRecord; success: boolean; error?: string }> = [];

    for (const record of records) {
      const result = await setDnsRecord(record, baseUrl, credentials.email, credentials.password);
      results.push({ record, ...result });
      console.log(''); // Blank line between records
    }

    // Step 7: Summary
    console.log('='.repeat(70));
    console.log('📊 Summary\n');
    
    const successful = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;

    console.log(`✅ Successfully set: ${successful} records`);
    if (failed > 0) {
      console.log(`❌ Failed: ${failed} records\n`);
      console.log('Failed records:');
      results.filter(r => !r.success).forEach(r => {
        console.log(`   - ${r.record.name} (${r.record.type}): ${r.error}`);
      });
      console.log('');
    }

    if (failed === 0) {
      console.log('✅ All SES DNS records have been set successfully!\n');
      console.log('💡 Next steps:');
      console.log('   1. Wait for DNS propagation (typically 5-60 minutes)');
      console.log('   2. Check SES console: Domain status should change to "Verified"');
      console.log('   3. Verify with: pnpm nx run cdk-emcnotary-instance:admin:ses:status\n');
    } else {
      throw new Error(`Failed to set ${failed} DNS record(s)`);
    }

  } catch (error) {
    console.error('\n❌ Error setting SES DNS records:', error);
    if (error instanceof Error) {
      console.error('   Message:', error.message);
    }
    process.exit(1);
  }
}

setSesDnsRecords().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});

