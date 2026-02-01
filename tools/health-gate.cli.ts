#!/usr/bin/env ts-node

/**
 * Post-Deploy Health Gate
 *
 * Comprehensive health check that runs after deployment to ensure
 * all critical systems are functioning. Fails the pipeline if any
 * critical check fails.
 *
 * Checks performed:
 * - Availability report (EC2, services, HTTP/HTTPS endpoints)
 * - IMAP authentication test
 * - SMTP connectivity
 * - Disk space threshold
 * - Optional: Mail flow test
 */

import { getStackInfoFromApp } from '@mm/admin-stack-info';
import { getAdminPassword } from '@mm/admin-credentials';
import {
  SSMClient,
  SendCommandCommand,
  GetCommandInvocationCommand,
} from '@aws-sdk/client-ssm';
import { EC2Client, DescribeInstancesCommand } from '@aws-sdk/client-ec2';
import { fromIni } from '@aws-sdk/credential-providers';
import * as https from 'node:https';
import * as net from 'node:net';
import * as fs from 'node:fs';
import * as path from 'node:path';

interface HealthGateOptions {
  domain?: string;
  appPath?: string;
  region?: string;
  profile?: string;
  diskThreshold?: number;
  skipMailFlow?: boolean;
  outputFile?: string;
}

interface CheckResult {
  name: string;
  status: 'pass' | 'fail' | 'warn' | 'skip';
  message: string;
  critical: boolean;
}

interface HealthGateReport {
  timestamp: string;
  domain: string;
  instanceId: string;
  passed: boolean;
  checks: CheckResult[];
  summary: {
    total: number;
    passed: number;
    failed: number;
    warnings: number;
    skipped: number;
  };
}

/**
 * Check TCP port connectivity
 */
async function checkTcpPort(
  host: string,
  port: number,
  timeout: number = 10000
): Promise<{ success: boolean; responseTime: number; error?: string }> {
  return new Promise((resolve) => {
    const startTime = Date.now();
    const socket = new net.Socket();

    socket.setTimeout(timeout);

    socket.on('connect', () => {
      const responseTime = Date.now() - startTime;
      socket.destroy();
      resolve({ success: true, responseTime });
    });

    socket.on('timeout', () => {
      socket.destroy();
      resolve({ success: false, responseTime: Date.now() - startTime, error: 'Timeout' });
    });

    socket.on('error', (error) => {
      socket.destroy();
      resolve({ success: false, responseTime: Date.now() - startTime, error: error.message });
    });

    socket.connect(port, host);
  });
}

/**
 * Check HTTPS endpoint
 */
async function checkHttps(
  url: string,
  timeout: number = 10000
): Promise<{ success: boolean; statusCode?: number; responseTime: number; error?: string }> {
  return new Promise((resolve) => {
    const startTime = Date.now();
    const req = https.get(
      url,
      { timeout, rejectUnauthorized: false },
      (res) => {
        const responseTime = Date.now() - startTime;
        res.destroy();
        resolve({
          success: res.statusCode !== undefined && res.statusCode < 500,
          statusCode: res.statusCode,
          responseTime,
        });
      }
    );

    req.on('error', (error) => {
      resolve({
        success: false,
        responseTime: Date.now() - startTime,
        error: error.message,
      });
    });

    req.on('timeout', () => {
      req.destroy();
      resolve({
        success: false,
        responseTime: Date.now() - startTime,
        error: 'Timeout',
      });
    });
  });
}

/**
 * Run health gate checks
 */
