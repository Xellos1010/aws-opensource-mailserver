#!/usr/bin/env ts-node

/**
 * Pull Dovecot/Sieve Logs
 *
 * Retrieves mail-related logs from Mail-in-a-Box instance for diagnostics.
 * Focuses on dovecot, sieve, and mail.log to diagnose delivery issues.
 */

import { getStackInfoFromApp } from '@mm/admin-stack-info';
import {
  SSMClient,
  SendCommandCommand,
  GetCommandInvocationCommand,
  type GetCommandInvocationCommandOutput,
} from '@aws-sdk/client-ssm';
import { fromIni } from '@aws-sdk/credential-providers';
import * as fs from 'node:fs';
import * as path from 'node:path';

interface PullLogsOptions {
  domain?: string;
  appPath?: string;
  region?: string;
  profile?: string;
  logLines?: number;
  outputDir?: string;
  filterErrors?: boolean;
  timeRange?: string; // e.g., "1h", "30m", "2h"
}

interface LogFile {
  name: string;
  path: string;
  content: string;
  errorCount: number;
  warningCount: number;
}

interface LogReport {
  timestamp: string;
  domain: string;
  instanceId: string;
  logs: LogFile[];
  summary: {
    totalErrors: number;
    totalWarnings: number;
    sieveFailures: number;
    authFailures: number;
    lmtpErrors: number;
  };
  recentErrors: Array<{
    log: string;
    line: string;
    timestamp?: string;
  }>;
}

/**
 * Execute SSM command and wait for result
 */
