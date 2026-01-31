#!/usr/bin/env ts-node

/**
 * Setup Website DNS A Records via Mail-in-a-Box DNS API
 *
 * This tool sets A records for:
 * 1. The root domain (e.g., k3frame.com)
 * 2. The www subdomain (e.g., www.k3frame.com)
 *
 * IP address can be:
 * - Provided directly via WEBSITE_IP env var or --ip flag
 * - Retrieved from a CloudFormation stack (WEBSITE_STACK_NAME)
 *
 * IMPORTANT: This tool uses TWO AWS profiles:
 * - WEBSITE_PROFILE (default: k3frame) - for looking up website stack IP
 * - AWS_PROFILE (default: hepe-admin-mfa) - for MIAB instance operations
 *
 * Usage:
 *   # With explicit IP:
 *   WEBSITE_IP=1.2.3.4 pnpm nx run cdk-k3frame-instance:admin:dns:setup-website
 *
 *   # With CloudFormation stack (uses k3frame profile for website stack):
 *   WEBSITE_STACK_NAME=k3frame-react-webserver pnpm nx run cdk-k3frame-instance:admin:dns:setup-website
 *
 *   # Dry run:
 *   WEBSITE_IP=1.2.3.4 DRY_RUN=1 pnpm nx run cdk-k3frame-instance:admin:dns:setup-website
 */

import { CloudFormationClient, DescribeStacksCommand } from '@aws-sdk/client-cloudformation';
import { fromIni } from '@aws-sdk/credential-providers';
import { getAdminCredentials } from '@mm/admin-credentials';
import { getStackInfoFromApp } from '@mm/admin-stack-info';
import * as https from 'node:https';

interface SetupWebsiteDnsOptions {
  domain?: string;
  websiteIp?: string;
  websiteStackName?: string;
  websiteProfile?: string; // AWS profile for website stack lookup (default: k3frame)
  appPath?: string;
  region?: string;
  profile?: string; // AWS profile for MIAB instance operations (default: hepe-admin-mfa)
  dryRun?: boolean;
  verbose?: boolean;
}

/**
 * Get CloudFormation stack output by key
 */
async function getStackOutput(
  stackName: string,
  outputKey: string,
  region: string,
  profile: string
): Promise<string> {
  const credentials = fromIni({ profile });
  const cfClient = new CloudFormationClient({ region, credentials });

  const response = await cfClient.send(
    new DescribeStacksCommand({ StackName: stackName })
  );

  const stack = response.Stacks?.[0];
  if (!stack) {
    throw new Error(`Stack ${stackName} not found`);
  }

  const output = stack.Outputs?.find((o) => o.OutputKey === outputKey);
  if (!output || !output.OutputValue) {
    throw new Error(
      `Output ${outputKey} not found in stack ${stackName}. Available outputs: ${stack.Outputs?.map((o) => o.OutputKey).join(', ') || 'none'}`
    );
  }

  return output.OutputValue;
}

/**
 * Makes API call to Mail-in-a-Box DNS API
 * Uses https module with rejectUnauthorized: false to handle self-signed certificates
 */