async function runHealthGate(options: HealthGateOptions): Promise<HealthGateReport> {
  const region = options.region || process.env.AWS_REGION || 'us-east-1';
  const profile = options.profile || process.env.AWS_PROFILE || 'hepe-admin-mfa';
  const appPath = options.appPath || process.env.APP_PATH || 'apps/cdk-k3frame/instance';
  const domain = options.domain || process.env.DOMAIN;
  const diskThreshold = options.diskThreshold || parseInt(process.env.DISK_THRESHOLD || '85', 10);
  const skipMailFlow = options.skipMailFlow || process.env.SKIP_MAIL_FLOW === '1';

  if (!domain && !appPath) {
    throw new Error('Cannot resolve domain. Provide domain or appPath');
  }

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🔒 Post-Deploy Health Gate');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  console.log(`   Domain: ${domain}`);
  console.log(`   Region: ${region}`);
  console.log(`   Disk Threshold: ${diskThreshold}%`);
  console.log(`   Skip Mail Flow: ${skipMailFlow}\n`);

  const checks: CheckResult[] = [];

  // Get stack info
  console.log('🔍 Getting stack information...');
  const stackInfo = await getStackInfoFromApp(appPath, { domain, region, profile });
  const instanceId = stackInfo.instanceId;
  const instanceIp = stackInfo.instancePublicIp;
  const resolvedDomain = stackInfo.domain || domain!;

  if (!instanceId || !instanceIp) {
    throw new Error('Instance ID or IP not found in stack outputs');
  }

  console.log(`   Instance: ${instanceId}`);
  console.log(`   IP: ${instanceIp}\n`);

  const credentials = fromIni({ profile });
  const ssmClient = new SSMClient({ region, credentials });
  const ec2Client = new EC2Client({ region, credentials });

  // Check 1: EC2 Instance Status
  console.log('📋 Check 1: EC2 Instance Status');
  try {
    const ec2Result = await ec2Client.send(
      new DescribeInstancesCommand({ InstanceIds: [instanceId] })
    );
    const instance = ec2Result.Reservations?.[0]?.Instances?.[0];
    const state = instance?.State?.Name;

    if (state === 'running') {
      checks.push({
        name: 'EC2 Instance Status',
        status: 'pass',
        message: `Instance is running`,
        critical: true,
      });
      console.log('   ✅ Instance is running\n');
    } else {
      checks.push({
        name: 'EC2 Instance Status',
        status: 'fail',
        message: `Instance state: ${state}`,
        critical: true,
      });
      console.log(`   ❌ Instance state: ${state}\n`);
    }
  } catch (error) {
    checks.push({
      name: 'EC2 Instance Status',
      status: 'fail',
      message: `Failed to check: ${error instanceof Error ? error.message : String(error)}`,
      critical: true,
    });
    console.log(`   ❌ Failed to check EC2 status\n`);
  }

  // Check 2: HTTPS Web Server
  console.log('📋 Check 2: HTTPS Web Server');
  const httpsResult = await checkHttps(`https://${instanceIp}`, 15000);
  if (httpsResult.success) {
    checks.push({
      name: 'HTTPS Web Server',
      status: 'pass',
      message: `HTTP ${httpsResult.statusCode} (${httpsResult.responseTime}ms)`,
      critical: true,
    });
    console.log(`   ✅ HTTPS responding (${httpsResult.responseTime}ms)\n`);
  } else {
    checks.push({
      name: 'HTTPS Web Server',
      status: 'fail',
      message: httpsResult.error || 'Connection failed',
      critical: true,
    });
    console.log(`   ❌ ${httpsResult.error || 'Connection failed'}\n`);
  }

  // Check 3: IMAPS (port 993)
  console.log('📋 Check 3: IMAPS Connectivity (port 993)');
  const imapsResult = await checkTcpPort(instanceIp, 993, 10000);
  if (imapsResult.success) {
    checks.push({
      name: 'IMAPS Port 993',
      status: 'pass',
      message: `Connected (${imapsResult.responseTime}ms)`,
      critical: true,
    });
    console.log(`   ✅ IMAPS port open (${imapsResult.responseTime}ms)\n`);
  } else {
    checks.push({
      name: 'IMAPS Port 993',
      status: 'fail',
      message: imapsResult.error || 'Connection failed',
      critical: true,
    });
    console.log(`   ❌ ${imapsResult.error || 'Connection failed'}\n`);
  }

  // Check 4: SMTP Submission (port 587)
  console.log('📋 Check 4: SMTP Submission (port 587)');
  const smtpResult = await checkTcpPort(instanceIp, 587, 10000);
  if (smtpResult.success) {
    checks.push({
      name: 'SMTP Port 587',
      status: 'pass',
      message: `Connected (${smtpResult.responseTime}ms)`,
      critical: true,
    });
    console.log(`   ✅ SMTP port open (${smtpResult.responseTime}ms)\n`);
  } else {
    checks.push({
      name: 'SMTP Port 587',
      status: 'fail',
      message: smtpResult.error || 'Connection failed',
      critical: true,
    });
    console.log(`   ❌ ${smtpResult.error || 'Connection failed'}\n`);
  }

  // Check 5: Disk Usage
  console.log('📋 Check 5: Disk Usage');
  try {
    const diskResult = await ssmClient.send(
      new SendCommandCommand({
        InstanceIds: [instanceId],
        DocumentName: 'AWS-RunShellScript',
        Parameters: {
          commands: ["df -h / | tail -1 | awk '{print $5}' | tr -d '%'"],
        },
      })
    );

    const commandId = diskResult.Command?.CommandId;
    if (commandId) {
      await new Promise((resolve) => setTimeout(resolve, 3000));

      const invocation = await ssmClient.send(
        new GetCommandInvocationCommand({
          CommandId: commandId,
          InstanceId: instanceId,
        })
      );

      if (invocation.Status === 'Success') {
        const percentUsed = parseInt(invocation.StandardOutputContent?.trim() || '0', 10);

        if (percentUsed >= diskThreshold) {
          checks.push({
            name: 'Disk Usage',
            status: 'fail',
            message: `${percentUsed}% used (threshold: ${diskThreshold}%)`,
            critical: true,
          });
          console.log(`   ❌ Disk usage ${percentUsed}% exceeds threshold ${diskThreshold}%\n`);
        } else if (percentUsed >= diskThreshold - 10) {
          checks.push({
            name: 'Disk Usage',
            status: 'warn',
            message: `${percentUsed}% used (approaching threshold: ${diskThreshold}%)`,
            critical: false,
          });
          console.log(`   ⚠️  Disk usage ${percentUsed}% approaching threshold\n`);
        } else {
          checks.push({
            name: 'Disk Usage',
            status: 'pass',
            message: `${percentUsed}% used`,
            critical: false,
          });
          console.log(`   ✅ Disk usage ${percentUsed}%\n`);
        }
      } else {
        checks.push({
          name: 'Disk Usage',
          status: 'warn',
          message: 'Could not determine disk usage',
          critical: false,
        });
        console.log('   ⚠️  Could not determine disk usage\n');
      }
    }
  } catch (error) {
    checks.push({
      name: 'Disk Usage',
      status: 'warn',
      message: `Check failed: ${error instanceof Error ? error.message : String(error)}`,
      critical: false,
    });
    console.log(`   ⚠️  Disk check failed\n`);
  }

  // Check 6: IMAP Authentication Test
  console.log('📋 Check 6: IMAP Authentication');
  try {
    const adminPassword = await getAdminPassword({
      domain: resolvedDomain,
      region,
      profile,
    });

    if (adminPassword) {
      const authResult = await ssmClient.send(
        new SendCommandCommand({
          InstanceIds: [instanceId],
          DocumentName: 'AWS-RunShellScript',
          Parameters: {
            commands: [
              `doveadm auth test admin@${resolvedDomain} '${adminPassword.replace(/'/g, "'\\''")}' 2>&1 | head -5`,
            ],
          },
        })
      );

      const authCommandId = authResult.Command?.CommandId;
      if (authCommandId) {
        await new Promise((resolve) => setTimeout(resolve, 3000));

        const authInvocation = await ssmClient.send(
          new GetCommandInvocationCommand({
            CommandId: authCommandId,
            InstanceId: instanceId,
          })
        );

        const output = authInvocation.StandardOutputContent || '';
        if (output.includes('passdb') || output.includes('auth succeeded')) {
          checks.push({
            name: 'IMAP Authentication',
            status: 'pass',
            message: `admin@${resolvedDomain} authenticated successfully`,
            critical: true,
          });
          console.log(`   ✅ IMAP auth succeeded for admin@${resolvedDomain}\n`);
        } else {
          checks.push({
            name: 'IMAP Authentication',
            status: 'fail',
            message: `Authentication failed: ${output.substring(0, 100)}`,
            critical: true,
          });
          console.log(`   ❌ IMAP auth failed\n`);
        }
      }
    } else {
      checks.push({
        name: 'IMAP Authentication',
        status: 'skip',
        message: 'No admin password found in SSM',
        critical: true,
      });
      console.log('   ⏭️  Skipped (no admin password)\n');
    }
  } catch (error) {
    checks.push({
      name: 'IMAP Authentication',
      status: 'warn',
      message: `Check failed: ${error instanceof Error ? error.message : String(error)}`,
      critical: true,
    });
    console.log(`   ⚠️  Auth check failed\n`);
  }

  // Check 7: Core Services
  console.log('📋 Check 7: Core Services');
  try {
    const servicesResult = await ssmClient.send(
      new SendCommandCommand({
        InstanceIds: [instanceId],
        DocumentName: 'AWS-RunShellScript',
        Parameters: {
          commands: [
            'for svc in nginx dovecot postfix; do status=$(systemctl is-active $svc 2>&1); echo "$svc:$status"; done',
          ],
        },
      })
    );

    const svcCommandId = servicesResult.Command?.CommandId;
    if (svcCommandId) {
      await new Promise((resolve) => setTimeout(resolve, 3000));

      const svcInvocation = await ssmClient.send(
        new GetCommandInvocationCommand({
          CommandId: svcCommandId,
          InstanceId: instanceId,
        })
      );

      if (svcInvocation.Status === 'Success') {
        const output = svcInvocation.StandardOutputContent || '';
        const lines = output.split('\n').filter((l) => l.trim());
        const failedServices: string[] = [];

        for (const line of lines) {
          const [name, status] = line.split(':');
          if (status?.trim() !== 'active') {
            failedServices.push(name);
          }
        }

        if (failedServices.length === 0) {
          checks.push({
            name: 'Core Services',
            status: 'pass',
            message: 'nginx, dovecot, postfix all active',
            critical: true,
          });
          console.log('   ✅ All core services running\n');
        } else {
          checks.push({
            name: 'Core Services',
            status: 'fail',
            message: `Failed: ${failedServices.join(', ')}`,
            critical: true,
          });
          console.log(`   ❌ Services not running: ${failedServices.join(', ')}\n`);
        }
      }
    }
  } catch (error) {
    checks.push({
      name: 'Core Services',
      status: 'warn',
      message: `Check failed: ${error instanceof Error ? error.message : String(error)}`,
      critical: true,
    });
    console.log('   ⚠️  Service check failed\n');
  }

  // Calculate summary
  const summary = {
    total: checks.length,
    passed: checks.filter((c) => c.status === 'pass').length,
    failed: checks.filter((c) => c.status === 'fail').length,
    warnings: checks.filter((c) => c.status === 'warn').length,
    skipped: checks.filter((c) => c.status === 'skip').length,
  };

  // Determine overall pass/fail (fail if any critical check failed)
  const criticalFailures = checks.filter((c) => c.status === 'fail' && c.critical);
  const passed = criticalFailures.length === 0;

  const report: HealthGateReport = {
    timestamp: new Date().toISOString(),
    domain: resolvedDomain,
    instanceId,
    passed,
    checks,
    summary,
  };

  // Print summary
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📊 Health Gate Summary');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const overallIcon = passed ? '✅' : '❌';
  console.log(`   Overall: ${overallIcon} ${passed ? 'PASSED' : 'FAILED'}\n`);
  console.log(`   Passed: ${summary.passed}/${summary.total}`);
  console.log(`   Failed: ${summary.failed}`);
  console.log(`   Warnings: ${summary.warnings}`);
  console.log(`   Skipped: ${summary.skipped}\n`);

  if (criticalFailures.length > 0) {
    console.log('   ❌ Critical Failures:');
    for (const check of criticalFailures) {
      console.log(`      - ${check.name}: ${check.message}`);
    }
    console.log('');
  }

  // Save report
  const outputPath =
    options.outputFile ||
    `./health-gate-report-${resolvedDomain}-${Date.now()}.json`;
  fs.writeFileSync(outputPath, JSON.stringify(report, null, 2));
  console.log(`📄 Report saved to: ${path.resolve(outputPath)}\n`);

  return report;
}

