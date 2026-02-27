#!/usr/bin/env ts-node

/**
 * Availability Report
 * 
 * Generates a comprehensive availability report for the Mail-in-a-Box instance:
 * - EC2 instance status
 * - Service health (nginx, dovecot, postfix, etc.)
 * - Web server accessibility
 * - Mail server accessibility
 * - DNS resolution
 * - SSL certificate status
 */

import { resolveStackName, resolveDomain, getStackInfo } from '@mm/admin-stack-info';
import {
  SSMClient,
  SendCommandCommand,
  GetCommandInvocationCommand,
  type GetCommandInvocationCommandOutput,
} from '@aws-sdk/client-ssm';
import { EC2Client, DescribeInstancesCommand } from '@aws-sdk/client-ec2';
import { fromIni } from '@aws-sdk/credential-providers';
import * as https from 'node:https';
import * as http from 'node:http';
import * as fs from 'node:fs';
import * as path from 'node:path';

interface AvailabilityReportOptions {
  domain?: string;
  appPath?: string;
  region?: string;
  profile?: string;
  outputFile?: string;
}

interface ServiceStatus {
  name: string;
  status: 'running' | 'stopped' | 'failed' | 'unknown';
  details?: string;
}

interface HealthCheck {
  name: string;
  status: 'healthy' | 'unhealthy' | 'unknown';
  details?: string;
  responseTime?: number;
}

interface DiskUsage {
  total: string;
  used: string;
  available: string;
  percentUsed: number;
  status: 'ok' | 'warning' | 'critical';
}

/**
 * Check TCP port connectivity
 */
async function checkTcpPort(host: string, port: number, timeout: number = 10000): Promise<{ success: boolean; responseTime: number; error?: string }> {
  const net = await import('node:net');
  return new Promise((resolve) => {
    const startTime = Date.now();
    const socket = new net.Socket();

    socket.setTimeout(timeout);

    socket.on('connect', () => {
      const responseTime = Date.now() - startTime;
      socket.destroy();
      resolve({
        success: true,
        responseTime,
      });
    });

    socket.on('timeout', () => {
      socket.destroy();
      const responseTime = Date.now() - startTime;
      resolve({
        success: false,
        responseTime,
        error: 'Connection timeout',
      });
    });

    socket.on('error', (error) => {
      const responseTime = Date.now() - startTime;
      socket.destroy();
      resolve({
        success: false,
        responseTime,
        error: error.message,
      });
    });

    socket.connect(port, host);
  });
}

async function checkHttpEndpoint(url: string, timeout: number = 10000): Promise<{ success: boolean; statusCode?: number; responseTime: number; error?: string }> {
  return new Promise((resolve) => {
    const startTime = Date.now();
    const urlObj = new URL(url);
    const client = urlObj.protocol === 'https:' ? https : http;
    
    const req = client.get(url, {
      timeout,
      rejectUnauthorized: false, // Allow self-signed certs for internal checks
    }, (res) => {
      const responseTime = Date.now() - startTime;
      resolve({
        success: res.statusCode !== undefined && res.statusCode < 500,
        statusCode: res.statusCode,
        responseTime,
      });
      res.destroy();
    });

    req.on('error', (error) => {
      const responseTime = Date.now() - startTime;
      resolve({
        success: false,
        responseTime,
        error: error.message,
      });
    });

    req.on('timeout', () => {
      req.destroy();
      const responseTime = Date.now() - startTime;
      resolve({
        success: false,
        responseTime,
        error: 'Request timeout',
      });
    });
  });
}

