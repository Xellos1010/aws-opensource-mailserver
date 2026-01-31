#!/usr/bin/env ts-node

/**
 * Verify User Password
 *
 * Verifies a Mail-in-a-Box user's password can authenticate via:
 * 1. Dovecot auth test (mailbox authentication)
 * 2. Admin HTTP API (optional)
 *
 * This tool is useful for confirming password changes were applied correctly.
 */

import { resolveStackName, resolveDomain, getStackInfo } from '@mm/admin-stack-info';
import { SSMClient, SendCommandCommand, GetCommandInvocationCommand } from '@aws-sdk/client-ssm';
import { fromIni } from '@aws-sdk/credential-providers';

interface VerifyUserPasswordOptions {
  domain?: string;
  appPath?: string;
  region?: string;
  profile?: string;
  email?: string;
  password?: string;
  verbose?: boolean;
}

interface VerificationResult {
  dovecotAuth: boolean;
  httpApi?: boolean;
  message: string;
}

async function waitForCommand(
  ssmClient: SSMClient,
  commandId: string,
  instanceId: string,
  maxWaitSeconds = 30
): Promise<{ status: string; stdout: string; stderr: string }> {
  const startTime = Date.now();

  while (Date.now() - startTime < maxWaitSeconds * 1000) {
    await new Promise(resolve => setTimeout(resolve, 2000));

    try {
      const invocation = await ssmClient.send(
        new GetCommandInvocationCommand({
          CommandId: commandId,
          InstanceId: instanceId,
        })
      );

      if (invocation.Status === 'Success' || invocation.Status === 'Failed') {
        return {
          status: invocation.Status,
          stdout: invocation.StandardOutputContent || '',
          stderr: invocation.StandardErrorContent || '',
        };
      }
    } catch {
      // Command may not be ready yet, continue waiting
    }
  }

  return { status: 'Timeout', stdout: '', stderr: 'Command timed out' };
}

