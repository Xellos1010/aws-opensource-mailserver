#!/usr/bin/env ts-node

/**
 * Manage Mail-in-a-Box Users via HTTP API
 * 
 * Supports:
 * - List users
 * - Add users (with admin privilege option)
 * - Remove users
 * - Add/remove admin privileges
 */

import { getAdminCredentials } from '@mm/admin-credentials';
import { resolveStackName, resolveDomain } from '@mm/admin-stack-info';
import * as https from 'node:https';
import * as url from 'node:url';

interface ManageUsersOptions {
  action: 'list' | 'add' | 'remove' | 'add-admin' | 'remove-admin';
  email?: string;
  password?: string;
  isAdmin?: boolean;
  domain?: string;
  appPath?: string;
  region?: string;
  profile?: string;
  baseUrl?: string;
  verbose?: boolean;
}

interface MailUser {
  email: string;
  privileges?: string[];
  quota?: string;
  status?: string;
}

/**
 * Make HTTP API call to Mail-in-a-Box
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
        'User-Agent': 'Mail-in-a-Box-User-Manager/1.0',
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
 * List all users
 */
async function listUsers(
  baseUrl: string,
  adminEmail: string,
  adminPassword: string
): Promise<MailUser[]> {
  const result = await makeApiCall(
    'GET',
    '/admin/mail/users?format=json',
    undefined,
    baseUrl,
    adminEmail,
    adminPassword
  );

  if (result.httpCode !== 200) {
    throw new Error(`Failed to list users: HTTP ${result.httpCode}: ${result.body}`);
  }

  try {
    const parsed = JSON.parse(result.body);
    
    // Debug: log the parsed structure
    if (process.env.VERBOSE === '1' || process.env.VERBOSE === 'true') {
      console.log(`DEBUG: Parsed response:`, JSON.stringify(parsed, null, 2));
    }
    
    // Mail-in-a-Box API returns an array of domain objects, each with a users array
    let users: MailUser[] = [];
    
    if (Array.isArray(parsed)) {
      // Flatten the nested structure: [{domain: "...", users: [...]}, ...]
      users = parsed.flatMap((domainObj: any) => {
        if (domainObj && Array.isArray(domainObj.users)) {
          return domainObj.users.map((user: any) => ({
            email: user.email,
            privileges: user.privileges || [],
            quota: user.quota || user.box_quota || 'unlimited',
            status: user.status,
          } as MailUser));
        }
        return [];
      });
    } else if (parsed && typeof parsed === 'object') {
      // If it's an object, try to find the users array
      if (Array.isArray(parsed.users)) {
        users = parsed.users as MailUser[];
      } else if (Array.isArray(parsed.mail_users)) {
        users = parsed.mail_users as MailUser[];
      } else {
        // Return as array with single object
        users = [parsed as MailUser];
      }
    }
    
    return users;
  } catch (error) {
    // If JSON parsing fails, log the response
    console.error(`Failed to parse JSON response`);
    console.error(`Response body (first 1000 chars): ${result.body.substring(0, 1000)}`);
    throw new Error(`Failed to parse user list: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Add user
 */
async function addUser(
  baseUrl: string,
  adminEmail: string,
  adminPassword: string,
  email: string,
  password: string,
  isAdmin: boolean = false
): Promise<{ success: boolean; message: string }> {
  const params = new URLSearchParams();
  params.append('email', email);
  params.append('password', password);
  if (isAdmin) {
    params.append('privilege', 'admin');
  }

  const result = await makeApiCall(
    'POST',
    '/admin/mail/users/add',
    params.toString(),
    baseUrl,
    adminEmail,
    adminPassword
  );

  if (result.httpCode === 200) {
    return { success: true, message: `User ${email} created successfully${isAdmin ? ' with admin privileges' : ''}` };
  } else if (result.body.includes('already exists') || result.body.includes('already a mail user')) {
    return { success: true, message: `User ${email} already exists` };
  } else {
    return { success: false, message: `HTTP ${result.httpCode}: ${result.body.substring(0, 200)}` };
  }
}

/**
 * Remove user
 */
async function removeUser(
  baseUrl: string,
  adminEmail: string,
  adminPassword: string,
  email: string
): Promise<{ success: boolean; message: string }> {
  const params = new URLSearchParams();
  params.append('email', email);

  const result = await makeApiCall(
    'POST',
    '/admin/mail/users/remove',
    params.toString(),
    baseUrl,
    adminEmail,
    adminPassword
  );

  if (result.httpCode === 200) {
    return { success: true, message: `User ${email} removed successfully` };
  } else {
    return { success: false, message: `HTTP ${result.httpCode}: ${result.body.substring(0, 200)}` };
  }
}

/**
 * Add admin privilege
 */
async function addAdminPrivilege(
  baseUrl: string,
  adminEmail: string,
  adminPassword: string,
  email: string
): Promise<{ success: boolean; message: string }> {
  const params = new URLSearchParams();
  params.append('email', email);
  params.append('privilege', 'admin');

  const result = await makeApiCall(
    'POST',
    '/admin/mail/users/privileges/add',
    params.toString(),
    baseUrl,
    adminEmail,
    adminPassword
  );

  if (result.httpCode === 200) {
    return { success: true, message: `Admin privilege added to ${email}` };
  } else {
    return { success: false, message: `HTTP ${result.httpCode}: ${result.body.substring(0, 200)}` };
  }
}

/**
 * Remove admin privilege
 */
async function removeAdminPrivilege(
  baseUrl: string,
  adminEmail: string,
  adminPassword: string,
  email: string
): Promise<{ success: boolean; message: string }> {
  const params = new URLSearchParams();
  params.append('email', email);

  const result = await makeApiCall(
    'POST',
    '/admin/mail/users/privileges/remove',
    params.toString(),
    baseUrl,
    adminEmail,
    adminPassword
  );

  if (result.httpCode === 200) {
    return { success: true, message: `Admin privilege removed from ${email}` };
  } else {
    return { success: false, message: `HTTP ${result.httpCode}: ${result.body.substring(0, 200)}` };
  }
}

/**
 * Main function
 */
async function manageUsers(options: ManageUsersOptions): Promise<void> {
  const region = options.region || process.env.AWS_REGION || 'us-east-1';
  const profile = options.profile || process.env.AWS_PROFILE || 'hepe-admin-mfa';
  const domain = options.domain || process.env.DOMAIN;
  const appPath = options.appPath || process.env.APP_PATH;
  const verbose = options.verbose || process.env.VERBOSE === '1' || process.env.VERBOSE === 'true';

  if (!domain && !appPath) {
    throw new Error('Cannot resolve domain. Provide domain or appPath');
  }

  const resolvedDomain = domain || (appPath ? resolveDomain(appPath) : null);
  if (!resolvedDomain) {
    throw new Error('Cannot resolve domain for API calls. Provide domain or appPath');
  }

  // Get instance info (needed for SSM and HTTP API)
  const instanceStackName = resolveStackName(resolvedDomain, appPath, undefined, 'instance');
  const { getStackInfo } = await import('@mm/admin-stack-info');
  const stackInfo = await getStackInfo({
    stackName: instanceStackName,
    region,
    profile,
  });

  const instanceIp = stackInfo.instancePublicIp;
  if (!instanceIp) {
    throw new Error(`Could not determine instance IP from stack ${instanceStackName}`);
  }

  const baseUrl = options.baseUrl || `https://${instanceIp}`;
  const hostname = `box.${resolvedDomain}`;

  console.log('👥 Manage Mail-in-a-Box Users');
  console.log(`   Domain: ${resolvedDomain}`);
  console.log(`   Instance IP: ${instanceIp}`);
  console.log(`   Base URL: ${baseUrl}`);
  console.log(`   Action: ${options.action}\n`);

  // Get admin credentials (only needed for HTTP API actions)
  let credentials: Awaited<ReturnType<typeof getAdminCredentials>> | null = null;
  if (options.action !== 'list') {
    console.log('📋 Getting admin credentials...');
    credentials = await getAdminCredentials({
      appPath,
      domain: resolvedDomain,
      region,
      profile,
    });
    console.log(`✅ Admin credentials ready\n`);
  }

  try {
    switch (options.action) {
      case 'list': {
        console.log('📋 Listing all users via SSM RunCommand...\n');
        
        // Use SSM RunCommand for reliable user listing (bypasses HTTP API auth issues)
        const { SSMClient, SendCommandCommand, GetCommandInvocationCommand } = await import('@aws-sdk/client-ssm');
        const { fromIni } = await import('@aws-sdk/credential-providers');
        
        const instanceStackName = resolveStackName(resolvedDomain, appPath, undefined, 'instance');
        const stackInfo = await getStackInfo({
          stackName: instanceStackName,
          region,
          profile,
        });
        
        const instanceId = stackInfo.instanceId;
        if (!instanceId) {
          throw new Error(`Could not determine instance ID from stack ${instanceStackName}`);
        }
        
        const ssmCredentials = fromIni({ profile });
        const ssmClient = new SSMClient({ region, credentials: ssmCredentials });
        
        const listCommand = `cd /opt/mailinabox && git config --global --add safe.directory /opt/mailinabox 2>/dev/null || true && sudo -u user-data /opt/mailinabox/management/cli.py user 2>&1 || sudo -u user-data /opt/mailinabox/management/users.py list 2>&1`;
        
        const listResult = await ssmClient.send(
          new SendCommandCommand({
            InstanceIds: [instanceId],
            DocumentName: 'AWS-RunShellScript',
            Parameters: {
              commands: [listCommand],
            },
          })
        );

        const listCommandId = listResult.Command?.CommandId;
        if (!listCommandId) {
          throw new Error('Failed to send list command via SSM');
        }

        // Wait for command to complete
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        const listInvocation = await ssmClient.send(
          new GetCommandInvocationCommand({
            CommandId: listCommandId,
            InstanceId: instanceId,
          })
        );

        if (listInvocation.Status !== 'Success') {
          throw new Error(`List command failed: ${listInvocation.StandardErrorContent || listInvocation.StandardOutputContent}`);
        }

        const output = listInvocation.StandardOutputContent || '';
        const lines = output.split('\n').filter(line => line.trim() && !line.includes('ERROR'));
        
        // Parse SSH output (format: email [privileges] or email* [privileges])
        // Example: "admin@domain.com [admin]" or "user@domain.com" or "me@box.domain.com*"
        const users = lines.map(line => {
          // Match email (may have * suffix) and optional privileges in brackets
          const match = line.match(/^\s*([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+(?:\.[a-zA-Z0-9._-]+)*)\*?\s*(?:\[(.*)\])?/);
          if (match) {
            const email = match[1];
            const privilegesStr = match[2] || '';
            const privileges = privilegesStr ? privilegesStr.split(',').map(p => p.trim().toLowerCase()) : [];
            
            // Check if user has admin privilege (explicit or implicit for admin@domain)
            const isAdmin = privileges.includes('admin') || email.toLowerCase() === `admin@${resolvedDomain.toLowerCase()}`;
            
            return {
              email,
              privileges: isAdmin ? ['admin'] : privileges,
              quota: 'unlimited',
              status: 'active',
            };
          }
          return null;
        }).filter((u): u is NonNullable<typeof u> => u !== null);
        
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('📊 Mail Users');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        
        if (users.length === 0) {
          console.log('   No users found');
        } else {
          for (const user of users) {
            const adminBadge = user.privileges?.includes('admin') ? ' [ADMIN]' : '';
            const quota = user.quota || 'unlimited';
            console.log(`   ${user.email}${adminBadge} (quota: ${quota})`);
          }
        }
        
        console.log(`\n   Total: ${users.length} user(s)`);
        break;
      }

      case 'add': {
        if (!credentials) {
          throw new Error('Admin credentials required for add action');
        }
        if (!options.email || !options.password) {
          throw new Error('Email and password required for add action');
        }

        console.log(`📋 Adding user: ${options.email}...\n`);
        const result = await addUser(
          baseUrl,
          credentials.email,
          credentials.password,
          options.email,
          options.password,
          options.isAdmin || false
        );

        if (result.success) {
          console.log(`✅ ${result.message}`);
        } else {
          console.error(`❌ ${result.message}`);
          process.exit(1);
        }
        break;
      }

      case 'remove': {
        if (!credentials) {
          throw new Error('Admin credentials required for remove action');
        }
        if (!options.email) {
          throw new Error('Email required for remove action');
        }

        console.log(`📋 Removing user: ${options.email}...\n`);
        const result = await removeUser(
          baseUrl,
          credentials.email,
          credentials.password,
          options.email
        );

        if (result.success) {
          console.log(`✅ ${result.message}`);
        } else {
          console.error(`❌ ${result.message}`);
          process.exit(1);
        }
        break;
      }

      case 'add-admin': {
        if (!credentials) {
          throw new Error('Admin credentials required for add-admin action');
        }
        if (!options.email) {
          throw new Error('Email required for add-admin action');
        }

        console.log(`📋 Adding admin privilege to: ${options.email}...\n`);
        const result = await addAdminPrivilege(
          baseUrl,
          credentials.email,
          credentials.password,
          options.email
        );

        if (result.success) {
          console.log(`✅ ${result.message}`);
        } else {
          console.error(`❌ ${result.message}`);
          process.exit(1);
        }
        break;
      }

      case 'remove-admin': {
        if (!credentials) {
          throw new Error('Admin credentials required for remove-admin action');
        }
        if (!options.email) {
          throw new Error('Email required for remove-admin action');
        }

        console.log(`📋 Removing admin privilege from: ${options.email}...\n`);
        const result = await removeAdminPrivilege(
          baseUrl,
          credentials.email,
          credentials.password,
          options.email
        );

        if (result.success) {
          console.log(`✅ ${result.message}`);
        } else {
          console.error(`❌ ${result.message}`);
          process.exit(1);
        }
        break;
      }
    }
  } catch (error) {
    console.error(`\n❌ Error: ${error instanceof Error ? error.message : String(error)}`);
    if (verbose && error instanceof Error && error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

// CLI interface
if (require.main === module) {
  const args = process.argv.slice(2);
  
  const options: ManageUsersOptions = {
    action: 'list',
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    switch (arg) {
      case '--action':
      case '-a':
        options.action = args[++i] as ManageUsersOptions['action'];
        break;
      case '--email':
      case '-e':
        options.email = args[++i];
        break;
      case '--password':
      case '-p':
        options.password = args[++i];
        break;
      case '--admin':
        options.isAdmin = true;
        break;
      case '--domain':
      case '-d':
        options.domain = args[++i];
        break;
      case '--app-path':
        options.appPath = args[++i];
        break;
      case '--region':
      case '-r':
        options.region = args[++i];
        break;
      case '--profile':
        options.profile = args[++i];
        break;
      case '--base-url':
        options.baseUrl = args[++i];
        break;
      case '--verbose':
      case '-v':
        options.verbose = true;
        break;
      case '--help':
      case '-h':
        console.log(`
Usage: manage-miab-users.cli.ts [options]

Actions:
  list          List all users (default)
  add           Add a new user (requires --email and --password)
  remove        Remove a user (requires --email)
  add-admin     Add admin privilege to a user (requires --email)
  remove-admin  Remove admin privilege from a user (requires --email)

Options:
  --action, -a <action>     Action to perform (list|add|remove|add-admin|remove-admin)
  --email, -e <email>       Email address (required for add/remove/admin actions)
  --password, -p <password> Password (required for add action)
  --admin                    Add user with admin privileges (for add action)
  --domain, -d <domain>      Domain name (default: from APP_PATH or DOMAIN env)
  --app-path <path>         App path (default: from APP_PATH env)
  --region, -r <region>     AWS region (default: us-east-1)
  --profile <profile>       AWS profile (default: hepe-admin-mfa)
  --base-url <url>          Base URL for API (default: https://<instance-ip>)
  --verbose, -v             Verbose output
  --help, -h                Show this help

Examples:
  # List all users
  pnpm exec tsx tools/manage-miab-users.cli.ts --action list

  # Add admin user
  pnpm exec tsx tools/manage-miab-users.cli.ts --action add --email admin@emcnotary.com --password <password> --admin

  # Remove user
  pnpm exec tsx tools/manage-miab-users.cli.ts --action remove --email user@emcnotary.com

  # Remove all users (requires manual iteration)
  pnpm exec tsx tools/manage-miab-users.cli.ts --action list | grep -E '^   [^ ]+@' | while read email; do
    pnpm exec tsx tools/manage-miab-users.cli.ts --action remove --email "$email"
  done
`);
        process.exit(0);
        break;
    }
  }

  manageUsers(options).catch((error) => {
    console.error(`Fatal error: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  });
}

export { manageUsers, listUsers, addUser, removeUser, addAdminPrivilege, removeAdminPrivilege };

