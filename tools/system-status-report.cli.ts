#!/usr/bin/env ts-node

/**
 * Comprehensive System Status Report
 * 
 * Checks:
 * - Bootstrap status (MIAB installed and configured)
 * - MIAB services running
 * - DNS records (A, CNAME, MX, TXT)
 * - SSL certificate status
 * - User accounts
 * - Mailbox existence
 * - DNS service status
 */

import { getStackInfoFromApp } from '@mm/admin-stack-info';
import { getSshKeyPath } from '@mm/admin-ssh';
import { SSMClient, GetParameterCommand } from '@aws-sdk/client-ssm';
import { EC2Client, DescribeInstancesCommand } from '@aws-sdk/client-ec2';
import { fromIni } from '@aws-sdk/credential-providers';
import { spawn } from 'child_process';
import * as https from 'https';
import * as fs from 'fs';
import * as path from 'path';

interface StatusOptions {
  domain?: string;
  appPath?: string;
  region?: string;
  profile?: string;
  outputFile?: string;
}

interface StatusReport {
  timestamp: string;
  instance: {
    id?: string;
    ip?: string;
    state?: string;
    hostname?: string;
  };
  bootstrap: {
    status: 'complete' | 'incomplete' | 'unknown';
    adminPasswordParam?: string;
    adminPasswordExists: boolean;
    bootstrapFileExists: boolean;
  };
  services: {
    postfix: boolean;
    dovecot: boolean;
    nginx: boolean;
    named: boolean;
    miab: boolean;
  };
  ssl: {
    provisioned: boolean;
    valid: boolean;
    issuer?: string;
    validTo?: string;
    daysUntilExpiry?: number;
  };
  dns: {
    records: Array<{
      name: string;
      type: string;
      value: string;
    }>;
    aRecord?: string;
    cnameRecords: string[];
    mxRecords: string[];
    txtRecords: string[];
  };
  users: {
    count: number;
    list: Array<{
      email: string;
      hasMailbox: boolean;
    }>;
  };
  summary: {
    allChecksPassed: boolean;
    criticalIssues: string[];
    warnings: string[];
  };
}

/**
 * Execute SSH command
 */
async function sshCommand(
  keyPath: string,
  host: string,
  command: string
): Promise<{ success: boolean; output: string; error?: string }> {
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

    let output = '';
    let error = '';

    const ssh = spawn('ssh', sshArgs);

    ssh.stdout.on('data', (data) => {
      output += data.toString();
    });

    ssh.stderr.on('data', (data) => {
      error += data.toString();
    });

    ssh.on('close', (code) => {
      resolve({
        success: code === 0,
        output: output.trim(),
        error: error.trim(),
      });
    });

    ssh.on('error', (err) => {
      resolve({
        success: false,
        output: '',
        error: err.message,
      });
    });
  });
}

/**
 * Check SSL certificate
 */
async function checkSslCertificate(host: string): Promise<{
  valid: boolean;
  issuer?: string;
  validTo?: string;
  daysUntilExpiry?: number;
}> {
  return new Promise((resolve) => {
    const options = {
      hostname: host,
      port: 443,
      method: 'GET',
      rejectUnauthorized: false,
    };

    const req = https.request(options, (res) => {
      const cert = res.socket.getPeerCertificate();
      if (cert && cert.valid_to) {
        const validTo = new Date(cert.valid_to);
        const daysUntilExpiry = Math.floor(
          (validTo.getTime() - Date.now()) / (1000 * 60 * 60 * 24)
        );
        resolve({
          valid: daysUntilExpiry > 0,
          issuer: cert.issuer?.CN,
          validTo: cert.valid_to,
          daysUntilExpiry,
        });
      } else {
        resolve({ valid: false });
      }
    });

    req.on('error', () => {
      resolve({ valid: false });
    });

    req.setTimeout(5000, () => {
      req.destroy();
      resolve({ valid: false });
    });

    req.end();
  });
}

