#!/usr/bin/env ts-node

/**
 * Mail-in-a-Box Status Check Tool
 * 
 * Fetches and parses MIAB status checks from the instance.
 * Allows local iteration to resolve errors and warnings.
 */

import { getStackInfoFromApp } from '@mm/admin-stack-info';
import { getSshKeyPath } from '@mm/admin-ssh';
import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

interface StatusCheckOptions {
  domain?: string;
  appPath?: string;
  region?: string;
  profile?: string;
  outputFile?: string;
  verbose?: boolean;
}

interface StatusCheckResult {
  status: 'ok' | 'error' | 'warning';
  message: string;
  details?: string;
  category?: string;
}

interface StatusCheckReport {
  timestamp: string;
  instance: {
    id?: string;
    ip?: string;
    hostname?: string;
  };
  summary: {
    total: number;
    ok: number;
    errors: number;
    warnings: number;
  };
  checks: StatusCheckResult[];
  rawOutput?: string;
}

/**
 * Execute SSH command and return output
 */
async function sshCommand(
  keyPath: string,
  host: string,
  command: string,
  options?: { verbose?: boolean }
): Promise<{ success: boolean; output: string; error?: string; exitCode?: number }> {
  return new Promise((resolve) => {
    const sshArgs = [
      '-i',
      keyPath,
      '-o',
      'StrictHostKeyChecking=no',
      '-o',
      'UserKnownHostsFile=/dev/null',
      '-o',
      'ConnectTimeout=10',
      '-o',
      'LogLevel=ERROR',
      `ubuntu@${host}`,
      command,
    ];

    if (options?.verbose) {
      console.log(`   🔍 Executing SSH command:`);
      console.log(`      ssh -i ${keyPath} ubuntu@${host}`);
      console.log(`      Command: ${command}\n`);
    }

    let output = '';
    let error = '';
    let exitCode: number | undefined;

    const ssh = spawn('ssh', sshArgs);

    ssh.stdout.on('data', (data) => {
      const text = data.toString();
      output += text;
      if (options?.verbose) {
        process.stdout.write(`   [stdout] ${text}`);
      }
    });

    ssh.stderr.on('data', (data) => {
      const text = data.toString();
      if (!text.includes('Permanently added') && !text.includes('Warning: Permanently added')) {
        error += text;
      }
      if (options?.verbose) {
        process.stderr.write(`   [stderr] ${text}`);
      }
    });

    ssh.on('close', (code) => {
      exitCode = code ?? undefined;
      if (options?.verbose) {
        console.log(`\n   🔍 SSH command exited with code: ${code}`);
      }
      resolve({
        success: code === 0,
        output: output.trim(),
        error: error.trim() || undefined,
        exitCode,
      });
    });

    ssh.on('error', (err) => {
      if (options?.verbose) {
        console.error(`\n   ❌ SSH spawn error: ${err.message}`);
      }
      resolve({
        success: false,
        output: '',
        error: err.message,
        exitCode: -1,
      });
    });
  });
}

/**
 * Parse MIAB status check output
 * Handles the format from MIAB status_checks.py output
 */
