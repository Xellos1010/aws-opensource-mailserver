#!/usr/bin/env ts-node

import { CloudFormationClient, DescribeStacksCommand } from '@aws-sdk/client-cloudformation';
import { fromIni } from '@aws-sdk/credential-providers';
import { getAdminCredentials } from '@mm/admin-credentials';
import { resolveStackName, resolveDomain } from '@mm/admin-stack-info';
import * as fs from 'node:fs';
import * as https from 'node:https';
import * as path from 'node:path';
import * as url from 'node:url';

interface SyncDnsOptions {
  backupFile?: string;
  stackName?: string;
  domain?: string;
  appPath?: string;
  region?: string;
  profile?: string;
  dryRun?: boolean;
  verbose?: boolean;
}

type BackupRecord = {
  qname: string;
  rtype: string;
  value: string;
  zone?: string;
  'sort-order'?: {
    created?: number;
    qname?: number;
  };
};

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
 * Normalizes DNS value for Mail-in-a-Box API
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
        'Authorization': `Basic ${auth}`,
        'User-Agent': 'Mail-in-a-Box-DNS-Sync/1.0',
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
 * Returns the first matching record's value, or null if not found
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
    const result = await makeApiCall('GET', apiPath, undefined, baseUrl, email, password);

    if (result.httpCode === 200) {
      // Parse the response - Mail-in-a-Box returns JSON array of objects with qname, rtype, value
      try {
        const records = JSON.parse(result.body);
        if (Array.isArray(records) && records.length > 0) {
          // Find the exact match (in case there are multiple records)
          const match = records.find((r: { qname: string; rtype: string; value: string }) => 
            r.qname === qname && r.rtype.toUpperCase() === rtype.toUpperCase()
          );
          return match?.value || records[0]?.value || null;
        }
        return null;
      } catch (parseErr) {
        // If response is not valid JSON, record probably doesn't exist
        return null;
      }
    } else if (result.httpCode === 404) {
      return null; // Record doesn't exist
    } else {
      // Log but don't fail - we'll try to update anyway
      return null;
    }
  } catch (err) {
    // Log but don't fail - we'll try to update anyway
    return null;
  }
}

/**
 * Sync DNS records from backup file with CloudFormation stack IP
 */
