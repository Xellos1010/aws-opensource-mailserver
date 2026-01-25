#!/usr/bin/env ts-node

/**
 * Pull Webmail Logs
 * 
 * Retrieves webmail/web UI logs from Mail-in-a-Box instance to diagnose authentication issues
 * Pulls logs from:
 * - Nginx (web server)
 * - Roundcube (webmail application)
 * - Dovecot (IMAP authentication)
 * - Postfix (SMTP authentication)
 * - Mail-in-a-Box system logs
 */

import { resolveStackName, resolveDomain, getStackInfo } from '@mm/admin-stack-info';
import { SSMClient, SendCommandCommand, GetCommandInvocationCommand } from '@aws-sdk/client-ssm';
import { fromIni } from '@aws-sdk/credential-providers';
import * as fs from 'node:fs';
import * as path from 'node:path';

interface PullWebmailLogsOptions {
  domain?: string;
  appPath?: string;
  region?: string;
  profile?: string;
  outputDir?: string;
  lines?: number;
  follow?: boolean;
}

async function pullWebmailLogs(options: PullWebmailLogsOptions): Promise<void> {
  const region = options.region || process.env.AWS_REGION || 'us-east-1';
  const profile = options.profile || process.env.AWS_PROFILE || 'hepe-admin-mfa';
  const domain = options.domain || process.env.DOMAIN;
  const appPath = options.appPath || process.env.APP_PATH;
  const outputDir = options.outputDir || process.env.OUTPUT_DIR || './webmail-logs';
  const lines = options.lines || parseInt(process.env.LOG_LINES || '1000', 10);
  const follow = options.follow || process.env.FOLLOW === '1';

  if (!domain && !appPath) {
    throw new Error('Cannot resolve domain. Provide domain or appPath');
  }

  const resolvedDomain = domain || (appPath ? resolveDomain(appPath) : null);
  if (!resolvedDomain) {
    throw new Error('Cannot resolve domain. Provide domain or appPath');
  }

  console.log('📋 Pull Webmail Logs');
  console.log(`   Domain: ${resolvedDomain}`);
  console.log(`   Output Directory: ${outputDir}`);
  console.log(`   Lines per log: ${lines}`);
  console.log(`   Follow: ${follow ? 'YES' : 'NO'}\n`);

  // Get instance info
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

  console.log(`✅ Instance ID: ${instanceId}\n`);

  // Create output directory
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
    console.log(`✅ Created output directory: ${outputDir}\n`);
  }

  const credentials = fromIni({ profile });
  const ssmClient = new SSMClient({ region, credentials });

  // Define log files to retrieve
  const logFiles = [
    {
      name: 'nginx-error',
      path: '/var/log/nginx/error.log',
      description: 'Nginx error log (web server errors)',
    },
    {
      name: 'nginx-access',
      path: '/var/log/nginx/access.log',
      description: 'Nginx access log (HTTP requests)',
    },
    {
      name: 'roundcube-error',
      path: '/var/log/roundcube/errors.log',
      description: 'Roundcube error log (webmail application errors)',
    },
    {
      name: 'roundcube-userlogins',
      path: '/var/log/roundcube/userlogins.log',
      description: 'Roundcube user login log',
    },
    {
      name: 'roundcube-errors-alt',
      path: '/var/www/roundcube/logs/errors.log',
      description: 'Roundcube error log (alternative location)',
    },
    {
      name: 'roundcube-userlogins-alt',
      path: '/var/www/roundcube/logs/userlogins.log',
      description: 'Roundcube user login log (alternative location)',
    },
    {
      name: 'php-errors',
      path: '/var/log/php*-fpm.log',
      description: 'PHP-FPM error log (webmail PHP errors)',
      glob: true,
    },
    {
      name: 'dovecot-auth',
      path: '/var/log/mail.log',
      description: 'Dovecot authentication log (IMAP/POP3)',
      filter: 'dovecot',
    },
    {
      name: 'postfix-auth',
      path: '/var/log/mail.log',
      description: 'Postfix authentication log (SMTP)',
      filter: 'postfix',
    },
    {
      name: 'mailinabox-setup',
      path: '/var/log/mailinabox_setup.log',
      description: 'Mail-in-a-Box setup log',
    },
    {
      name: 'syslog-auth',
      path: '/var/log/syslog',
      description: 'System log (authentication events)',
      filter: 'auth|login|401|unauthorized',
    },
  ];

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📊 Retrieving Logs');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const results: Array<{ name: string; success: boolean; lines: number; file: string }> = [];

  for (const logFile of logFiles) {
    console.log(`📋 Retrieving ${logFile.name}...`);
    
    try {
      let command: string;
      if (logFile.glob) {
        // Handle glob patterns (e.g., /var/log/php*-fpm.log)
        command = `for f in ${logFile.path}; do [ -f "$f" ] && tail -n ${lines} "$f" 2>/dev/null; done | head -n ${lines} || echo "No matching files found"`;
      } else if (logFile.filter) {
        // Use grep to filter log entries
        command = `tail -n ${lines} ${logFile.path} 2>/dev/null | grep -i "${logFile.filter}" || echo "No matching entries or file not found"`;
      } else {
        command = `tail -n ${lines} ${logFile.path} 2>/dev/null || echo "File not found or empty"`;
      }

      const result = await ssmClient.send(
        new SendCommandCommand({
          InstanceIds: [instanceId],
          DocumentName: 'AWS-RunShellScript',
          Parameters: {
            commands: [command],
          },
        })
      );

      const commandId = result.Command?.CommandId;
      if (!commandId) {
        throw new Error('Failed to send command');
      }

      await new Promise(resolve => setTimeout(resolve, 3000));
      
      const invocation = await ssmClient.send(
        new GetCommandInvocationCommand({
          CommandId: commandId,
          InstanceId: instanceId,
        })
      );

      if (invocation.Status === 'Success') {
        const output = invocation.StandardOutputContent || '';
        const error = invocation.StandardErrorContent || '';
        const content = output || error;

        if (content && !content.includes('File not found') && !content.includes('No matching entries')) {
          const outputFile = path.join(outputDir, `${logFile.name}.log`);
          fs.writeFileSync(outputFile, content, 'utf8');
          
          const lineCount = content.split('\n').filter(l => l.trim()).length;
          results.push({ name: logFile.name, success: true, lines: lineCount, file: outputFile });
          console.log(`   ✅ Retrieved ${lineCount} lines → ${outputFile}\n`);
        } else {
          results.push({ name: logFile.name, success: false, lines: 0, file: '' });
          console.log(`   ⚠️  No content found\n`);
        }
      } else {
        results.push({ name: logFile.name, success: false, lines: 0, file: '' });
        console.log(`   ❌ Failed: ${invocation.StandardErrorContent || invocation.StandardOutputContent}\n`);
      }
    } catch (error) {
      results.push({ name: logFile.name, success: false, lines: 0, file: '' });
      console.log(`   ❌ Error: ${error instanceof Error ? error.message : String(error)}\n`);
    }
  }

  // Also get recent authentication attempts specifically
  console.log('📋 Retrieving recent authentication attempts...');
  try {
    const authCommand = `tail -n ${lines * 2} /var/log/mail.log /var/log/nginx/access.log /var/log/roundcube/userlogins.log 2>/dev/null | grep -iE "(login|auth|401|unauthorized|test@emcnotary)" | tail -n ${lines}`;
    
    const authResult = await ssmClient.send(
      new SendCommandCommand({
        InstanceIds: [instanceId],
        DocumentName: 'AWS-RunShellScript',
        Parameters: {
          commands: [authCommand],
        },
      })
    );

    const authCommandId = authResult.Command?.CommandId;
    if (authCommandId) {
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      const authInvocation = await ssmClient.send(
        new GetCommandInvocationCommand({
          CommandId: authCommandId,
          InstanceId: instanceId,
        })
      );

      if (authInvocation.Status === 'Success') {
        const authContent = authInvocation.StandardOutputContent || '';
        if (authContent && authContent.trim()) {
          const authFile = path.join(outputDir, 'authentication-attempts.log');
          fs.writeFileSync(authFile, authContent, 'utf8');
          const authLineCount = authContent.split('\n').filter(l => l.trim()).length;
          console.log(`   ✅ Retrieved ${authLineCount} authentication-related lines → ${authFile}\n`);
        } else {
          console.log(`   ⚠️  No authentication attempts found\n`);
        }
      }
    }
  } catch (error) {
    console.log(`   ⚠️  Could not retrieve authentication attempts: ${error instanceof Error ? error.message : String(error)}\n`);
  }

  // Summary
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📊 Log Retrieval Summary');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  
  const successful = results.filter(r => r.success);
  const failed = results.filter(r => !r.success);
  
  console.log(`   Successful: ${successful.length}/${results.length}`);
  if (successful.length > 0) {
    console.log('\n   Retrieved logs:');
    for (const result of successful) {
      console.log(`     ${result.name}: ${result.lines} lines → ${result.file}`);
    }
  }
  
  if (failed.length > 0) {
    console.log('\n   Failed logs:');
    for (const result of failed) {
      console.log(`     ${result.name}`);
    }
  }

  console.log(`\n📁 All logs saved to: ${path.resolve(outputDir)}\n`);

  // Check for 401 errors in retrieved logs
  console.log('🔍 Searching for 401 errors in retrieved logs...\n');
  let found401 = false;
  
  for (const result of successful) {
    if (result.file && fs.existsSync(result.file)) {
      const content = fs.readFileSync(result.file, 'utf8');
      const lines = content.split('\n');
      const error401Lines = lines.filter(l => 
        l.toLowerCase().includes('401') || 
        l.toLowerCase().includes('unauthorized') ||
        l.toLowerCase().includes('authentication failed') ||
        l.toLowerCase().includes('login failed')
      );
      
      if (error401Lines.length > 0) {
        found401 = true;
        console.log(`   ⚠️  Found ${error401Lines.length} 401/authentication errors in ${result.name}:`);
        for (const line of error401Lines.slice(0, 10)) {
          console.log(`      ${line.substring(0, 150)}`);
        }
        if (error401Lines.length > 10) {
          console.log(`      ... and ${error401Lines.length - 10} more`);
        }
        console.log('');
      }
    }
  }

  if (!found401) {
    console.log('   ✅ No 401 errors found in retrieved logs\n');
  }

  console.log('💡 Next Steps:');
  console.log(`   1. Review logs in: ${path.resolve(outputDir)}`);
  console.log(`   2. Check nginx-error.log for web server errors`);
  console.log(`   3. Check roundcube-error.log for webmail application errors`);
  console.log(`   4. Check authentication-attempts.log for login attempts`);
  console.log(`   5. Verify user exists: pnpm nx run cdk-emcnotary-instance:admin:users:list`);
  console.log(`   6. Check user password: pnpm nx run cdk-emcnotary-instance:admin:credentials:sync`);
}