async function executeSSMCommand(
  ssmClient: SSMClient,
  instanceId: string,
  command: string
): Promise<{ success: boolean; output: string; error?: string }> {
  try {
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
      return { success: false, output: '', error: 'No command ID returned' };
    }

    // Wait and poll for result
    let invocation: GetCommandInvocationCommandOutput | undefined;
    let retries = 0;
    const maxRetries = 15;

    while (retries < maxRetries) {
      await new Promise((resolve) => setTimeout(resolve, 2000));

      invocation = await ssmClient.send(
        new GetCommandInvocationCommand({
          CommandId: commandId,
          InstanceId: instanceId,
        })
      );

      if (invocation.Status === 'Success' || invocation.Status === 'Failed') {
        break;
      }
      retries++;
    }

    if (!invocation) {
      return { success: false, output: '', error: 'Command timeout' };
    }

    if (invocation.Status === 'Success') {
      return {
        success: true,
        output: invocation.StandardOutputContent || '',
      };
    } else {
      return {
        success: false,
        output: invocation.StandardOutputContent || '',
        error: invocation.StandardErrorContent || invocation.StatusDetails,
      };
    }
  } catch (error) {
    return {
      success: false,
      output: '',
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Parse log content for errors and warnings
 */
function analyzeLogContent(content: string): {
  errorCount: number;
  warningCount: number;
  sieveFailures: number;
  authFailures: number;
  lmtpErrors: number;
  errors: string[];
} {
  const lines = content.split('\n');
  let errorCount = 0;
  let warningCount = 0;
  let sieveFailures = 0;
  let authFailures = 0;
  let lmtpErrors = 0;
  const errors: string[] = [];

  for (const line of lines) {
    const lowerLine = line.toLowerCase();

    // Count errors
    if (
      lowerLine.includes('error') ||
      lowerLine.includes('fatal') ||
      lowerLine.includes('failed')
    ) {
      errorCount++;
      errors.push(line);
    }

    // Count warnings
    if (lowerLine.includes('warning') || lowerLine.includes('warn')) {
      warningCount++;
    }

    // Specific checks
    if (lowerLine.includes('sieve') && (lowerLine.includes('error') || lowerLine.includes('failed'))) {
      sieveFailures++;
    }

    if (lowerLine.includes('auth') && lowerLine.includes('failed')) {
      authFailures++;
    }

    if (lowerLine.includes('lmtp') && (lowerLine.includes('error') || lowerLine.includes('failed'))) {
      lmtpErrors++;
    }
  }

  return {
    errorCount,
    warningCount,
    sieveFailures,
    authFailures,
    lmtpErrors,
    errors: errors.slice(-50), // Keep last 50 errors
  };
}

/**
 * Pull logs from instance
 */
async function pullDovecotLogs(options: PullLogsOptions): Promise<LogReport> {
  const region = options.region || process.env.AWS_REGION || 'us-east-1';
  const profile = options.profile || process.env.AWS_PROFILE || 'hepe-admin-mfa';
  const appPath = options.appPath || process.env.APP_PATH || 'apps/cdk-k3frame/instance';
  const domain = options.domain || process.env.DOMAIN;
  const logLines = options.logLines || parseInt(process.env.LOG_LINES || '500', 10);
  const outputDir = options.outputDir || process.env.OUTPUT_DIR || './dovecot-logs';
  const filterErrors = options.filterErrors || process.env.FILTER_ERRORS === '1';

  if (!domain && !appPath) {
    throw new Error('Cannot resolve domain. Provide domain or appPath');
  }

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📋 Pull Dovecot/Sieve Logs');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  console.log(`   Domain: ${domain}`);
  console.log(`   Region: ${region}`);
  console.log(`   Log Lines: ${logLines}`);
  console.log(`   Filter Errors: ${filterErrors}`);
  console.log(`   Output Dir: ${outputDir}\n`);

  // Get stack info
  console.log('🔍 Getting stack information...');
  const stackInfo = await getStackInfoFromApp(appPath, { domain, region, profile });
  const instanceId = stackInfo.instanceId;
  const resolvedDomain = stackInfo.domain || domain!;

  if (!instanceId) {
    throw new Error('Instance ID not found in stack outputs');
  }

  console.log(`   Instance: ${instanceId}\n`);

  const credentials = fromIni({ profile });
  const ssmClient = new SSMClient({ region, credentials });

  // Create output directory
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const logs: LogFile[] = [];
  const allErrors: Array<{ log: string; line: string }> = [];

  // Define log files to fetch
  const logFiles = [
    { name: 'mail.log', path: '/var/log/mail.log' },
    { name: 'mail.err', path: '/var/log/mail.err' },
    { name: 'dovecot.log', path: '/var/log/dovecot.log' },
    { name: 'dovecot-info.log', path: '/var/log/dovecot-info.log' },
    { name: 'syslog-mail', path: '/var/log/syslog', grepFilter: 'dovecot\\|postfix\\|sieve' },
  ];

  for (const logFile of logFiles) {
    console.log(`📄 Fetching ${logFile.name}...`);

    let command: string;
    if (logFile.grepFilter) {
      command = filterErrors
        ? `sudo grep -E '${logFile.grepFilter}' ${logFile.path} 2>/dev/null | grep -iE 'error|failed|fatal|warning' | tail -n ${logLines}`
        : `sudo grep -E '${logFile.grepFilter}' ${logFile.path} 2>/dev/null | tail -n ${logLines}`;
    } else {
      command = filterErrors
        ? `sudo cat ${logFile.path} 2>/dev/null | grep -iE 'error|failed|fatal|warning' | tail -n ${logLines}`
        : `sudo tail -n ${logLines} ${logFile.path} 2>/dev/null`;
    }

    const result = await executeSSMCommand(ssmClient, instanceId, command);

    if (result.success && result.output.trim()) {
      const analysis = analyzeLogContent(result.output);

      logs.push({
        name: logFile.name,
        path: logFile.path,
        content: result.output,
        errorCount: analysis.errorCount,
        warningCount: analysis.warningCount,
      });

      // Collect errors with log source
      for (const error of analysis.errors) {
        allErrors.push({ log: logFile.name, line: error });
      }

      // Save to file
      const outputPath = path.join(outputDir, `${logFile.name}.txt`);
      fs.writeFileSync(outputPath, result.output);

      console.log(
        `   ✅ Retrieved ${result.output.split('\n').length} lines ` +
          `(${analysis.errorCount} errors, ${analysis.warningCount} warnings)`
      );
    } else if (result.error) {
      console.log(`   ⚠️  Could not retrieve: ${result.error}`);
    } else {
      console.log(`   ℹ️  Empty or not found`);
    }
  }

  // Also fetch recent sieve-related errors specifically
  console.log('\n📄 Fetching sieve-specific errors...');
  const sieveResult = await executeSSMCommand(
    ssmClient,
    instanceId,
    `sudo grep -i sieve /var/log/mail.log 2>/dev/null | grep -iE 'error|failed|fatal' | tail -n 50`
  );

  if (sieveResult.success && sieveResult.output.trim()) {
    const sievePath = path.join(outputDir, 'sieve-errors.txt');
    fs.writeFileSync(sievePath, sieveResult.output);
    console.log(`   ✅ Retrieved ${sieveResult.output.split('\n').length} sieve error lines`);

    for (const line of sieveResult.output.split('\n').filter((l) => l.trim())) {
      allErrors.push({ log: 'sieve-errors', line });
    }
  }

  // Calculate totals
  const totals = logs.reduce(
    (acc, log) => {
      const analysis = analyzeLogContent(log.content);
      acc.totalErrors += analysis.errorCount;
      acc.totalWarnings += analysis.warningCount;
      acc.sieveFailures += analysis.sieveFailures;
      acc.authFailures += analysis.authFailures;
      acc.lmtpErrors += analysis.lmtpErrors;
      return acc;
    },
    {
      totalErrors: 0,
      totalWarnings: 0,
      sieveFailures: 0,
      authFailures: 0,
      lmtpErrors: 0,
    }
  );

  const report: LogReport = {
    timestamp: new Date().toISOString(),
    domain: resolvedDomain,
    instanceId,
    logs,
    summary: totals,
    recentErrors: allErrors.slice(-100),
  };

  // Save report
  const reportPath = path.join(outputDir, 'log-report.json');
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

  // Print summary
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📊 Log Analysis Summary');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  console.log(`   Total Errors: ${totals.totalErrors}`);
  console.log(`   Total Warnings: ${totals.totalWarnings}`);
  console.log(`   Sieve Failures: ${totals.sieveFailures}`);
  console.log(`   Auth Failures: ${totals.authFailures}`);
  console.log(`   LMTP Errors: ${totals.lmtpErrors}\n`);

  if (allErrors.length > 0) {
    console.log('   Recent Errors (last 10):');
    for (const error of allErrors.slice(-10)) {
      const truncated = error.line.length > 100 ? error.line.substring(0, 100) + '...' : error.line;
      console.log(`   [${error.log}] ${truncated}`);
    }
    console.log('');
  }

  console.log(`📁 Logs saved to: ${path.resolve(outputDir)}`);
  console.log(`📄 Report saved to: ${path.resolve(reportPath)}\n`);

  // Recommendations based on findings
  if (totals.sieveFailures > 0) {
    console.log('💡 Sieve Recommendations:');
    console.log('   - Recompile sieve scripts: sudo sievec /home/user-data/mail/sieve/*.sieve');
    console.log('   - Check sieve script permissions');
    console.log('   - Verify spamassassin/spampd is running\n');
  }

  if (totals.authFailures > 0) {
    console.log('💡 Auth Recommendations:');
    console.log('   - Check dovecot auth configuration');
    console.log('   - Verify user exists in database');
    console.log('   - Run: doveadm auth test <user@domain> <password>\n');
  }

  if (totals.lmtpErrors > 0) {
    console.log('💡 LMTP Recommendations:');
    console.log('   - Check dovecot lmtp service: systemctl status dovecot');
    console.log('   - Verify mailbox directories have correct permissions');
    console.log('   - Run: doveadm force-resync -u <user@domain> "*"\n');
  }

  return report;
}

// CLI interface
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const options: PullLogsOptions = {};

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
      case '--lines':
      case '-n':
        options.logLines = parseInt(args[++i], 10);
        break;
      case '--output-dir':
      case '-o':
        options.outputDir = args[++i];
        break;
      case '--filter-errors':
      case '-e':
        options.filterErrors = true;
        break;
      case '--help':
      case '-h':
        console.log(`
Usage: pull-dovecot-logs.cli.ts [options]

Pull Dovecot/Sieve logs from Mail-in-a-Box instance for diagnostics.

Options:
  --domain, -d <domain>        Domain name
  --app-path <path>            App path (default: from APP_PATH env)
  --region, -r <region>        AWS region (default: us-east-1)
  --profile <profile>          AWS profile (default: hepe-admin-mfa)
  --lines, -n <count>          Number of log lines to fetch (default: 500)
  --output-dir, -o <dir>       Output directory (default: ./dovecot-logs)
  --filter-errors, -e          Only fetch error/warning lines
  --help, -h                   Show this help

Environment Variables:
  DOMAIN                       Same as --domain
  APP_PATH                     Same as --app-path
  AWS_REGION                   Same as --region
  AWS_PROFILE                  Same as --profile
  LOG_LINES                    Same as --lines
  OUTPUT_DIR                   Same as --output-dir
  FILTER_ERRORS                Set to 1 to filter errors only

Examples:
  pnpm nx run cdk-k3frame-instance:admin:logs:dovecot
  FILTER_ERRORS=1 pnpm nx run cdk-k3frame-instance:admin:logs:dovecot
  LOG_LINES=1000 pnpm nx run cdk-k3frame-instance:admin:logs:dovecot
`);
        process.exit(0);
    }
  }

  try {
    await pullDovecotLogs(options);
    process.exit(0);
  } catch (error) {
    console.error(`\n❌ Fatal error: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

export { pullDovecotLogs };