function parseStatusChecks(rawOutput: string): StatusCheckResult[] {
  const checks: StatusCheckResult[] = [];
  const lines = rawOutput.split('\n');

  let currentCategory: string | undefined;
  let skipUntilChecks = true;

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i].trim();
    if (!line) continue;

    // Skip header lines until we find "System Status Checks" or actual checks
    if (skipUntilChecks) {
      if (line.includes('System Status Checks') || line.includes('Summary:') || line.match(/^\d+\s+[✓✖?]/)) {
        skipUntilChecks = false;
      } else {
        continue;
      }
    }

    // Detect summary line and skip it
    if (line.includes('Summary:') || line.match(/^\d+\s+[✓✖?]/)) {
      continue;
    }

    // Detect category headers (System, Network, Domain names like box.emcnotary.com, emcnotary.com)
    // Category headers are typically standalone lines without status symbols
    if (!line.includes('✓') && !line.includes('✖') && !line.includes('?') && 
        (line === 'System' || line === 'Network' || 
         /^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(line) || // Domain names
         /^[a-zA-Z0-9.-]+$/.test(line))) {
      // Make sure it's not a continuation of a previous check
      if (line.length > 2 && !line.startsWith('  ') && !line.startsWith('\t')) {
        currentCategory = line;
        continue;
      }
    }

    // Parse status check lines
    // Format: "✖	Message text" or "✓	Message text" or "?	Message text"
    // The status symbol is followed by a tab or multiple spaces
    const statusMatch = line.match(/^([✓✖?])\s+(.+)$/);
    if (statusMatch) {
      const [, statusSymbol, message] = statusMatch;
      let status: 'ok' | 'error' | 'warning' = 'ok';
      if (statusSymbol === '✖') {
        status = 'error';
      } else if (statusSymbol === '?') {
        status = 'warning';
      }

      // Check if there's a details line following (indented or continuation)
      let details: string | undefined;
      let j = i + 1;
      while (j < lines.length) {
        const nextLine = lines[j].trim();
        if (!nextLine) {
          j++;
          continue;
        }
        // If next line starts with a status symbol, we've moved to next check
        if (nextLine.match(/^[✓✖?]\s+/)) {
          break;
        }
        // If next line looks like a category header, break
        if (!nextLine.includes('✓') && !nextLine.includes('✖') && !nextLine.includes('?') &&
            (nextLine === 'System' || nextLine === 'Network' || 
             /^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(nextLine))) {
          break;
        }
        // Otherwise, it's likely a continuation/details line
        if (!details) {
          details = nextLine;
        } else {
          details += ' ' + nextLine;
        }
        j++;
      }
      if (j > i + 1) {
        i = j - 1; // Skip processed lines
      }

      checks.push({
        status,
        message: message.trim(),
        details: details?.trim(),
        category: currentCategory,
      });
    } else if (line.includes('✓') || line.includes('✖') || line.includes('?')) {
      // Handle cases where status symbol might be embedded in text
      const statusSymbol = line.includes('✖') ? '✖' : line.includes('?') ? '?' : '✓';
      const message = line.replace(/[✓✖?]/g, '').trim();
      if (message && message.length > 3) {
        let status: 'ok' | 'error' | 'warning' = 'ok';
        if (statusSymbol === '✖') {
          status = 'error';
        } else if (statusSymbol === '?') {
          status = 'warning';
        }

        checks.push({
          status,
          message,
          category: currentCategory,
        });
      }
    }
  }

  return checks;
}

/**
 * Fetch MIAB status checks from instance
 */