async function syncDns(options: SyncDnsOptions): Promise<void> {
  const region = options.region || process.env.AWS_REGION || 'us-east-1';
  const profile = options.profile || process.env.AWS_PROFILE || 'hepe-admin-mfa';
  const domain = options.domain || process.env.DOMAIN;
  const appPath = options.appPath || process.env.APP_PATH;
  const dryRun = options.dryRun ?? (process.env.DRY_RUN === '1');
  const verbose = options.verbose || process.env.VERBOSE === '1' || process.env.VERBOSE === 'true';
  
  if (!options.stackName && !domain && !appPath) {
    throw new Error('Cannot resolve stack name. Provide stackName, domain, or appPath');
  }
  
  const stackName = options.stackName || resolveStackName(domain, appPath, undefined, 'core');
  
  if (!domain && !appPath) {
    throw new Error('Cannot resolve domain. Provide domain or appPath');
  }
  
  // Resolve domain from appPath if needed for backup file path
  const resolvedDomain = domain || (appPath ? resolveDomain(appPath) : null);
  if (!resolvedDomain) {
    throw new Error('Cannot resolve domain for backup file path. Provide domain or appPath');
  }

  // Default backup file path (relative to workspace root)
  const backupFile =
    options.backupFile ||
    path.join(
      process.cwd(),
      'Archive',
      'backups',
      resolvedDomain,
      'dns',
      'dns-backup-20250915-120038.json'
    );

  console.log('🌐 Sync React DNS Records');
  console.log(`   Domain: ${resolvedDomain}`);
  console.log(`   Stack: ${stackName}`);
  console.log(`   Backup File: ${backupFile}`);
  console.log(`   Region: ${region}`);
  console.log(`   Profile: ${profile}`);
  console.log(`   Dry Run: ${dryRun ? 'YES' : 'NO'}\n`);

  try {
    // Step 1: Get Elastic IP from CloudFormation stack
    console.log('📋 Step 1: Getting Elastic IP from CloudFormation stack...');
    const elasticIp = await getStackOutput(stackName, 'ElasticIPAddress', region, profile);
    console.log(`✅ Found Elastic IP: ${elasticIp}\n`);

    // Step 2: Read backup file
    console.log('📋 Step 2: Reading DNS backup file...');
    if (!fs.existsSync(backupFile)) {
      throw new Error(`Backup file not found: ${backupFile}`);
    }

    const backupContent = fs.readFileSync(backupFile, 'utf-8');
    const backupRecords: BackupRecord[] = JSON.parse(backupContent);

    if (!Array.isArray(backupRecords) || backupRecords.length === 0) {
      throw new Error('Backup file must contain an array of DNS records');
    }

    console.log(`✅ Loaded ${backupRecords.length} DNS records from backup\n`);

    // Step 3: Filter and update A records
    console.log('📋 Step 3: Processing DNS records...');
    const aRecords = backupRecords.filter((r) => r.rtype === 'A');
    const cnameRecords = backupRecords.filter((r) => r.rtype === 'CNAME');

    if (aRecords.length === 0) {
      console.log('⚠️  No A records found in backup file\n');
    } else {
      console.log(`✅ Found ${aRecords.length} A record(s) to process\n`);
    }

    // Step 4: Get admin credentials for Mail-in-a-Box API
    console.log('📋 Step 4: Getting Mail-in-a-Box admin credentials...');
    const credentials = await getAdminCredentials({
      appPath,
      domain,
      region,
      profile,
    });

    // Use IP address directly since DNS may not be configured yet
    const instanceIp = await getStackOutput(stackName, 'ElasticIPAddress', region, profile);
    const baseUrl = `https://${instanceIp}`;
    console.log(`✅ Admin credentials ready (using IP: ${instanceIp})\n`);

    if (dryRun) {
      console.log('\n⚠️  DRY RUN MODE - No changes will be applied\n');
    }

    let successCount = 0;
    let updateCount = 0;
    let createCount = 0;
    let skipCount = 0;
    const errors: Array<{ record: BackupRecord; error: string }> = [];

    // Process A records
    for (const record of aRecords) {
      const { qname, rtype } = record;
      const newValue = elasticIp; // Use the Elastic IP from the stack

      // Check current value
      const currentValue = await getCurrentRecord(qname, rtype, baseUrl, credentials.email, credentials.password);

      if (currentValue === newValue) {
        console.log(`✓ ${qname} ${rtype}: Already correct (${newValue})`);
        skipCount++;
        continue;
      }

      const normalizedValue = normalizeValue(newValue, rtype);
      const action = currentValue ? 'UPDATE' : 'CREATE';

      if (verbose) {
        console.log(`\n📝 Processing ${qname} ${rtype}:`);
        if (currentValue) {
          console.log(`   Current: ${currentValue}`);
          console.log(`   New: ${normalizedValue}`);
        } else {
          console.log(`   Current: (does not exist)`);
          console.log(`   New: ${normalizedValue}`);
        }
      }

      if (dryRun) {
        console.log(`[DRY RUN] Would ${action.toLowerCase()} ${rtype} record: ${qname} -> ${normalizedValue}`);
        successCount++;
        if (action === 'UPDATE') updateCount++;
        else createCount++;
        continue;
      }

      // Use PUT for A records (single value)
      const apiPath = `/admin/dns/custom/${qname}/${rtype.toUpperCase()}`;
      try {
        const result = await makeApiCall('PUT', apiPath, normalizedValue, baseUrl, credentials.email, credentials.password);

        if (result.httpCode === 200) {
          successCount++;
          if (action === 'UPDATE') {
            updateCount++;
            console.log(`✓ Updated ${rtype} record: ${qname} -> ${normalizedValue}`);
          } else {
            createCount++;
            console.log(`✓ Created ${rtype} record: ${qname} -> ${normalizedValue}`);
          }
        } else {
          const error = `HTTP ${result.httpCode}: ${result.body}`;
          errors.push({ record, error });
          console.error(`✗ Failed to ${action.toLowerCase()} ${rtype} record: ${qname} (${error})`);
        }
      } catch (err) {
        const error = String(err);
        errors.push({ record, error });
        console.error(`✗ Failed to ${action.toLowerCase()} ${rtype} record: ${qname} (${error})`);
      }
    }

    // Process CNAME records (only if they point to the domain)
    if (cnameRecords.length > 0) {
      console.log(`\n📋 Processing ${cnameRecords.length} CNAME record(s)...\n`);
      for (const record of cnameRecords) {
        const { qname, rtype, value } = record;
        // Only process CNAME records that point to the domain
        const normalizedValue = normalizeValue(value, rtype);

        const currentValue = await getCurrentRecord(qname, rtype, baseUrl, credentials.email, credentials.password);

        if (currentValue === normalizedValue) {
          console.log(`✓ ${qname} ${rtype}: Already correct (${normalizedValue})`);
          skipCount++;
          continue;
        }

        const action = currentValue ? 'UPDATE' : 'CREATE';

        if (dryRun) {
          console.log(`[DRY RUN] Would ${action.toLowerCase()} ${rtype} record: ${qname} -> ${normalizedValue}`);
          successCount++;
          if (action === 'UPDATE') updateCount++;
          else createCount++;
          continue;
        }

        const apiPath = `/admin/dns/custom/${qname}/${rtype.toUpperCase()}`;
        try {
          const result = await makeApiCall('PUT', apiPath, normalizedValue, baseUrl, credentials.email, credentials.password);

          if (result.httpCode === 200) {
            successCount++;
            if (action === 'UPDATE') {
              updateCount++;
              console.log(`✓ Updated ${rtype} record: ${qname} -> ${normalizedValue}`);
            } else {
              createCount++;
              console.log(`✓ Created ${rtype} record: ${qname} -> ${normalizedValue}`);
            }
          } else {
            const error = `HTTP ${result.httpCode}: ${result.body}`;
            errors.push({ record, error });
            console.error(`✗ Failed to ${action.toLowerCase()} ${rtype} record: ${qname} (${error})`);
          }
        } catch (err) {
          const error = String(err);
          errors.push({ record, error });
          console.error(`✗ Failed to ${action.toLowerCase()} ${rtype} record: ${qname} (${error})`);
        }
      }
    }

    // Summary
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📊 Sync Summary');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`Total records processed: ${aRecords.length + cnameRecords.length}`);
    console.log(`Created: ${createCount}`);
    console.log(`Updated: ${updateCount}`);
    console.log(`Skipped (already correct): ${skipCount}`);
    console.log(`Errors: ${errors.length}`);

    if (errors.length > 0) {
      console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('❌ Errors');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      for (const { record, error } of errors) {
        console.error(`  ${record.qname} ${record.rtype}: ${error}`);
      }
    }

    if (errors.length > 0) {
      throw new Error(`DNS sync completed with ${errors.length} errors`);
    }

    console.log('\n✅ DNS sync completed successfully!\n');
  } catch (error) {
    console.error('\n❌ Failed to sync DNS records:');
    if (error instanceof Error) {
      console.error(`   ${error.message}\n`);
      if (verbose) {
        console.error('Stack trace:');
        console.error(error.stack);
      }
    } else {
      console.error(`   ${String(error)}\n`);
    }
    process.exit(1);
  }
}

// Parse command line arguments
const args = process.argv.slice(2);
const options: SyncDnsOptions = {};

// Parse --backup-file
const backupFileIndex = args.indexOf('--backup-file');
if (backupFileIndex !== -1 && args[backupFileIndex + 1]) {
  options.backupFile = args[backupFileIndex + 1];
}

// Parse --stack-name
const stackNameIndex = args.indexOf('--stack-name');
if (stackNameIndex !== -1 && args[stackNameIndex + 1]) {
  options.stackName = args[stackNameIndex + 1];
}

// Parse --domain
const domainIndex = args.indexOf('--domain');
if (domainIndex !== -1 && args[domainIndex + 1]) {
  options.domain = args[domainIndex + 1];
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

// Parse --profile
const profileIndex = args.indexOf('--profile');
if (profileIndex !== -1 && args[profileIndex + 1]) {
  options.profile = args[profileIndex + 1];
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
  syncDns(options).catch((error) => {
    console.error('Unhandled error:', error);
    process.exit(1);
  });
}