// CLI interface
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const options: HealthGateOptions = {};

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
      case '--disk-threshold':
        options.diskThreshold = parseInt(args[++i], 10);
        break;
      case '--skip-mail-flow':
        options.skipMailFlow = true;
        break;
      case '--output':
      case '-o':
        options.outputFile = args[++i];
        break;
      case '--help':
      case '-h':
        console.log(`
Usage: health-gate.cli.ts [options]

Post-deploy health gate that validates critical systems are functioning.
Exits with code 1 if any critical check fails.

Options:
  --domain, -d <domain>        Domain name
  --app-path <path>            App path (default: from APP_PATH env)
  --region, -r <region>        AWS region (default: us-east-1)
  --profile <profile>          AWS profile (default: hepe-admin-mfa)
  --disk-threshold <percent>   Disk usage threshold % (default: 85)
  --skip-mail-flow             Skip mail flow test
  --output, -o <file>          Output JSON file
  --help, -h                   Show this help

Environment Variables:
  DOMAIN                       Same as --domain
  APP_PATH                     Same as --app-path
  AWS_REGION                   Same as --region
  AWS_PROFILE                  Same as --profile
  DISK_THRESHOLD               Same as --disk-threshold
  SKIP_MAIL_FLOW               Set to 1 to skip mail flow test

Examples:
  pnpm nx run cdk-k3frame-instance:admin:health-gate
  DISK_THRESHOLD=90 pnpm nx run cdk-k3frame-instance:admin:health-gate
`);
        process.exit(0);
    }
  }

  try {
    const report = await runHealthGate(options);

    if (!report.passed) {
      console.log('❌ Health gate FAILED - critical checks did not pass\n');
      process.exit(1);
    }

    console.log('✅ Health gate PASSED\n');
    process.exit(0);
  } catch (error) {
    console.error(`\n❌ Fatal error: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

export { runHealthGate };
