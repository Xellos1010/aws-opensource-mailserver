import { getAdminCredentials } from '@mm/admin-credentials';
import * as fs from 'node:fs';

const log = (
  level: 'info' | 'warn' | 'error',
  msg: string,
  meta: Record<string, unknown> = {}
) =>
  console.log(
    JSON.stringify({ ts: new Date().toISOString(), level, msg, ...meta })
  );

export type BackupRecord = {
  qname: string;
  rtype: string;
  value: string;
  zone?: string;
  'sort-order'?: {
    created?: number;
    qname?: number;
  };
};

export type RestoreMiabConfig = {
  backupFile: string;
  appPath?: string;
  stackName?: string;
  domain?: string;
  region?: string;
  profile?: string;
  dryRun?: boolean;
};

/**
 * Normalizes qname for API path - removes trailing domain if it matches the zone
 * Returns the subdomain part only (e.g., "www" from "www.askdaokapra.com")
 */
function normalizeQnameForApi(qname: string, zone: string): string {
  // Remove trailing dot if present
  const normalizedQname = qname.endsWith('.') ? qname.slice(0, -1) : qname;
  const normalizedZone = zone.endsWith('.') ? zone.slice(0, -1) : zone;

  // If qname equals zone (root domain), use empty string
  if (normalizedQname === normalizedZone) {
    return '';
  }

  // If qname ends with zone, extract the subdomain part
  if (normalizedQname.endsWith(`.${normalizedZone}`)) {
    const subdomain = normalizedQname.slice(0, -(normalizedZone.length + 1));
    return subdomain;
  }

  // If qname doesn't match zone, return as-is (might be a different domain)
  return normalizedQname;
}

/**
 * Normalizes DNS value for Mail-in-a-Box API
 */
function normalizeValue(value: string, rtype: string): string {
  // Remove trailing dot for CNAME, MX, NS records
  // Mail-in-a-Box API doesn't expect trailing dots
  if ((rtype === 'CNAME' || rtype === 'MX' || rtype === 'NS') && value.endsWith('.')) {
    return value.slice(0, -1);
  }
  return value;
}

/**
 * Makes API call to Mail-in-a-Box DNS API
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
  log('info', 'Making API call', { method, url });

  const headers: Record<string, string> = {
    'Content-Type': 'application/x-www-form-urlencoded',
  };

  const auth = Buffer.from(`${email}:${password}`).toString('base64');
  headers['Authorization'] = `Basic ${auth}`;

  // API expects form data: value=<value>
  // Use URLSearchParams to properly encode form data
  const body = data ? new URLSearchParams({ value: data }).toString() : undefined;

  try {
    const response = await fetch(url, {
      method,
      headers,
      body,
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

/**
 * Restores DNS records from backup file using Mail-in-a-Box DNS API
 */
export async function restoreDnsFromBackup(
  config: RestoreMiabConfig
): Promise<void> {
  const dryRun = config.dryRun ?? (process.env['DRY_RUN'] === '1');

  // Read backup file
  log('info', 'Reading backup file', { file: config.backupFile });
  const backupContent = fs.readFileSync(config.backupFile, 'utf-8');
  const backupRecords: BackupRecord[] = JSON.parse(backupContent);

  if (!Array.isArray(backupRecords) || backupRecords.length === 0) {
    throw new Error('Backup file must contain an array of DNS records');
  }

  // Get admin credentials
  log('info', 'Retrieving admin credentials');
  const credentials = await getAdminCredentials({
    appPath: config.appPath,
    stackName: config.stackName,
    domain: config.domain,
    region: config.region,
    profile: config.profile,
  });

  const baseUrl = `https://box.${credentials.domain}`;
  const zone = credentials.domain;

  log('info', 'Preparing to restore DNS records', {
    domain: credentials.domain,
    recordCount: backupRecords.length,
    dryRun,
  });

  if (dryRun) {
    console.log('\n⚠️  DRY RUN MODE - No changes will be applied\n');
  }

  let successCount = 0;
  let errorCount = 0;
  const errors: Array<{ record: BackupRecord; error: string }> = [];

  for (const record of backupRecords) {
    const { qname, rtype, value } = record;
    
    // Skip root domain A records - these are managed by the mail server itself
    if (qname === zone && rtype === 'A') {
      log('warn', 'Skipping root domain A record (managed by mail server)', { qname, rtype });
      successCount++;
      continue;
    }
    
    const normalizedValue = normalizeValue(value, rtype);
    
    // Build API path - Mail-in-a-Box API requires the full qname in the path
    const apiPath = `/admin/dns/custom/${qname}/${rtype}`;

    log('info', 'Restoring DNS record', {
      qname,
      rtype,
      value: normalizedValue,
    });

    if (dryRun) {
      console.log(`[DRY RUN] Would set ${rtype} record: ${qname} -> ${normalizedValue}`);
      successCount++;
      continue;
    }

    try {
      const result = await makeApiCall(
        'POST',
        apiPath,
        normalizedValue,
        baseUrl,
        credentials.email,
        credentials.password
      );

      if (result.httpCode === 200) {
        successCount++;
        console.log(`✓ Set ${rtype} record: ${qname} -> ${normalizedValue}`);
      } else {
        errorCount++;
        const error = `HTTP ${result.httpCode}: ${result.body}`;
        errors.push({ record, error });
        console.error(`✗ Failed to set ${rtype} record: ${qname} (${error})`);
      }
    } catch (err) {
      errorCount++;
      const error = String(err);
      errors.push({ record, error });
      console.error(`✗ Failed to set ${rtype} record: ${qname} (${error})`);
    }
  }

  console.log('\n=== Restore Summary ===');
  console.log(`Total records: ${backupRecords.length}`);
  console.log(`Success: ${successCount}`);
  console.log(`Errors: ${errorCount}`);

  if (errors.length > 0) {
    console.log('\n=== Errors ===');
    for (const { record, error } of errors) {
      console.error(`  ${record.qname} ${record.rtype}: ${error}`);
    }
  }

  if (errorCount > 0) {
    throw new Error(`DNS restore completed with ${errorCount} errors`);
  }

  log('info', 'DNS restore complete', { successCount, errorCount });
}