// CLI interface
if (require.main === module) {
  const args = process.argv.slice(2);
  
  const options: PullWebmailLogsOptions = {};

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
      case '--output-dir':
      case '-o':
        options.outputDir = args[++i];
        break;
      case '--lines':
      case '-n':
        options.lines = parseInt(args[++i], 10);
        break;
      case '--follow':
      case '-f':
        options.follow = true;
        break;
      case '--help':
      case '-h':
        console.log(`
Usage: pull-webmail-logs.cli.ts [options]

Retrieves webmail/web UI logs from Mail-in-a-Box instance to diagnose authentication issues.

Options:
  --domain, -d <domain>        Domain name (default: from APP_PATH or DOMAIN env)
  --app-path <path>            App path (default: from APP_PATH env)
  --region, -r <region>         AWS region (default: us-east-1)
  --profile <profile>          AWS profile (default: hepe-admin-mfa)
  --output-dir, -o <dir>       Output directory (default: ./webmail-logs)
  --lines, -n <number>         Number of lines per log (default: 1000)
  --follow, -f                 Follow logs (not implemented yet)
  --help, -h                   Show this help

Examples:
  # Pull last 1000 lines of each log
  pnpm exec tsx tools/pull-webmail-logs.cli.ts

  # Pull last 5000 lines
  pnpm exec tsx tools/pull-webmail-logs.cli.ts --lines 5000

  # Custom output directory
  pnpm exec tsx tools/pull-webmail-logs.cli.ts --output-dir ./logs
`);
        process.exit(0);
        break;
    }
  }

  pullWebmailLogs(options).catch((error) => {
    console.error(`Fatal error: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  });
}

export { pullWebmailLogs };

