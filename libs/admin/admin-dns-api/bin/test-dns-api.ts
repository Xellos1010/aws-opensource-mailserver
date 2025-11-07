#!/usr/bin/env node

import { getAdminCredentials } from '@mm/admin-credentials';

const log = (
  level: 'info' | 'warn' | 'error',
  msg: string,
  meta: Record<string, unknown> = {}
) =>
  console.log(
    JSON.stringify({ ts: new Date().toISOString(), level, msg, ...meta })
  );

async function makeApiCall(
  method: string,
  path: string,
  data: string | undefined,
  baseUrl: string,
  email: string,
  password: string
): Promise<{ httpCode: number; body: string }> {
  const url = `${baseUrl}${path}`;
  log('info', 'Making API call', { method, url });

  const headers: Record<string, string> = {
    'Content-Type': 'application/x-www-form-urlencoded',
  };

  const auth = Buffer.from(`${email}:${password}`).toString('base64');
  headers['Authorization'] = `Basic ${auth}`;

  const body = data ? `value=${encodeURIComponent(data)}` : undefined;

  try {
    // Use node-fetch or handle self-signed certificates
    // For now, we'll use the native fetch but need to handle SSL
    const response = await fetch(url, {
      method,
      headers,
      body,
      // Note: In production, you should verify SSL certificates
      // For development/testing with self-signed certs, you may need to disable verification
      // This is handled via NODE_TLS_REJECT_UNAUTHORIZED=0 environment variable if needed
    });

    const responseBody = await response.text();
    const httpCode = response.status;

    log('info', 'API response', { method, path, httpCode });

    return { httpCode, body: responseBody };
  } catch (err) {
    log('error', 'API call failed', { error: String(err), method, path });
    throw err;
  }
}

async function main() {
  const appPath = process.env['APP_PATH'];
  const stackName = process.env['STACK_NAME'];
  const domain = process.env['DOMAIN'];

  // Get admin credentials first to get the domain
  log('info', 'Retrieving admin credentials');
  const credentials = await getAdminCredentials({
    appPath,
    stackName,
    domain,
    region: process.env['AWS_REGION'],
    profile: process.env['AWS_PROFILE'],
  });

  const testHostname = process.env['TEST_HOSTNAME'] || `test.${credentials.domain}`;
  const testValue = process.env['TEST_VALUE'] || `This is a test TXT record ${new Date().toISOString()}`;

  const baseUrl = `https://box.${credentials.domain}`;
  // API path format: /admin/dns/custom/{hostname}/{type}
  // hostname should be the full subdomain (e.g., "test.askdaokapra.com")
  const apiPath = `/admin/dns/custom/${testHostname}/TXT`;

  console.log(`\nTesting DNS API for domain: ${credentials.domain}`);
  console.log(`Test hostname: ${testHostname}`);
  console.log(`Test value: ${testValue}`);
  console.log(`API Base URL: ${baseUrl}`);
  console.log('');

  try {
    // Test 1: Add TXT record using POST
    console.log('Test 1: Adding TXT record...');
    const addResult = await makeApiCall(
      'POST',
      apiPath,
      testValue,
      baseUrl,
      credentials.email,
      credentials.password
    );
    console.log(`Response (HTTP ${addResult.httpCode}):`);
    console.log(addResult.body);
    console.log('----------------------------------------');

    if (addResult.httpCode !== 200) {
      console.error(`Error: API call failed (HTTP ${addResult.httpCode})`);
      process.exit(1);
    }

    // Test 2: Verify TXT record was added
    console.log('\nTest 2: Verifying TXT record...');
    const verifyResult = await makeApiCall(
      'GET',
      apiPath,
      undefined,
      baseUrl,
      credentials.email,
      credentials.password
    );
    console.log(`Response (HTTP ${verifyResult.httpCode}):`);
    console.log(verifyResult.body);
    console.log('----------------------------------------');

    // Test 3: Delete specific TXT record
    console.log('\nTest 3: Deleting specific TXT record...');
    const deleteResult = await makeApiCall(
      'DELETE',
      apiPath,
      testValue,
      baseUrl,
      credentials.email,
      credentials.password
    );
    console.log(`Response (HTTP ${deleteResult.httpCode}):`);
    console.log(deleteResult.body);
    console.log('----------------------------------------');

    // Test 4: Verify TXT record was deleted
    console.log('\nTest 4: Verifying TXT record was deleted...');
    const finalVerifyResult = await makeApiCall(
      'GET',
      apiPath,
      undefined,
      baseUrl,
      credentials.email,
      credentials.password
    );
    console.log(`Response (HTTP ${finalVerifyResult.httpCode}):`);
    console.log(finalVerifyResult.body);
    console.log('----------------------------------------');

    console.log('\n✓ Test completed!');
  } catch (err) {
    log('error', 'Test failed', { error: String(err) });
    console.error('\n✗ Test failed:', err);
    process.exit(1);
  }
}

main();