async function generateStatusReport(options: StatusOptions): Promise<StatusReport> {
  const region = options.region || process.env.AWS_REGION || 'us-east-1';
  const profile = options.profile || process.env.AWS_PROFILE || 'hepe-admin-mfa';
  const appPath = options.appPath || process.env.APP_PATH || 'apps/cdk-emc-notary/instance';
  const domain = options.domain || process.env.DOMAIN;

  if (!domain && !appPath) {
    throw new Error('Cannot resolve domain. Provide domain or appPath');
  }

  console.log('📊 Generating System Status Report\n');
  console.log(`   Domain: ${domain || '(will be resolved)'}`);
  console.log(`   App Path: ${appPath}`);
  console.log(`   Region: ${region}`);
  console.log(`   Profile: ${profile}\n`);

  const credentials = fromIni({ profile });
  const ssm = new SSMClient({ region, credentials });
  const ec2 = new EC2Client({ region, credentials });

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

  // Check instance state
  const instResp = await ec2.send(
    new DescribeInstancesCommand({ InstanceIds: [instanceId] })
  );
  const instance = instResp.Reservations?.[0]?.Instances?.[0];
  const instanceState = instance?.State?.Name || 'unknown';

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

  // Check bootstrap status
  console.log('🔍 Step 3: Checking bootstrap status...');
  const adminPasswordParam = `/MailInABoxAdminPassword-${stackInfo.stackName}`;
  let adminPasswordExists = false;
  try {
    await ssm.send(
      new GetParameterCommand({
        Name: adminPasswordParam,
        WithDecryption: false,
      })
    );
    adminPasswordExists = true;
  } catch {
    adminPasswordExists = false;
  }

  const bootstrapFileCheck = await sshCommand(
    keyPath,
    instanceIp,
    'test -f /home/user-data/.bootstrap_complete && echo "exists" || echo "missing"'
  );
  const bootstrapFileExists = bootstrapFileCheck.output === 'exists';

  const bootstrapStatus: 'complete' | 'incomplete' | 'unknown' =
    adminPasswordExists && bootstrapFileExists ? 'complete' :
    adminPasswordExists || bootstrapFileExists ? 'incomplete' : 'unknown';

  console.log(`   Admin Password Param: ${adminPasswordExists ? '✅' : '❌'}`);
  console.log(`   Bootstrap File: ${bootstrapFileExists ? '✅' : '❌'}`);
  console.log(`   Status: ${bootstrapStatus}\n`);

  // Check services
  console.log('🔍 Step 4: Checking services...');
  const postfixCheck = await sshCommand(
    keyPath,
    instanceIp,
    'systemctl is-active postfix && echo "ACTIVE" || echo "INACTIVE"'
  );
  const dovecotCheck = await sshCommand(
    keyPath,
    instanceIp,
    'systemctl is-active dovecot && echo "ACTIVE" || echo "INACTIVE"'
  );
  const nginxCheck = await sshCommand(
    keyPath,
    instanceIp,
    'systemctl is-active nginx && echo "ACTIVE" || echo "INACTIVE"'
  );
  const namedCheck = await sshCommand(
    keyPath,
    instanceIp,
    'systemctl is-active named && echo "ACTIVE" || echo "INACTIVE"'
  );
  const miabCheck = await sshCommand(
    keyPath,
    instanceIp,
    'test -d /opt/mailinabox && echo "EXISTS" || echo "NOT_FOUND"'
  );

  const services = {
    postfix: postfixCheck.output === 'ACTIVE',
    dovecot: dovecotCheck.output === 'ACTIVE',
    nginx: nginxCheck.output === 'ACTIVE',
    named: namedCheck.output === 'ACTIVE',
    miab: miabCheck.output === 'EXISTS',
  };

  console.log(`   Postfix: ${services.postfix ? '✅' : '❌'}`);
  console.log(`   Dovecot: ${services.dovecot ? '✅' : '❌'}`);
  console.log(`   Nginx: ${services.nginx ? '✅' : '❌'}`);
  console.log(`   Named (DNS): ${services.named ? '✅' : '❌'}`);
  console.log(`   MIAB Installed: ${services.miab ? '✅' : '❌'}\n`);

  // Check SSL
  console.log('🔍 Step 5: Checking SSL certificate...');
  const sslCheck = await sshCommand(
    keyPath,
    instanceIp,
    '[ -f /home/user-data/ssl/ssl_certificate.pem ] && echo "exists" || echo "missing"'
  );
  const sslProvisioned = sslCheck.output === 'exists';

  let sslValid = false;
  let sslDetails: { issuer?: string; validTo?: string; daysUntilExpiry?: number } = {};
  if (sslProvisioned) {
    const certCheck = await checkSslCertificate(hostname);
    sslValid = certCheck.valid;
    sslDetails = certCheck;
  }

  console.log(`   SSL Provisioned: ${sslProvisioned ? '✅' : '❌'}`);
  if (sslProvisioned) {
    console.log(`   SSL Valid: ${sslValid ? '✅' : '❌'}`);
    if (sslDetails.issuer) {
      console.log(`   Issuer: ${sslDetails.issuer}`);
    }
    if (sslDetails.daysUntilExpiry !== undefined) {
      console.log(`   Days Until Expiry: ${sslDetails.daysUntilExpiry}`);
    }
  }
  console.log('');

  // Check DNS records
  console.log('🔍 Step 6: Checking DNS records...');
  const dnsListCheck = await sshCommand(
    keyPath,
    instanceIp,
    `sudo -u mailinabox /opt/mailinabox/management/dns.py list ${resolvedDomain} 2>/dev/null || echo "ERROR"`
  );

  const dnsRecords: Array<{ name: string; type: string; value: string }> = [];
  let aRecord: string | undefined;
  const cnameRecords: string[] = [];
  const mxRecords: string[] = [];
  const txtRecords: string[] = [];

  if (dnsListCheck.success && dnsListCheck.output !== 'ERROR') {
    const lines = dnsListCheck.output.split('\n').filter(l => l.trim());
    for (const line of lines) {
      const parts = line.trim().split(/\s+/);
      if (parts.length >= 3) {
        const name = parts[0];
        const type = parts[1];
        const value = parts.slice(2).join(' ');
        
        dnsRecords.push({ name, type, value });
        
        if (type === 'A' && name === resolvedDomain) {
          aRecord = value;
        } else if (type === 'CNAME') {
          cnameRecords.push(`${name} -> ${value}`);
        } else if (type === 'MX') {
          mxRecords.push(`${name} -> ${value}`);
        } else if (type === 'TXT') {
          txtRecords.push(`${name} -> ${value}`);
        }
      }
    }
  }

  console.log(`   Total DNS Records: ${dnsRecords.length}`);
  console.log(`   A Record: ${aRecord ? `✅ ${aRecord}` : '❌'}`);
  console.log(`   CNAME Records: ${cnameRecords.length > 0 ? `✅ ${cnameRecords.length} found` : '❌'}`);
  console.log(`   MX Records: ${mxRecords.length > 0 ? `✅ ${mxRecords.length} found` : '❌'}`);
  console.log(`   TXT Records: ${txtRecords.length > 0 ? `✅ ${txtRecords.length} found` : '❌'}\n`);

  // Check users and mailboxes
  console.log('🔍 Step 7: Checking users and mailboxes...');
  const usersListCheck = await sshCommand(
    keyPath,
    instanceIp,
    `sudo -u mailinabox /opt/mailinabox/management/users.py list 2>/dev/null | grep -E '^[a-zA-Z0-9._%+-]+@' || echo "ERROR"`
  );

  const users: Array<{ email: string; hasMailbox: boolean }> = [];
  if (usersListCheck.success && usersListCheck.output !== 'ERROR') {
    const userEmails = usersListCheck.output.split('\n').filter(l => l.trim());
    for (const email of userEmails) {
      const trimmedEmail = email.trim();
      if (trimmedEmail) {
        // Check if mailbox exists
        const mailboxCheck = await sshCommand(
          keyPath,
          instanceIp,
          `test -d /home/user-data/mail/mailboxes/${trimmedEmail} && echo "exists" || echo "missing"`
        );
        users.push({
          email: trimmedEmail,
          hasMailbox: mailboxCheck.output === 'exists',
        });
      }
    }
  }

  console.log(`   Total Users: ${users.length}`);
  users.forEach(user => {
    console.log(`   ${user.email}: ${user.hasMailbox ? '✅ mailbox' : '❌ no mailbox'}`);
  });
  console.log('');

  // Generate summary
  const criticalIssues: string[] = [];
  const warnings: string[] = [];

  if (bootstrapStatus !== 'complete') {
    criticalIssues.push('Bootstrap not complete');
  }
  if (!services.postfix) {
    criticalIssues.push('Postfix service not running');
  }
  if (!services.dovecot) {
    criticalIssues.push('Dovecot service not running');
  }
  if (!services.nginx) {
    warnings.push('Nginx service not running');
  }
  if (!services.named) {
    warnings.push('DNS service (named) not running');
  }
  if (!sslProvisioned) {
    warnings.push('SSL certificate not provisioned');
  } else if (!sslValid) {
    warnings.push('SSL certificate invalid or expired');
  }
  if (!aRecord) {
    criticalIssues.push('A record not found');
  }
  if (cnameRecords.length === 0) {
    warnings.push('No CNAME records found');
  }
  if (users.length === 0) {
    warnings.push('No users found');
  }
  users.forEach(user => {
    if (!user.hasMailbox) {
      warnings.push(`User ${user.email} has no mailbox`);
    }
  });

  const allChecksPassed = criticalIssues.length === 0;

  const report: StatusReport = {
    timestamp: new Date().toISOString(),
    instance: {
      id: instanceId,
      ip: instanceIp,
      state: instanceState,
      hostname,
    },
    bootstrap: {
      status: bootstrapStatus,
      adminPasswordParam,
      adminPasswordExists,
      bootstrapFileExists,
    },
    services,
    ssl: {
      provisioned: sslProvisioned,
      valid: sslValid,
      ...sslDetails,
    },
    dns: {
      records: dnsRecords,
      aRecord,
      cnameRecords,
      mxRecords,
      txtRecords,
    },
    users: {
      count: users.length,
      list: users,
    },
    summary: {
      allChecksPassed,
      criticalIssues,
      warnings,
    },
  };

  return report;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const options: StatusOptions = {};

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
      case '--help':
      case '-h':
        console.log(`
Usage: system-status-report.cli.ts [OPTIONS]

Generate comprehensive system status report.

Options:
  --domain DOMAIN          Domain name (e.g., emcnotary.com)
  --app-path PATH          App path (default: apps/cdk-emc-notary/instance)
  --region REGION          AWS region (default: us-east-1)
  --profile PROFILE        AWS profile (default: hepe-admin-mfa)
  --output FILE            Output file path (JSON format)
  --help, -h               Show this help

Environment Variables:
  APP_PATH                 Same as --app-path
  DOMAIN                   Same as --domain
  AWS_REGION               Same as --region
  AWS_PROFILE              Same as --profile
`);
        process.exit(0);
    }
  }

  try {
    const report = await generateStatusReport(options);

    // Print summary
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📊 SYSTEM STATUS SUMMARY\n');
    console.log(`   Instance: ${report.instance.id} (${report.instance.state})`);
    console.log(`   IP: ${report.instance.ip}`);
    console.log(`   Hostname: ${report.instance.hostname}\n`);

    console.log(`   Bootstrap: ${report.bootstrap.status === 'complete' ? '✅ Complete' : '❌ Incomplete'}`);
    console.log(`   Services: ${Object.values(report.services).every(v => v) ? '✅ All Running' : '⚠️  Some Issues'}`);
    console.log(`   SSL: ${report.ssl.provisioned ? (report.ssl.valid ? '✅ Valid' : '⚠️  Invalid') : '❌ Not Provisioned'}`);
    console.log(`   DNS A Record: ${report.dns.aRecord ? `✅ ${report.dns.aRecord}` : '❌ Missing'}`);
    console.log(`   DNS CNAME Records: ${report.dns.cnameRecords.length > 0 ? `✅ ${report.dns.cnameRecords.length}` : '❌ None'}`);
    console.log(`   Users: ${report.users.count} (${report.users.list.filter(u => u.hasMailbox).length} with mailboxes)\n`);

    if (report.summary.criticalIssues.length > 0) {
      console.log('❌ Critical Issues:');
      report.summary.criticalIssues.forEach(issue => {
        console.log(`   - ${issue}`);
      });
      console.log('');
    }

    if (report.summary.warnings.length > 0) {
      console.log('⚠️  Warnings:');
      report.summary.warnings.forEach(warning => {
        console.log(`   - ${warning}`);
      });
      console.log('');
    }

    if (report.summary.allChecksPassed) {
      console.log('✅ All critical checks passed!\n');
    } else {
      console.log('❌ Some critical issues detected. Review above.\n');
    }

    // Save to file if requested
    if (options.outputFile) {
      const outputPath = path.resolve(options.outputFile);
      fs.writeFileSync(outputPath, JSON.stringify(report, null, 2));
      console.log(`📄 Report saved to: ${outputPath}\n`);
    }

    process.exit(report.summary.allChecksPassed ? 0 : 1);
  } catch (error) {
    console.error('\n❌ Error generating status report:');
    console.error(`   ${error instanceof Error ? error.message : String(error)}`);
    if (error instanceof Error && error.stack) {
      console.error(`\n${error.stack}`);
    }
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}