async function makeApiCall(
  method: string,
  apiPath: string,
  data: string | undefined,
  baseUrl: string,
  email: string,
  password: string
): Promise<{ httpCode: number; body: string }> {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(baseUrl);
    const fullPath = `${parsedUrl.pathname}${apiPath}`.replace(/\/+/g, '/');

    const auth = Buffer.from(`${email}:${password}`).toString('base64');

    const options: https.RequestOptions = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || 443,
      path: fullPath,
      method,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${auth}`,
        'User-Agent': 'Mail-in-a-Box-DNS-Setup/1.0',
      },
      rejectUnauthorized: false, // Allow self-signed certificates
      timeout: 30000, // 30 second timeout
    };

    const req = https.request(options, (res) => {
      let responseBody = '';

      res.on('data', (chunk) => {
        responseBody += chunk;
      });

      res.on('end', () => {
        resolve({
          httpCode: res.statusCode || 500,
          body: responseBody,
        });
      });
    });

    req.on('error', (err) => {
      reject(new Error(`API call failed: ${err.message}`));
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error('API call timeout after 30 seconds'));
    });

    if (data) {
      req.write(data);
    }

    req.end();
  });
}

/**
 * Get current DNS record value from Mail-in-a-Box
 */
async function getCurrentRecord(
  qname: string,
  rtype: string,
  baseUrl: string,
  email: string,
  password: string
): Promise<string | null> {
  try {
    const apiPath = `/admin/dns/custom/${qname}/${rtype.toUpperCase()}`;
    const result = await makeApiCall(
      'GET',
      apiPath,
      undefined,
      baseUrl,
      email,
      password
    );

    if (result.httpCode === 200) {
      try {
        const records = JSON.parse(result.body);
        if (Array.isArray(records) && records.length > 0) {
          const match = records.find(
            (r: { qname: string; rtype: string; value: string }) =>
              r.qname === qname && r.rtype.toUpperCase() === rtype.toUpperCase()
          );
          return match?.value || records[0]?.value || null;
        }
        return null;
      } catch {
        return null;
      }
    } else if (result.httpCode === 404) {
      return null;
    } else {
      return null;
    }
  } catch {
    return null;
  }
}

/**
 * Set DNS A record via Mail-in-a-Box API
 */
async function setARecord(
  qname: string,
  ipAddress: string,
  baseUrl: string,
  email: string,
  password: string,
  dryRun: boolean
): Promise<{ success: boolean; action: string; error?: string }> {
  const currentValue = await getCurrentRecord(qname, 'A', baseUrl, email, password);

  if (currentValue === ipAddress) {
    console.log(`   ✓ ${qname} A: Already correct (${ipAddress})`);
    return { success: true, action: 'skip' };
  }

  const action = currentValue ? 'UPDATE' : 'CREATE';

  if (currentValue) {
    console.log(`   Current: ${qname} A -> ${currentValue}`);
  } else {
    console.log(`   Current: ${qname} A -> (not set)`);
  }
  console.log(`   New:     ${qname} A -> ${ipAddress}`);

  if (dryRun) {
    console.log(`   [DRY RUN] Would ${action.toLowerCase()} A record: ${qname} -> ${ipAddress}`);
    return { success: true, action: action.toLowerCase() };
  }

  const apiPath = `/admin/dns/custom/${qname}/A`;
  try {
    const result = await makeApiCall(
      'PUT',
      apiPath,
      ipAddress,
      baseUrl,
      email,
      password
    );

    if (result.httpCode === 200) {
      console.log(`   ✅ ${action === 'UPDATE' ? 'Updated' : 'Created'} A record: ${qname} -> ${ipAddress}`);
      return { success: true, action: action.toLowerCase() };
    } else {
      const error = `HTTP ${result.httpCode}: ${result.body}`;
      console.log(`   ❌ Failed: ${error}`);
      return { success: false, action: 'failed', error };
    }
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    console.log(`   ❌ Error: ${error}`);
    return { success: false, action: 'failed', error };
  }
}

/**
 * Main function to setup website DNS A records
 */
async function setupWebsiteDns(options: SetupWebsiteDnsOptions): Promise<void> {
  const region = options.region || process.env.AWS_REGION || 'us-east-1';
  const profile = options.profile || process.env.AWS_PROFILE || 'hepe-admin-mfa';
  const websiteProfile = options.websiteProfile || process.env.WEBSITE_PROFILE || 'k3frame';
  const domain = options.domain || process.env.DOMAIN || 'k3frame.com';
  const appPath = options.appPath || process.env.APP_PATH || 'apps/cdk-k3frame/instance';
  const dryRun = options.dryRun ?? process.env.DRY_RUN === '1';
  const verbose = options.verbose || process.env.VERBOSE === '1';
  const websiteStackName = options.websiteStackName || process.env.WEBSITE_STACK_NAME;
  let websiteIp = options.websiteIp || process.env.WEBSITE_IP;

  console.log('\n🌐 Setup Website DNS A Records');
  console.log('='.repeat(60));
  console.log(`Domain: ${domain}`);
  console.log(`Region: ${region}`);
  console.log(`MIAB Profile: ${profile}`);
  console.log(`Website Profile: ${websiteProfile}`);
  console.log(`Dry Run: ${dryRun ? 'YES' : 'NO'}`);
  console.log('='.repeat(60));
  console.log('');

  try {
    // Step 1: Determine website IP address
    console.log('📋 Step 1: Determining website IP address...');

    if (!websiteIp && websiteStackName) {
      console.log(`   Looking up IP from CloudFormation stack: ${websiteStackName}`);
      console.log(`   Using AWS profile: ${websiteProfile}`);
      try {
        // Try ElasticIPAddress first
        websiteIp = await getStackOutput(websiteStackName, 'ElasticIPAddress', region, websiteProfile);
      } catch {
        try {
          // Fallback to PublicIpAddress
          websiteIp = await getStackOutput(websiteStackName, 'PublicIpAddress', region, websiteProfile);
        } catch (err) {
          throw new Error(
            `Could not find ElasticIPAddress or PublicIpAddress in stack ${websiteStackName} ` +
              `(profile: ${websiteProfile}). Error: ${err instanceof Error ? err.message : String(err)}`
          );
        }
      }
    }

    if (!websiteIp) {
      throw new Error(
        'Website IP address not provided. Use WEBSITE_IP env var or --ip flag, ' +
          'or specify WEBSITE_STACK_NAME to retrieve from CloudFormation stack.'
      );
    }

    // Validate IP format
    const ipRegex = /^(\d{1,3}\.){3}\d{1,3}$/;
    if (!ipRegex.test(websiteIp)) {
      throw new Error(`Invalid IP address format: ${websiteIp}`);
    }

    console.log(`✅ Website IP: ${websiteIp}\n`);

    // Step 2: Get Mail-in-a-Box instance info
    console.log('📋 Step 2: Getting Mail-in-a-Box instance info...');
    const stackInfo = await getStackInfoFromApp(appPath, {
      domain,
      region,
      profile,
    });

    const instanceIp = stackInfo.instancePublicIp;
    if (!instanceIp) {
      throw new Error('Could not determine Mail-in-a-Box instance IP');
    }

    const baseUrl = `https://box.${domain}`;
    console.log(`✅ Mail-in-a-Box instance: ${instanceIp}`);
    console.log(`✅ API Base URL: ${baseUrl}\n`);

    // Step 3: Get admin credentials
    console.log('📋 Step 3: Getting Mail-in-a-Box admin credentials...');
    const credentials = await getAdminCredentials({
      domain,
      region,
      profile,
      appPath,
    });
    console.log(`✅ Admin email: ${credentials.email}\n`);

    // Step 4: Define records to set
    const records = [
      { qname: domain, description: 'Root domain' },
      { qname: `www.${domain}`, description: 'WWW subdomain' },
    ];

    console.log('📋 Step 4: Setting DNS A records...\n');

    if (dryRun) {
      console.log('⚠️  DRY RUN MODE - No changes will be applied\n');
    }

    const results: Array<{
      qname: string;
      success: boolean;
      action: string;
      error?: string;
    }> = [];

    for (const record of records) {
      console.log(`📝 ${record.description}: ${record.qname}`);
      const result = await setARecord(
        record.qname,
        websiteIp,
        baseUrl,
        credentials.email,
        credentials.password,
        dryRun
      );
      results.push({ qname: record.qname, ...result });
      console.log('');
    }

    // Step 5: Summary
    console.log('='.repeat(60));
    console.log('📊 Summary');
    console.log('='.repeat(60));

    const created = results.filter((r) => r.action === 'create').length;
    const updated = results.filter((r) => r.action === 'update').length;
    const skipped = results.filter((r) => r.action === 'skip').length;
    const failed = results.filter((r) => !r.success).length;

    console.log(`Created: ${created}`);
    console.log(`Updated: ${updated}`);
    console.log(`Skipped (already correct): ${skipped}`);
    console.log(`Failed: ${failed}`);

    if (failed > 0) {
      console.log('\n❌ Failed records:');
      for (const result of results.filter((r) => !r.success)) {
        console.log(`   - ${result.qname}: ${result.error}`);
      }
      throw new Error(`Failed to set ${failed} DNS record(s)`);
    }

    console.log('\n✅ Website DNS A records configured successfully!\n');

    if (!dryRun) {
      console.log('💡 Next steps:');
      console.log('   1. Wait for DNS propagation (typically 5-60 minutes)');
      console.log(`   2. Verify with: dig ${domain} A`);
      console.log(`   3. Verify with: dig www.${domain} A`);
      console.log(`   4. Test website access: https://${domain}`);
      console.log('');
    }
  } catch (error) {
    console.error('\n❌ Error setting up website DNS:');
    if (error instanceof Error) {
      console.error(`   ${error.message}`);
      if (verbose && error.stack) {
        console.error('\nStack trace:');
        console.error(error.stack);
      }
    } else {
      console.error(`   ${String(error)}`);
    }
    process.exit(1);
  }
}