async function verifyUserPassword(options: VerifyUserPasswordOptions): Promise<VerificationResult> {
  const region = options.region || process.env.AWS_REGION || 'us-east-1';
  const profile = options.profile || process.env.AWS_PROFILE || 'hepe-admin-mfa';
  const domain = options.domain || process.env.DOMAIN;
  const appPath = options.appPath || process.env.APP_PATH;
  const email = options.email || process.env.USER_EMAIL;
  const password = options.password || process.env.USER_PASSWORD;
  const verbose = options.verbose || process.env.VERBOSE === '1';

  if (!domain && !appPath) {
    throw new Error('Cannot resolve domain. Provide domain or appPath');
  }

  if (!email || !password) {
    throw new Error('Missing user email or password. Provide --email and --password or USER_EMAIL/USER_PASSWORD env vars');
  }

  const resolvedDomain = domain || (appPath ? resolveDomain(appPath) : null);
  if (!resolvedDomain) {
    throw new Error('Cannot resolve domain. Provide domain or appPath');
  }

  console.log('🔐 Verify User Password');
  console.log(`   Domain: ${resolvedDomain}`);
  console.log(`   Email:  ${email}`);
  console.log(`   Verbose: ${verbose ? 'YES' : 'NO'}\n`);

  // Get instance info
  const instanceStackName = resolveStackName(resolvedDomain, appPath, undefined, 'instance');
  const stackInfo = await getStackInfo({
    stackName: instanceStackName,
    region,
    profile,
  });

  const instanceId = stackInfo.instanceId;
  const instanceIp = stackInfo.instancePublicIp;

  if (!instanceId) {
    throw new Error(`Could not determine instance ID from stack ${instanceStackName}`);
  }

  console.log(`✅ Instance ID: ${instanceId}`);
  console.log(`   Instance IP: ${instanceIp}\n`);

  const ssmCredentials = fromIni({ profile });
  const ssmClient = new SSMClient({ region, credentials: ssmCredentials });

  // Base64 encode to avoid shell escaping issues
  const emailB64 = Buffer.from(email).toString('base64');
  const passwordB64 = Buffer.from(password).toString('base64');

  // Test 1: Dovecot authentication
  console.log('📋 Step 1: Testing Dovecot authentication...');

  const dovecotCommand = `
EMAIL=$(echo "${emailB64}" | base64 -d)
PASSWORD=$(echo "${passwordB64}" | base64 -d)
echo "$PASSWORD" | sudo doveadm auth test "$EMAIL" 2>&1
`.trim();

  const dovecotResult = await ssmClient.send(
    new SendCommandCommand({
      InstanceIds: [instanceId],
      DocumentName: 'AWS-RunShellScript',
      Parameters: {
        commands: [dovecotCommand],
      },
    })
  );

  const dovecotCommandId = dovecotResult.Command?.CommandId;
  if (!dovecotCommandId) {
    throw new Error('Failed to send dovecot auth command via SSM');
  }

  const dovecotInvocation = await waitForCommand(ssmClient, dovecotCommandId, instanceId);

  const dovecotOutput = dovecotInvocation.stdout + dovecotInvocation.stderr;
  const dovecotSuccess = dovecotOutput.includes('auth succeeded');

  if (verbose) {
    console.log(`   Dovecot output: ${dovecotOutput.trim().substring(0, 200)}`);
  }

  if (dovecotSuccess) {
    console.log('   ✅ Dovecot authentication: PASSED\n');
  } else {
    console.log('   ❌ Dovecot authentication: FAILED\n');
    if (verbose) {
      console.log(`   Full output: ${dovecotOutput}`);
    }
  }

  // Test 2: HTTP API authentication (using curl to admin login)
  console.log('📋 Step 2: Testing HTTP API authentication...');

  const httpCommand = `
EMAIL=$(echo "${emailB64}" | base64 -d)
PASSWORD=$(echo "${passwordB64}" | base64 -d)
curl -s -k -X GET -u "$EMAIL:$PASSWORD" "https://127.0.0.1/admin/mail/users?format=json" 2>&1
`.trim();

  const httpResult = await ssmClient.send(
    new SendCommandCommand({
      InstanceIds: [instanceId],
      DocumentName: 'AWS-RunShellScript',
      Parameters: {
        commands: [httpCommand],
      },
    })
  );

  const httpCommandId = httpResult.Command?.CommandId;
  if (!httpCommandId) {
    throw new Error('Failed to send HTTP auth command via SSM');
  }

  const httpInvocation = await waitForCommand(ssmClient, httpCommandId, instanceId);

  const httpOutput = httpInvocation.stdout;
  // Successful auth returns JSON array of users, failed auth returns "Unauthorized" or empty
  const httpSuccess = httpOutput.includes('[') && !httpOutput.includes('Unauthorized');

  if (verbose) {
    console.log(`   HTTP output: ${httpOutput.trim().substring(0, 200)}`);
  }

  if (httpSuccess) {
    console.log('   ✅ HTTP API authentication: PASSED\n');
  } else {
    console.log('   ❌ HTTP API authentication: FAILED\n');
    if (verbose) {
      console.log(`   Full output: ${httpOutput}`);
    }
  }

  // Summary
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📊 Verification Summary');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`   Email:              ${email}`);
  console.log(`   Dovecot Auth:       ${dovecotSuccess ? '✅ PASSED' : '❌ FAILED'}`);
  console.log(`   HTTP API Auth:      ${httpSuccess ? '✅ PASSED' : '❌ FAILED'}`);

  const overallSuccess = dovecotSuccess && httpSuccess;
  console.log(`   Overall:            ${overallSuccess ? '✅ ALL PASSED' : '⚠️  SOME FAILED'}\n`);

  if (!overallSuccess) {
    console.log('💡 Troubleshooting:');
    if (!dovecotSuccess) {
      console.log('   - Dovecot auth failed: Password may not be synced correctly');
      console.log('     Run: pnpm nx run <app>:admin:users:password:set');
    }
    if (!httpSuccess) {
      console.log('   - HTTP API failed: User may not have admin privileges');
      console.log('     Or password hash format may not match API expectations');
    }
    console.log('');
  }

  return {
    dovecotAuth: dovecotSuccess,
    httpApi: httpSuccess,
    message: overallSuccess ? 'All authentication methods passed' : 'Some authentication methods failed',
  };
}

if (require.main === module) {
  const args = process.argv.slice(2);

  const options: VerifyUserPasswordOptions = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    switch (arg) {
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
      case '--email':
      case '-e':
        options.email = args[++i];
        break;
      case '--password':
      case '-p':
        options.password = args[++i];
        break;
      case '--verbose':
      case '-v':
        options.verbose = true;
        break;
      case '--help':
      case '-h':
        console.log(`
Usage: verify-user-password.cli.ts [options]

Verifies a Mail-in-a-Box user's password can authenticate via:
  1. Dovecot auth test (mailbox authentication)
  2. HTTP API authentication

Options:
  --domain, -d <domain>     Domain name (default: from APP_PATH or DOMAIN env)
  --app-path <path>         App path (default: from APP_PATH env)
  --region, -r <region>     AWS region (default: us-east-1)
  --profile <profile>       AWS profile (default: hepe-admin-mfa)
  --email, -e <email>       User email (or USER_EMAIL env var)
  --password, -p <password> User password (or USER_PASSWORD env var)
  --verbose, -v             Show detailed output
  --help, -h                Show this help

Examples:
  # Verify admin password
  pnpm exec tsx tools/verify-user-password.cli.ts --email admin@domain.com --password secret

  # Using environment variables
  USER_EMAIL=me@box.domain.com USER_PASSWORD=secret pnpm nx run app:admin:credentials:verify
`);
        process.exit(0);
        break;
    }
  }

  verifyUserPassword(options)
    .then(result => {
      if (!result.dovecotAuth || !result.httpApi) {
        process.exit(1);
      }
    })
    .catch((error) => {
      console.error(`Fatal error: ${error instanceof Error ? error.message : String(error)}`);
      process.exit(1);
    });
}

export { verifyUserPassword, VerifyUserPasswordOptions, VerificationResult };