async function fetchStatusChecks(options: StatusCheckOptions): Promise<StatusCheckReport> {
  const region = options.region || process.env.AWS_REGION || 'us-east-1';
  const profile = options.profile || process.env.AWS_PROFILE || 'hepe-admin-mfa';
  const appPath = options.appPath || process.env.APP_PATH || 'apps/cdk-emc-notary/instance';
  const domain = options.domain || process.env.DOMAIN;
  const verbose = options.verbose || process.env.VERBOSE === '1' || process.env.VERBOSE === 'true';

  if (!domain && !appPath) {
    throw new Error('Cannot resolve domain. Provide domain or appPath');
  }

  console.log('📊 Fetching Mail-in-a-Box Status Checks\n');
  console.log(`   Domain: ${domain || '(will be resolved)'}`);
  console.log(`   App Path: ${appPath}`);
  console.log(`   Region: ${region}`);
  console.log(`   Profile: ${profile}\n`);

  // Get stack info
  console.log('🔍 Step 1: Getting stack information...');
  const stackInfo = await getStackInfoFromApp(appPath, {
    domain,
    region,
    profile,
  });

  const instanceId = stackInfo.instanceId;
  const instanceIp = stackInfo.instancePublicIp;
  const resolvedDomain = stackInfo.domain;
  const instanceDns = stackInfo.instanceDns || 'box';
  const hostname = `${instanceDns}.${resolvedDomain}`;

  if (!instanceId || !instanceIp) {
    throw new Error('Instance ID or IP not found in stack outputs');
  }

  console.log(`✅ Instance: ${instanceId}`);
  console.log(`   IP: ${instanceIp}`);
  console.log(`   Hostname: ${hostname}\n`);

  // Get SSH key
  console.log('🔍 Step 2: Getting SSH key...');
  const keyPath = await getSshKeyPath({
    appPath,
    domain: resolvedDomain,
    region,
    profile,
    ensureSetup: true,
  });

  if (!keyPath) {
    throw new Error('SSH key not found. Run: pnpm nx run cdk-emcnotary-instance:admin:ssh:setup');
  }
  console.log(`✅ SSH key ready\n`);

  // Fetch status checks
  console.log('🔍 Step 3: Fetching status checks from MIAB instance...');
  
  // Try multiple methods to get status checks
  let statusOutput = '';
  let statusCommand = '';
  
  // Method 1: Run status_checks.py directly (preferred method)
  const statusCheckScript = '/opt/mailinabox/management/status_checks.py';
  const checkScriptExists = await sshCommand(
    keyPath,
    instanceIp,
    `test -f ${statusCheckScript} && echo "EXISTS" || echo "NOT_FOUND"`,
    { verbose }
  );

  if (checkScriptExists.output === 'EXISTS') {
    // Try multiple users in order of preference: mailinabox, user-data, root
    // The mailinabox user may not exist on all installations (configuration drift)
    const userCheckResult = await sshCommand(
      keyPath,
      instanceIp,
      `id -u mailinabox >/dev/null 2>&1 && echo "mailinabox" || (id -u user-data >/dev/null 2>&1 && echo "user-data" || echo "root")`,
      { verbose }
    );
    const runAsUser = userCheckResult.output.trim() || 'root';

    if (verbose) {
      console.log(`   ℹ️  Running status_checks.py as user: ${runAsUser}`);
      if (runAsUser !== 'mailinabox') {
        console.log(`   ⚠️  Note: mailinabox user not found, falling back to ${runAsUser}`);
      }
    }

    // Run status_checks.py as the appropriate user
    statusCommand = runAsUser === 'root'
      ? `sudo python3 ${statusCheckScript} 2>&1`
      : `sudo -u ${runAsUser} python3 ${statusCheckScript} 2>&1`;
  } else {
    // Method 2: Try via mailinabox CLI command
    const mailinaboxCmdCheck = await sshCommand(
      keyPath,
      instanceIp,
      `test -x /usr/local/bin/mailinabox && echo "EXISTS" || test -x /opt/mailinabox/management/mailinabox && echo "EXISTS" || echo "NOT_FOUND"`,
      { verbose }
    );

    if (mailinaboxCmdCheck.output === 'EXISTS') {
      // Try to find the actual mailinabox command path
      const mailinaboxPath = await sshCommand(
        keyPath,
        instanceIp,
        `which mailinabox || echo "/usr/local/bin/mailinabox"`,
        { verbose }
      );
      const cmdPath = mailinaboxPath.output.split('\n')[0].trim();
      statusCommand = `sudo ${cmdPath} status 2>&1`;
    } else {
      // Method 3: Try to get status from web UI (curl the status page)
      // This requires nginx to be running and may need authentication
      statusCommand = `curl -k -s https://localhost/admin/system-status 2>/dev/null | grep -A 2000 "System Status Checks" | head -500 || echo "WEB_UI_NOT_ACCESSIBLE"`;
    }
  }

  if (!statusCommand) {
    throw new Error('Could not determine how to fetch status checks. MIAB may not be installed.');
  }

  if (verbose) {
    console.log(`   Using command: ${statusCommand}\n`);
  }

  const statusResult = await sshCommand(
    keyPath,
    instanceIp,
    statusCommand,
    { verbose }
  );

  // Even if command fails, check if we got any output
  statusOutput = statusResult.output || '';

  // Check for common error patterns
  if (!statusOutput || 
      statusOutput.includes('NOT_FOUND') || 
      statusOutput.includes('WEB_UI_NOT_ACCESSIBLE') ||
      statusOutput.includes('Permission denied') ||
      statusOutput.includes('No such file')) {
    // Try alternative: Check if we can at least verify MIAB is installed
    const miabDirCheck = await sshCommand(
      keyPath,
      instanceIp,
      `test -d /opt/mailinabox && echo "EXISTS" || echo "NOT_FOUND"`,
      { verbose }
    );
    
    if (miabDirCheck.output === 'NOT_FOUND') {
      throw new Error('Mail-in-a-Box is not installed. Run bootstrap first: pnpm nx run cdk-emcnotary-instance:admin:bootstrap-miab-ec2-instance');
    }
    
    throw new Error(`Failed to fetch status checks. Output: ${statusOutput.substring(0, 200)}`);
  }

  console.log(`✅ Status checks fetched (${statusOutput.length} characters)\n`);

  // Parse status checks
  console.log('🔍 Step 4: Parsing status checks...');
  const checks = parseStatusChecks(statusOutput);

  // Calculate summary
  const summary = {
    total: checks.length,
    ok: checks.filter(c => c.status === 'ok').length,
    errors: checks.filter(c => c.status === 'error').length,
    warnings: checks.filter(c => c.status === 'warning').length,
  };

  console.log(`✅ Parsed ${checks.length} status checks`);
  console.log(`   OK: ${summary.ok}`);
  console.log(`   Errors: ${summary.errors}`);
  console.log(`   Warnings: ${summary.warnings}\n`);

  const report: StatusCheckReport = {
    timestamp: new Date().toISOString(),
    instance: {
      id: instanceId,
      ip: instanceIp,
      hostname,
    },
    summary,
    checks,
    rawOutput: statusOutput,
  };

  return report;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const options: StatusCheckOptions = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const nextArg = args[i + 1];

    switch (arg) {
      case '--domain':
        if (nextArg && !nextArg.startsWith('--')) {
          options.domain = nextArg;
          i++;
        }
        break;
      case '--app-path':
        if (nextArg && !nextArg.startsWith('--')) {
          options.appPath = nextArg;
          i++;
        }
        break;
      case '--region':
        if (nextArg && !nextArg.startsWith('--')) {
          options.region = nextArg;
          i++;
        }
        break;
      case '--profile':
        if (nextArg && !nextArg.startsWith('--')) {
          options.profile = nextArg;
          i++;
        }
        break;
      case '--output':
      case '--output-file':
        if (nextArg && !nextArg.startsWith('--')) {
          options.outputFile = nextArg;
          i++;
        }
        break;
      case '--verbose':
      case '-v':
        options.verbose = true;
        break;
      case '--help':
      case '-h':
        console.log(`
Usage: miab-status-check.cli.ts [OPTIONS]

Fetch and parse Mail-in-a-Box status checks from the instance.

Options:
  --domain DOMAIN          Domain name (e.g., emcnotary.com)
  --app-path PATH          App path (default: apps/cdk-emc-notary/instance)
  --region REGION          AWS region (default: us-east-1)
  --profile PROFILE        AWS profile (default: hepe-admin-mfa)
  --output FILE            Output file path (JSON format)
  --verbose, -v            Verbose output
  --help, -h               Show this help

Environment Variables:
  APP_PATH                 Same as --app-path
  DOMAIN                   Same as --domain
  AWS_REGION               Same as --region
  AWS_PROFILE              Same as --profile
  VERBOSE                  Same as --verbose

Examples:
  # Fetch status checks for emcnotary.com
  pnpm nx run cdk-emcnotary-instance:admin:miab:status-check

  # Save to file for analysis
  pnpm nx run cdk-emcnotary-instance:admin:miab:status-check -- --output status.json

  # Verbose output
  VERBOSE=1 pnpm nx run cdk-emcnotary-instance:admin:miab:status-check
`);
        process.exit(0);
    }
  }

  try {
    const report = await fetchStatusChecks(options);

    // Print summary
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📊 STATUS CHECK SUMMARY\n');
    console.log(`   Instance: ${report.instance.id} (${report.instance.hostname})`);
    console.log(`   IP: ${report.instance.ip}\n`);

    console.log(`   Total Checks: ${report.summary.total}`);
    console.log(`   ✅ OK: ${report.summary.ok}`);
    console.log(`   ❌ Errors: ${report.summary.errors}`);
    console.log(`   ⚠️  Warnings: ${report.summary.warnings}\n`);

    // Print errors
    if (report.summary.errors > 0) {
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('❌ ERRORS\n');
      report.checks
        .filter(c => c.status === 'error')
        .forEach((check, idx) => {
          console.log(`   ${idx + 1}. ${check.message}`);
          if (check.details) {
            console.log(`      ${check.details}`);
          }
          if (check.category) {
            console.log(`      Category: ${check.category}`);
          }
          console.log('');
        });
    }

    // Print warnings
    if (report.summary.warnings > 0) {
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('⚠️  WARNINGS\n');
      report.checks
        .filter(c => c.status === 'warning')
        .forEach((check, idx) => {
          console.log(`   ${idx + 1}. ${check.message}`);
          if (check.details) {
            console.log(`      ${check.details}`);
          }
          if (check.category) {
            console.log(`      Category: ${check.category}`);
          }
          console.log('');
        });
    }

    // Save to file if requested
    if (options.outputFile) {
      const outputPath = path.resolve(options.outputFile);
      fs.writeFileSync(outputPath, JSON.stringify(report, null, 2));
      console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
      console.log(`📄 Report saved to: ${outputPath}\n`);
    }

    // Exit with error code if there are errors
    process.exit(report.summary.errors > 0 ? 1 : 0);
  } catch (error) {
    console.error('\n❌ Error fetching status checks:');
    console.error(`   ${error instanceof Error ? error.message : String(error)}`);
    if (error instanceof Error && error.stack && options.verbose) {
      console.error(`\n${error.stack}`);
    }
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