// Parse command line arguments
const args = process.argv.slice(2);
const options: SetupWebsiteDnsOptions = {};

// Parse --domain
const domainIndex = args.indexOf('--domain');
if (domainIndex !== -1 && args[domainIndex + 1]) {
  options.domain = args[domainIndex + 1];
}

// Parse --ip
const ipIndex = args.indexOf('--ip');
if (ipIndex !== -1 && args[ipIndex + 1]) {
  options.websiteIp = args[ipIndex + 1];
}

// Parse --stack-name (website CloudFormation stack)
const stackNameIndex = args.indexOf('--stack-name');
if (stackNameIndex !== -1 && args[stackNameIndex + 1]) {
  options.websiteStackName = args[stackNameIndex + 1];
}

// Parse --app-path
const appPathIndex = args.indexOf('--app-path');
if (appPathIndex !== -1 && args[appPathIndex + 1]) {
  options.appPath = args[appPathIndex + 1];
}

// Parse --region
const regionIndex = args.indexOf('--region');
if (regionIndex !== -1 && args[regionIndex + 1]) {
  options.region = args[regionIndex + 1];
}

// Parse --profile (MIAB instance profile)
const profileIndex = args.indexOf('--profile');
if (profileIndex !== -1 && args[profileIndex + 1]) {
  options.profile = args[profileIndex + 1];
}

// Parse --website-profile (website stack profile)
const websiteProfileIndex = args.indexOf('--website-profile');
if (websiteProfileIndex !== -1 && args[websiteProfileIndex + 1]) {
  options.websiteProfile = args[websiteProfileIndex + 1];
}

// Parse --dry-run
if (args.includes('--dry-run') || args.includes('-d')) {
  options.dryRun = true;
}

// Parse --verbose
if (args.includes('--verbose') || args.includes('-v')) {
  options.verbose = true;
}

// Run if executed directly
if (require.main === module) {
  setupWebsiteDns(options).catch((error) => {
    console.error('Unhandled error:', error);
    process.exit(1);
  });
}
