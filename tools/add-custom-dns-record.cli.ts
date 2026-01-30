#!/usr/bin/env ts-node

/**
 * Add custom DNS record via Mail-in-a-Box DNS API
 *
 * Usage:
 *   RECORD_NAME=www.k3frame.com RECORD_TYPE=A RECORD_VALUE=3.211.200.169 pnpm exec tsx tools/add-custom-dns-record.cli.ts
 */

import { getStackInfoFromApp } from '@mm/admin-stack-info';
import { getAdminCredentials } from '@mm/admin-credentials';

const appPath = process.env['APP_PATH'] || 'apps/cdk-k3frame/instance';
const domain = process.env['DOMAIN'] || 'k3frame.com';
const region = process.env['AWS_REGION'] || 'us-east-1';
const profile = process.env['AWS_PROFILE'] || 'k3frame';
const recordName = process.env['RECORD_NAME'];
const recordType = process.env['RECORD_TYPE'] || 'A';
const recordValue = process.env['RECORD_VALUE'];

/**
 * Make API call to Mail-in-a-Box DNS API
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
 * Add custom DNS record
 */
async function addCustomDnsRecord() {
  if (!recordName || !recordValue) {
    console.error('❌ Error: RECORD_NAME and RECORD_VALUE are required');
    console.error('Usage: RECORD_NAME=www.k3frame.com RECORD_TYPE=A RECORD_VALUE=3.211.200.169 pnpm exec tsx tools/add-custom-dns-record.cli.ts');
    process.exit(1);
  }

  console.log('\n📋 Adding Custom DNS Record via Mail-in-a-Box API\n');
  console.log('='.repeat(70));
  console.log(`Domain: ${domain}`);
  console.log(`Record Name: ${recordName}`);
  console.log(`Record Type: ${recordType}`);
  console.log(`Record Value: ${recordValue}`);
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
    console.log('📋 Step 2: Getting admin credentials...');
    const adminCreds = await getAdminCredentials({
      appPath,
      domain,
      region,
      profile,
    });

    const adminEmail = adminCreds.email;
    const adminPassword = adminCreds.password;

    console.log(`✅ Admin email: ${adminEmail}\n`);

    // Step 3: Add DNS record
    console.log('📋 Step 3: Adding DNS record...');

    const apiPath = `/admin/dns/custom/${recordName}/${recordType}`;
    console.log(`   API Path: ${apiPath}`);
    console.log(`   Setting ${recordType} record: ${recordName} → ${recordValue}`);

    const result = await makeApiCall(
      'PUT',
      apiPath,
      recordValue,
      baseUrl,
      adminEmail,
      adminPassword
    );

    if (result.httpCode === 200) {
      console.log(`\n✅ Successfully added ${recordType} record for ${recordName}`);
      console.log(`   Response: ${result.body}\n`);
    } else {
      console.log(`\n❌ Failed to add DNS record`);
      console.log(`   HTTP ${result.httpCode}: ${result.body}\n`);
      process.exit(1);
    }

  } catch (error) {
    console.error('\n❌ Error adding DNS record:');
    if (error instanceof Error) {
      console.error(`   ${error.message}\n`);
    } else {
      console.error(`   ${String(error)}\n`);
    }
    process.exit(1);
  }
}

// Run if executed directly
if (require.main === module) {
  addCustomDnsRecord().catch((error) => {
    console.error('Unhandled error:', error);
    process.exit(1);
  });
}