async function generateAvailabilityReport(options: AvailabilityReportOptions): Promise<void> {
  const region = options.region || process.env.AWS_REGION || 'us-east-1';
  const profile = options.profile || process.env.AWS_PROFILE || 'hepe-admin-mfa';
  const domain = options.domain || process.env.DOMAIN;
  const appPath = options.appPath || process.env.APP_PATH;
  const outputFile = options.outputFile || process.env.OUTPUT_FILE;

  if (!domain && !appPath) {
    throw new Error('Cannot resolve domain. Provide domain or appPath');
  }

  const resolvedDomain = domain || (appPath ? resolveDomain(appPath) : null);
  if (!resolvedDomain) {
    throw new Error('Cannot resolve domain. Provide domain or appPath');
  }

  console.log('📊 Generating Availability Report');
  console.log(`   Domain: ${resolvedDomain}`);
  console.log(`   Region: ${region}`);
  console.log(`   Profile: ${profile}\n`);

  // Get instance info
  const instanceStackName = resolveStackName(resolvedDomain, appPath, undefined, 'instance');
  const stackInfo = await getStackInfo({
    stackName: instanceStackName,
    region,
    profile,
  });

  const instanceId = stackInfo.instanceId;
  const instanceIp = stackInfo.instancePublicIp;
  const hostname = `box.${resolvedDomain}`;

  if (!instanceId) {
    throw new Error(`Could not determine instance ID from stack ${instanceStackName}`);
  }

  if (!instanceIp) {
    throw new Error(`Could not determine instance IP from stack ${instanceStackName}`);
  }

  const credentials = fromIni({ profile });
  const ssmClient = new SSMClient({ region, credentials });
  const ec2Client = new EC2Client({ region, credentials });

  const report: {
    timestamp: string;
    domain: string;
    instanceId: string;
    instanceIp: string;
    hostname: string;
    ec2Status?: string;
    services: ServiceStatus[];
    healthChecks: HealthCheck[];
    diskUsage?: DiskUsage;
    summary: {
      overall: 'online' | 'degraded' | 'offline';
      servicesRunning: number;
      servicesTotal: number;
      healthChecksPassing: number;
      healthChecksTotal: number;
      diskStatus?: 'ok' | 'warning' | 'critical';
    };
  } = {
    timestamp: new Date().toISOString(),
    domain: resolvedDomain,
    instanceId,
    instanceIp,
    hostname,
    services: [],
    healthChecks: [],
    summary: {
      overall: 'offline',
      servicesRunning: 0,
      servicesTotal: 0,
      healthChecksPassing: 0,
      healthChecksTotal: 0,
    },
  };

  // Step 1: Check EC2 instance status
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📋 Step 1: Checking EC2 Instance Status');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  try {
    const ec2Result = await ec2Client.send(
      new DescribeInstancesCommand({
        InstanceIds: [instanceId],
      })
    );

    const instance = ec2Result.Reservations?.[0]?.Instances?.[0];
    if (instance) {
      const state = instance.State?.Name;
      report.ec2Status = state;
      console.log(`   Instance ID: ${instanceId}`);
      console.log(`   State: ${state}`);
      console.log(`   Public IP: ${instanceIp}`);
      console.log(`   Instance Type: ${instance.InstanceType}`);
      console.log(`   Launch Time: ${instance.LaunchTime?.toISOString()}\n`);

      if (state !== 'running') {
        report.summary.overall = 'offline';
        console.log(`   ⚠️  Instance is not running (state: ${state})\n`);
      }
    }
  } catch (error) {
    console.log(`   ❌ Failed to check EC2 status: ${error instanceof Error ? error.message : String(error)}\n`);
    report.ec2Status = 'unknown';
  }

  // Step 2: Check service statuses
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📋 Step 2: Checking Service Statuses');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const servicesToCheck = [
    'nginx',
    'dovecot',
    'postfix',
    'php8.0-fpm',
    'nsd',
    'fail2ban',
  ];

  // Build service check command - check each service individually
  const serviceChecks = servicesToCheck.map(service => 
    `if systemctl list-unit-files | grep -q "^${service}"; then status=$(systemctl is-active ${service} 2>&1); echo "${service}:$status"; else echo "${service}:not-found"; fi`
  ).join('; ');
  
  const serviceStatusCommand = serviceChecks;

  try {
    const serviceResult = await ssmClient.send(
      new SendCommandCommand({
        InstanceIds: [instanceId],
        DocumentName: 'AWS-RunShellScript',
        Parameters: {
          commands: [serviceStatusCommand],
        },
      })
    );

    const serviceCommandId = serviceResult.Command?.CommandId;
    if (serviceCommandId) {
      // Wait and retry if still in progress
      let serviceInvocation: GetCommandInvocationCommandOutput | undefined;
      let retries = 0;
      const maxRetries = 5;
      
      while (retries < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        serviceInvocation = await ssmClient.send(
          new GetCommandInvocationCommand({
            CommandId: serviceCommandId,
            InstanceId: instanceId,
          })
        );

        if (serviceInvocation.Status === 'Success' || serviceInvocation.Status === 'Failed') {
          break;
        }
        retries++;
      }

      if (serviceInvocation && (serviceInvocation.Status === 'Success' || serviceInvocation.Status === 'Failed')) {
        const output = serviceInvocation.StandardOutputContent || serviceInvocation.StandardErrorContent || '';
        const lines = output.split('\n').filter(l => l.trim());

        if (lines.length === 0) {
          console.log('   ⚠️  No service status output received\n');
        } else {
          for (const line of lines) {
            const [name, ...statusParts] = line.split(':');
            const status = statusParts.join(':').trim();
            if (name && status) {
              let serviceStatus: ServiceStatus['status'] = 'unknown';
              if (status === 'active') {
                serviceStatus = 'running';
              } else if (status === 'inactive' || status === 'failed') {
                serviceStatus = status === 'failed' ? 'failed' : 'stopped';
              } else if (status === 'not-found') {
                serviceStatus = 'unknown';
              }

              report.services.push({
                name: name.trim(),
                status: serviceStatus,
                details: status,
              });

              const statusIcon = serviceStatus === 'running' ? '✅' : serviceStatus === 'stopped' ? '⚠️' : '❌';
              console.log(`   ${statusIcon} ${name.trim()}: ${status}`);
            }
          }
          console.log('');
        }
      } else {
        const errorDetails =
          serviceInvocation?.StandardErrorContent ||
          serviceInvocation?.StatusDetails ||
          'Unknown error';
        console.log(`   ⚠️  Service check failed: ${errorDetails}\n`);
      }
    }
  } catch (error) {
    console.log(`   ❌ Failed to check services: ${error instanceof Error ? error.message : String(error)}\n`);
  }

  // Step 3: Health checks
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📋 Step 3: Performing Health Checks');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  // Check web server (HTTP)
  console.log('   Checking HTTP endpoint...');
  const httpResult = await checkHttpEndpoint(`http://${instanceIp}`, 10000);
  const httpHealth: HealthCheck = {
    name: 'HTTP Web Server',
    status: httpResult.success ? 'healthy' : 'unhealthy',
    responseTime: httpResult.responseTime,
    details: httpResult.success
      ? `HTTP ${httpResult.statusCode} (${httpResult.responseTime}ms)`
      : httpResult.error || 'Connection failed',
  };
  report.healthChecks.push(httpHealth);
  console.log(`   ${httpHealth.status === 'healthy' ? '✅' : '❌'} ${httpHealth.name}: ${httpHealth.details}\n`);

  // Check HTTPS web server
  console.log('   Checking HTTPS endpoint...');
  const httpsResult = await checkHttpEndpoint(`https://${instanceIp}`, 10000);
  const httpsHealth: HealthCheck = {
    name: 'HTTPS Web Server',
    status: httpsResult.success ? 'healthy' : 'unhealthy',
    responseTime: httpsResult.responseTime,
    details: httpsResult.success
      ? `HTTPS ${httpsResult.statusCode} (${httpsResult.responseTime}ms)`
      : httpsResult.error || 'Connection failed',
  };
  report.healthChecks.push(httpsHealth);
  console.log(`   ${httpsHealth.status === 'healthy' ? '✅' : '❌'} ${httpsHealth.name}: ${httpsHealth.details}\n`);

  // Check webmail endpoint
  console.log('   Checking webmail endpoint...');
  const webmailResult = await checkHttpEndpoint(`https://${instanceIp}/mail/`, 10000);
  const webmailHealth: HealthCheck = {
    name: 'Webmail (Roundcube)',
    status: webmailResult.success ? 'healthy' : 'unhealthy',
    responseTime: webmailResult.responseTime,
    details: webmailResult.success
      ? `HTTP ${webmailResult.statusCode} (${webmailResult.responseTime}ms)`
      : webmailResult.error || 'Connection failed',
  };
  report.healthChecks.push(webmailHealth);
  console.log(`   ${webmailHealth.status === 'healthy' ? '✅' : '❌'} ${webmailHealth.name}: ${webmailHealth.details}\n`);

  // Check admin panel
  console.log('   Checking admin panel...');
  const adminResult = await checkHttpEndpoint(`https://${instanceIp}/admin/`, 10000);
  const adminHealth: HealthCheck = {
    name: 'Admin Panel',
    status: adminResult.success ? 'healthy' : 'unhealthy',
    responseTime: adminResult.responseTime,
    details: adminResult.success
      ? `HTTP ${adminResult.statusCode} (${adminResult.responseTime}ms)`
      : adminResult.error || 'Connection failed',
  };
  report.healthChecks.push(adminHealth);
  console.log(`   ${adminHealth.status === 'healthy' ? '✅' : '❌'} ${adminHealth.name}: ${adminHealth.details}\n`);

  // Check DNS resolution (if hostname is set)
  if (hostname) {
    console.log('   Checking DNS resolution...');
    try {
      const dns = await import('node:dns/promises');
      const dnsStartTime = Date.now();
      const addresses = await dns.resolve4(hostname);
      const dnsResponseTime = Date.now() - dnsStartTime;
      const dnsHealth: HealthCheck = {
        name: 'DNS Resolution',
        status: addresses.length > 0 ? 'healthy' : 'unhealthy',
        responseTime: dnsResponseTime,
        details: addresses.length > 0
          ? `Resolved to ${addresses.join(', ')} (${dnsResponseTime}ms)`
          : 'No addresses found',
      };
      report.healthChecks.push(dnsHealth);
      console.log(`   ${dnsHealth.status === 'healthy' ? '✅' : '❌'} ${dnsHealth.name}: ${dnsHealth.details}\n`);
    } catch (error) {
      const dnsHealth: HealthCheck = {
        name: 'DNS Resolution',
        status: 'unhealthy',
        details: error instanceof Error ? error.message : String(error),
      };
      report.healthChecks.push(dnsHealth);
      console.log(`   ❌ ${dnsHealth.name}: ${dnsHealth.details}\n`);
    }
  }

  // Check IMAPS (port 993)
  console.log('   Checking IMAPS (port 993)...');
  const imapsResult = await checkTcpPort(instanceIp, 993, 10000);
  const imapsHealth: HealthCheck = {
    name: 'IMAPS (993)',
    status: imapsResult.success ? 'healthy' : 'unhealthy',
    responseTime: imapsResult.responseTime,
    details: imapsResult.success
      ? `Connected (${imapsResult.responseTime}ms)`
      : imapsResult.error || 'Connection failed',
  };
  report.healthChecks.push(imapsHealth);
  console.log(`   ${imapsHealth.status === 'healthy' ? '✅' : '❌'} ${imapsHealth.name}: ${imapsHealth.details}\n`);

  // Check SMTP Submission (port 587)
  console.log('   Checking SMTP Submission (port 587)...');
  const smtpResult = await checkTcpPort(instanceIp, 587, 10000);
  const smtpHealth: HealthCheck = {
    name: 'SMTP Submission (587)',
    status: smtpResult.success ? 'healthy' : 'unhealthy',
    responseTime: smtpResult.responseTime,
    details: smtpResult.success
      ? `Connected (${smtpResult.responseTime}ms)`
      : smtpResult.error || 'Connection failed',
  };
  report.healthChecks.push(smtpHealth);
  console.log(`   ${smtpHealth.status === 'healthy' ? '✅' : '❌'} ${smtpHealth.name}: ${smtpHealth.details}\n`);

  // Step 4: Check disk usage
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📋 Step 4: Checking Disk Usage');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  try {
    const diskCommand = "df -h / | tail -1 | awk '{print $2,$3,$4,$5}'";
    const diskResult = await ssmClient.send(
      new SendCommandCommand({
        InstanceIds: [instanceId],
        DocumentName: 'AWS-RunShellScript',
        Parameters: {
          commands: [diskCommand],
        },
      })
    );

    const diskCommandId = diskResult.Command?.CommandId;
    if (diskCommandId) {
      let diskInvocation: GetCommandInvocationCommandOutput | undefined;
      let retries = 0;
      const maxRetries = 5;

      while (retries < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, 2000));

        diskInvocation = await ssmClient.send(
          new GetCommandInvocationCommand({
            CommandId: diskCommandId,
            InstanceId: instanceId,
          })
        );

        if (diskInvocation.Status === 'Success' || diskInvocation.Status === 'Failed') {
          break;
        }
        retries++;
      }

      if (diskInvocation && diskInvocation.Status === 'Success') {
        const output = diskInvocation.StandardOutputContent || '';
        const parts = output.trim().split(/\s+/);
        const percentStr = parts[3] || '0%';
        const percentUsed = parseInt(percentStr.replace('%', ''), 10) || 0;

        // Disk status thresholds: warning at 80%, critical at 90%
        let diskStatus: 'ok' | 'warning' | 'critical' = 'ok';
        if (percentUsed >= 90) {
          diskStatus = 'critical';
        } else if (percentUsed >= 80) {
          diskStatus = 'warning';
        }

        report.diskUsage = {
          total: parts[0] || 'unknown',
          used: parts[1] || 'unknown',
          available: parts[2] || 'unknown',
          percentUsed,
          status: diskStatus,
        };
        report.summary.diskStatus = diskStatus;

        const diskIcon = diskStatus === 'ok' ? '✅' : diskStatus === 'warning' ? '⚠️' : '❌';
        console.log(`   ${diskIcon} Disk Usage: ${percentUsed}% (${parts[1] || '?'} of ${parts[0] || '?'})`);
        console.log(`   Available: ${parts[2] || 'unknown'}`);
        if (diskStatus === 'critical') {
          console.log(`   ❌ CRITICAL: Disk usage above 90% threshold!`);
        } else if (diskStatus === 'warning') {
          console.log(`   ⚠️  WARNING: Disk usage above 80% threshold`);
        }
        console.log('');
      } else {
        console.log(`   ⚠️  Could not determine disk usage\n`);
      }
    }
  } catch (error) {
    console.log(`   ❌ Failed to check disk usage: ${error instanceof Error ? error.message : String(error)}\n`);
  }

  // Calculate summary
  report.summary.servicesTotal = report.services.length;
  report.summary.servicesRunning = report.services.filter(s => s.status === 'running').length;
  report.summary.healthChecksTotal = report.healthChecks.length;
  report.summary.healthChecksPassing = report.healthChecks.filter(h => h.status === 'healthy').length;

  if (report.ec2Status !== 'running') {
    report.summary.overall = 'offline';
  } else if (
    report.summary.servicesRunning === report.summary.servicesTotal &&
    report.summary.healthChecksPassing === report.summary.healthChecksTotal &&
    report.summary.diskStatus !== 'critical'
  ) {
    // Degrade to 'degraded' if disk is warning level
    report.summary.overall = report.summary.diskStatus === 'warning' ? 'degraded' : 'online';
  } else if (
    report.summary.servicesRunning > 0 &&
    report.summary.healthChecksPassing > 0
  ) {
    report.summary.overall = 'degraded';
  } else {
    report.summary.overall = 'offline';
  }

  // Print summary
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📊 Availability Report Summary');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const overallIcon =
    report.summary.overall === 'online' ? '✅' : report.summary.overall === 'degraded' ? '⚠️' : '❌';
  console.log(`   Overall Status: ${overallIcon} ${report.summary.overall.toUpperCase()}\n`);

  console.log(`   Services: ${report.summary.servicesRunning}/${report.summary.servicesTotal} running`);
  console.log(`   Health Checks: ${report.summary.healthChecksPassing}/${report.summary.healthChecksTotal} passing`);
  if (report.diskUsage) {
    const diskIcon = report.diskUsage.status === 'ok' ? '✅' : report.diskUsage.status === 'warning' ? '⚠️' : '❌';
    console.log(`   Disk: ${diskIcon} ${report.diskUsage.percentUsed}% used (${report.diskUsage.available} free)`);
  }
  console.log('');

  if (report.summary.servicesRunning < report.summary.servicesTotal) {
    const stoppedServices = report.services.filter(s => s.status !== 'running');
    console.log('   ⚠️  Stopped/Failed Services:');
    for (const service of stoppedServices) {
      console.log(`      - ${service.name}: ${service.status}`);
    }
    console.log('');
  }

  if (report.summary.healthChecksPassing < report.summary.healthChecksTotal) {
    const failedChecks = report.healthChecks.filter(h => h.status !== 'healthy');
    console.log('   ⚠️  Failed Health Checks:');
    for (const check of failedChecks) {
      console.log(`      - ${check.name}: ${check.details}`);
    }
    console.log('');
  }

  // Save report to file if requested
  if (outputFile) {
    const reportJson = JSON.stringify(report, null, 2);
    fs.writeFileSync(outputFile, reportJson, 'utf8');
    console.log(`📄 Report saved to: ${path.resolve(outputFile)}\n`);
  } else {
    // Save to default location
    const defaultOutputFile = `./availability-report-${resolvedDomain}-${Date.now()}.json`;
    const reportJson = JSON.stringify(report, null, 2);
    fs.writeFileSync(defaultOutputFile, reportJson, 'utf8');
    console.log(`📄 Report saved to: ${path.resolve(defaultOutputFile)}\n`);
  }

  // Disk usage warnings
  if (report.diskUsage && report.diskUsage.status !== 'ok') {
    console.log('   ⚠️  Disk Usage Warning:');
    console.log(`      - Current usage: ${report.diskUsage.percentUsed}% (${report.diskUsage.available} available)`);
    if (report.diskUsage.status === 'critical') {
      console.log('      - CRITICAL: Run admin:cleanup:disk-space immediately');
      console.log('      - Consider expanding EBS volume if cleanup is insufficient');
    } else {
      console.log('      - Run admin:cleanup:disk-space to free space');
    }
    console.log('');
  }

  // Recommendations
  console.log('💡 Recommendations:');
  if (report.summary.overall === 'offline') {
    console.log('   - Check EC2 instance status in AWS Console');
    console.log('   - Verify instance security groups allow HTTP/HTTPS traffic');
    console.log('   - Check CloudWatch logs for errors');
  } else if (report.summary.overall === 'degraded') {
    console.log('   - Restart failed services');
    console.log('   - Check service logs for errors');
    console.log('   - Verify network connectivity');
    if (report.diskUsage && report.diskUsage.status !== 'ok') {
      console.log('   - Address disk space issues: pnpm nx run cdk-emcnotary-observability-maintenance:admin:cleanup:disk-space');
    }
  } else {
    console.log('   - Instance is healthy and online');
    console.log('   - Monitor CloudWatch alarms');
    console.log('   - Review logs periodically');
  }
  console.log('');
}

// CLI interface
if (require.main === module) {
  const args = process.argv.slice(2);

  const options: AvailabilityReportOptions = {};

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
      case '--output':
      case '-o':
        options.outputFile = args[++i];
        break;
      case '--help':
      case '-h':
        console.log(`
Usage: availability-report.cli.ts [options]

Generates a comprehensive availability report for the Mail-in-a-Box instance.

Options:
  --domain, -d <domain>        Domain name (default: from APP_PATH or DOMAIN env)
  --app-path <path>           App path (default: from APP_PATH env)
  --region, -r <region>        AWS region (default: us-east-1)
  --profile <profile>         AWS profile (default: hepe-admin-mfa)
  --output, -o <file>          Output JSON file (default: ./availability-report-{domain}-{timestamp}.json)
  --help, -h                   Show this help

Examples:
  # Generate report
  pnpm exec tsx tools/availability-report.cli.ts

  # Save to specific file
  pnpm exec tsx tools/availability-report.cli.ts --output ./report.json
`);
        process.exit(0);
        break;
    }
  }

  generateAvailabilityReport(options).catch((error) => {
    console.error(`Fatal error: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  });
}

export { generateAvailabilityReport };
