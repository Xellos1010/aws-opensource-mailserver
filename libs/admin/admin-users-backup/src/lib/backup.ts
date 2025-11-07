import { getAdminCredentials } from '@mm/admin-credentials';
import * as fs from 'node:fs';
import * as path from 'node:path';

const log = (
  level: 'info' | 'warn' | 'error',
  msg: string,
  meta: Record<string, unknown> = {}
) =>
  console.log(
    JSON.stringify({ ts: new Date().toISOString(), level, msg, ...meta })
  );

export type UsersBackupConfig = {
  appPath?: string;
  stackName?: string;
  domain?: string;
  region?: string;
  profile?: string;
  outputDir?: string;
};

export type MailUser = {
  email: string;
  privileges?: string[];
  status?: string;
  mailbox?: string;
  [key: string]: unknown;
};

/**
 * Makes API call to Mail-in-a-Box API
 */
async function makeApiCall(
  method: string,
  path: string,
  baseUrl: string,
  email: string,
  password: string
): Promise<{ httpCode: number; body: string }> {
  const url = `${baseUrl}${path}`;
  log('info', 'Making API call', { method, url });

  const headers: Record<string, string> = {};

  const auth = Buffer.from(`${email}:${password}`).toString('base64');
  headers['Authorization'] = `Basic ${auth}`;

  try {
    const response = await fetch(url, {
      method,
      headers,
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
 * Backs up Mail-in-a-Box users via API
 */
export async function backupUsers(
  config: UsersBackupConfig
): Promise<{ outputDir: string; userCount: number }> {
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
  const apiPath = '/admin/mail/users?format=json';

  log('info', 'Fetching users', { domain: credentials.domain });

  // Fetch users from API
  const result = await makeApiCall(
    'GET',
    apiPath,
    baseUrl,
    credentials.email,
    credentials.password
  );

  if (result.httpCode !== 200) {
    throw new Error(
      `Failed to fetch users: HTTP ${result.httpCode} - ${result.body}`
    );
  }

  // Parse users JSON
  let users: MailUser[];
  try {
    users = JSON.parse(result.body);
    if (!Array.isArray(users)) {
      throw new Error('API response is not an array');
    }
  } catch (err) {
    throw new Error(`Failed to parse users JSON: ${String(err)}`);
  }

  log('info', 'Retrieved users', { count: users.length });

  // Create output directory
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const domainName = credentials.domain.replace(/\./g, '-');
  const outputDir =
    config.outputDir ||
    path.resolve('dist/backups', domainName, 'users', timestamp);
  fs.mkdirSync(outputDir, { recursive: true });

  // Write backup file
  const backupFile = path.join(outputDir, `users-backup-${timestamp}.json`);
  const backupData = {
    domain: credentials.domain,
    timestamp: new Date().toISOString(),
    userCount: users.length,
    users,
  };

  fs.writeFileSync(backupFile, JSON.stringify(backupData, null, 2));

  log('info', 'Users backup complete', {
    outputDir,
    backupFile,
    userCount: users.length,
  });

  return { outputDir, userCount: users.length };
}

