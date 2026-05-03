#!/usr/bin/env node

import { getAdminCredentials } from '../src/lib/credentials';

async function main() {
  const appPath = process.env['APP_PATH'];
  const stackName = process.env['STACK_NAME'];
  const domain = process.env['DOMAIN'];
  const outputFormat = process.env['OUTPUT_FORMAT'] || 'human';

  try {
    const credentials = await getAdminCredentials({
      appPath,
      stackName,
      domain,
      region: process.env['AWS_REGION'],
      profile: process.env['AWS_PROFILE'],
    });

    if (outputFormat === 'json') {
      console.log(JSON.stringify(credentials, null, 2));
    } else {
      // Human-readable format
      console.log('\nAdmin credentials for Mail-in-a-Box:');
      console.log(`Username: ${credentials.email}`);
      console.log(`Password: ${credentials.password}`);
      console.log(`\nYou can access the admin interface at: ${credentials.adminUrl}`);
    }
  } catch (err) {
    console.error('\nError:', err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}

main();

