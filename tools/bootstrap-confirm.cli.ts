#!/usr/bin/env ts-node

import { getStackInfoFromApp } from '@mm/admin-stack-info';
import { getSshKeyPath } from '@mm/admin-ssh';
import { SSMClient, GetParameterCommand } from '@aws-sdk/client-ssm';
import { fromIni } from '@aws-sdk/credential-providers';
import { spawn } from 'child_process';
import * as http from 'http';
import * as https from 'https';

interface ConfirmationOptions {
  domain?: string;
  appPath?: string;
  region?: string;
  profile?: string;
}

interface BootstrapCheck {
  name: string;
  status: 'pass' | 'fail' | 'warning';
  message: string;
  details?: string;
}

/**
 * Execute SSH command and return output
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
 * Check if HTTPS endpoint is accessible
 */
async function checkHttpsEndpoint(
  host: string,
  path: string,
  timeout: number = 5000
): Promise<{ accessible: boolean; statusCode?: number; error?: string }> {
  return new Promise((resolve) => {
    const url = `https://${host}${path}`;
    const req = https.get(url, { timeout, rejectUnauthorized: false }, (res) => {
      resolve({
        accessible: true,
        statusCode: res.statusCode,
      });
      res.destroy();
    });

    req.on('error', (err) => {
      resolve({
        accessible: false,
        error: err.message,
      });
    });

    req.on('timeout', () => {
      req.destroy();
      resolve({
        accessible: false,
        error: 'Request timeout',
      });
    });
  });
}

/**
 * Check if HTTP endpoint is accessible
 */
async function checkHttpEndpoint(
  host: string,
  path: string,
  timeout: number = 5000
): Promise<{ accessible: boolean; statusCode?: number; error?: string }> {
  return new Promise((resolve) => {
    const url = `http://${host}${path}`;
    const req = http.get(url, { timeout }, (res) => {
      resolve({
        accessible: true,
        statusCode: res.statusCode,
      });
      res.destroy();
    });

    req.on('error', (err) => {
      resolve({
        accessible: false,
        error: err.message,
      });
    });

    req.on('timeout', () => {
      req.destroy();
      resolve({
        accessible: false,
        error: 'Request timeout',
      });
    });
  });
}

/**
 * Confirm bootstrap success
 */
async function confirmBootstrap(options: ConfirmationOptions): Promise<void> {
  const region = options.region || process.env.AWS_REGION || 'us-east-1';
  const profile = options.profile || process.env.AWS_PROFILE || 'hepe-admin-mfa';
  const appPath = options.appPath || process.env.APP_PATH || 'apps/cdk-emc-notary/instance';
  const domain = options.domain || process.env.DOMAIN;
  
  if (!domain && !appPath) {
    throw new Error('Cannot resolve domain. Provide domain or appPath');
  }

  console.log('🔍 Bootstrap Confirmation Check');
  console.log(`   Domain: ${domain}`);
  console.log(`   Region: ${region}`);
  console.log(`   Profile: ${profile}\n`);

  const checks: BootstrapCheck[] = [];

  try {
    // Get stack info
    console.log('📋 Step 1: Getting stack information...');
    const stackInfo = await getStackInfoFromApp(appPath, {
      domain,
      region,
      profile,
    });

    if (!stackInfo.instanceId) {
      throw new Error('Instance ID not found in stack outputs');
    }

    if (!stackInfo.instancePublicIp) {
      throw new Error('Instance public IP not found');
    }

    const instanceId = stackInfo.instanceId;
    const instanceIp = stackInfo.instancePublicIp;
    const instanceDns = stackInfo.instanceDns || 'box';
    const hostname = `${instanceDns}.${domain}`;

    console.log(`✅ Found instance: ${instanceId}`);
    console.log(`   IP: ${instanceIp}`);
    console.log(`   Hostname: ${hostname}\n`);

    // Get SSH key
    console.log('📋 Step 2: Getting SSH key...');
    const keyPath = await getSshKeyPath({
      appPath,
      domain,
      region,
      profile,
      ensureSetup: true,
    });

    if (!keyPath) {
      throw new Error(
        'SSH key not found. Run: pnpm nx run cdk-emcnotary-instance:admin:ssh:setup'
      );
    }

    console.log(`✅ SSH key ready: ${keyPath}\n`);

    // Start checks
    console.log('🔍 Step 3: Running bootstrap confirmation checks...\n');

    // Check 1: Mail-in-a-Box directory exists
    console.log('   [1/12] Checking Mail-in-a-Box installation directory...');
    const miabDirCheck = await sshCommand(
      keyPath,
      instanceIp,
      '[ -d /opt/mailinabox ] && echo "exists" || echo "missing"'
    );
    if (miabDirCheck.success && miabDirCheck.output === 'exists') {
      checks.push({
        name: 'MIAB Directory',
        status: 'pass',
        message: '/opt/mailinabox directory exists',
      });
      console.log('      ✅ Pass');
    } else {
      checks.push({
        name: 'MIAB Directory',
        status: 'fail',
        message: '/opt/mailinabox directory not found',
      });
      console.log('      ❌ Fail');
    }

    // Check 2: Setup script exists
    console.log('   [2/12] Checking Mail-in-a-Box setup script...');
    const setupScriptCheck = await sshCommand(
      keyPath,
      instanceIp,
      '[ -f /opt/mailinabox/setup/start.sh ] && echo "exists" || echo "missing"'
    );
    if (setupScriptCheck.success && setupScriptCheck.output === 'exists') {
      checks.push({
        name: 'Setup Script',
        status: 'pass',
        message: 'setup/start.sh exists',
      });
      console.log('      ✅ Pass');
    } else {
      checks.push({
        name: 'Setup Script',
        status: 'fail',
        message: 'setup/start.sh not found',
      });
      console.log('      ❌ Fail');
    }

    // Check 3: Storage directory exists
    console.log('   [3/12] Checking storage directory...');
    const storageCheck = await sshCommand(
      keyPath,
      instanceIp,
      '[ -d /home/user-data ] && echo "exists" || echo "missing"'
    );
    if (storageCheck.success && storageCheck.output === 'exists') {
      checks.push({
        name: 'Storage Directory',
        status: 'pass',
        message: '/home/user-data directory exists',
      });
      console.log('      ✅ Pass');
    } else {
      checks.push({
        name: 'Storage Directory',
        status: 'fail',
        message: '/home/user-data directory not found',
      });
      console.log('      ❌ Fail');
    }

    // Check 4: Key services running
    console.log('   [4/12] Checking Mail-in-a-Box services...');
    const servicesCheck = await sshCommand(
      keyPath,
      instanceIp,
      'systemctl is-active --quiet postfix dovecot nginx 2>/dev/null && echo "running" || echo "stopped"'
    );
    if (servicesCheck.success && servicesCheck.output === 'running') {
      checks.push({
        name: 'Mail Services',
        status: 'pass',
        message: 'postfix, dovecot, nginx are running',
      });
      console.log('      ✅ Pass');
    } else {
      // Check individual services
      const postfixCheck = await sshCommand(
        keyPath,
        instanceIp,
        'systemctl is-active --quiet postfix 2>/dev/null && echo "running" || echo "stopped"'
      );
      const dovecotCheck = await sshCommand(
        keyPath,
        instanceIp,
        'systemctl is-active --quiet dovecot 2>/dev/null && echo "running" || echo "stopped"'
      );
      const nginxCheck = await sshCommand(
        keyPath,
        instanceIp,
        'systemctl is-active --quiet nginx 2>/dev/null && echo "running" || echo "stopped"'
      );

      const runningServices: string[] = [];
      if (postfixCheck.output === 'running') runningServices.push('postfix');
      if (dovecotCheck.output === 'running') runningServices.push('dovecot');
      if (nginxCheck.output === 'running') runningServices.push('nginx');

      if (runningServices.length > 0) {
        checks.push({
          name: 'Mail Services',
          status: 'warning',
          message: `Some services running: ${runningServices.join(', ')}`,
          details: `postfix: ${postfixCheck.output}, dovecot: ${dovecotCheck.output}, nginx: ${nginxCheck.output}`,
        });
        console.log('      ⚠️  Warning');
      } else {
        checks.push({
          name: 'Mail Services',
          status: 'fail',
          message: 'Mail services not running',
          details: `postfix: ${postfixCheck.output}, dovecot: ${dovecotCheck.output}, nginx: ${nginxCheck.output}`,
        });
        console.log('      ❌ Fail');
      }
    }

    // Check 5: Admin password in SSM
    console.log('   [5/12] Checking admin password in SSM...');
    const adminPasswordParam = `/MailInABoxAdminPassword-${stackInfo.stackName}`;
    const ssm = new SSMClient({ region, credentials: fromIni({ profile }) });
    try {
      const passwordResp = await ssm.send(
        new GetParameterCommand({
          Name: adminPasswordParam,
          WithDecryption: true,
        })
      );
      if (passwordResp.Parameter?.Value) {
        checks.push({
          name: 'Admin Password',
          status: 'pass',
          message: `Password stored in SSM: ${adminPasswordParam}`,
        });
        console.log('      ✅ Pass');
      } else {
        checks.push({
          name: 'Admin Password',
          status: 'fail',
          message: 'Password parameter exists but has no value',
        });
        console.log('      ❌ Fail');
      }
    } catch (err) {
      checks.push({
        name: 'Admin Password',
        status: 'fail',
        message: `Password not found in SSM: ${adminPasswordParam}`,
        details: err instanceof Error ? err.message : String(err),
      });
      console.log('      ❌ Fail');
    }

    // Check 6: Web UI accessible (HTTPS)
    console.log('   [6/12] Checking Mail-in-a-Box admin UI (HTTPS)...');
    const httpsCheck = await checkHttpsEndpoint(instanceIp, '/admin', 10000);
    if (httpsCheck.accessible) {
      checks.push({
        name: 'Admin UI (HTTPS)',
        status: 'pass',
        message: `HTTPS admin UI accessible (status: ${httpsCheck.statusCode})`,
      });
      console.log('      ✅ Pass');
    } else {
      // Try HTTP as fallback
      const httpCheck = await checkHttpEndpoint(instanceIp, '/admin', 10000);
      if (httpCheck.accessible) {
        checks.push({
          name: 'Admin UI (HTTPS)',
          status: 'warning',
          message: `HTTP accessible but HTTPS not (status: ${httpCheck.statusCode})`,
          details: httpsCheck.error,
        });
        console.log('      ⚠️  Warning');
      } else {
        checks.push({
          name: 'Admin UI (HTTPS)',
          status: 'fail',
          message: 'Admin UI not accessible',
          details: httpsCheck.error,
        });
        console.log('      ❌ Fail');
      }
    }

    // Check 7: Webmail accessible
    console.log('   [7/12] Checking webmail UI...');
    const webmailCheck = await checkHttpsEndpoint(instanceIp, '/mail', 10000);
    if (webmailCheck.accessible) {
      checks.push({
        name: 'Webmail UI',
        status: 'pass',
        message: `Webmail UI accessible (status: ${webmailCheck.statusCode})`,
      });
      console.log('      ✅ Pass');
    } else {
      checks.push({
        name: 'Webmail UI',
        status: 'warning',
        message: 'Webmail UI not accessible',
        details: webmailCheck.error,
      });
      console.log('      ⚠️  Warning');
    }

    // Check 8: Nextcloud accessible
    console.log('   [8/12] Checking Nextcloud UI...');
    const nextcloudCheck = await checkHttpsEndpoint(instanceIp, '/cloud', 10000);
    if (nextcloudCheck.accessible) {
      checks.push({
        name: 'Nextcloud UI',
        status: 'pass',
        message: `Nextcloud UI accessible (status: ${nextcloudCheck.statusCode})`,
      });
      console.log('      ✅ Pass');
    } else {
      checks.push({
        name: 'Nextcloud UI',
        status: 'warning',
        message: 'Nextcloud UI not accessible',
        details: nextcloudCheck.error,
      });
      console.log('      ⚠️  Warning');
    }

    // Check 9: Configuration file exists
    console.log('   [9/12] Checking Mail-in-a-Box configuration...');
    const configCheck = await sshCommand(
      keyPath,
      instanceIp,
      '[ -f /etc/mailinabox.conf ] && echo "exists" || echo "missing"'
    );
    if (configCheck.success && configCheck.output === 'exists') {
      checks.push({
        name: 'Configuration File',
        status: 'pass',
        message: 'mailinabox.conf exists',
      });
      console.log('      ✅ Pass');
    } else {
      checks.push({
        name: 'Configuration File',
        status: 'warning',
        message: 'mailinabox.conf not found (may be normal if setup incomplete)',
      });
      console.log('      ⚠️  Warning');
    }

    // Check 10: DNS configuration
    console.log('   [10/12] Checking DNS service...');
    const dnsCheck = await sshCommand(
      keyPath,
      instanceIp,
      'systemctl is-active --quiet named 2>/dev/null && echo "running" || echo "stopped"'
    );
    if (dnsCheck.success && dnsCheck.output === 'running') {
      checks.push({
        name: 'DNS Service',
        status: 'pass',
        message: 'BIND (named) service is running',
      });
      console.log('      ✅ Pass');
    } else {
      checks.push({
        name: 'DNS Service',
        status: 'warning',
        message: 'DNS service not running',
      });
      console.log('      ⚠️  Warning');
    }

    // Check 11: SSL certificate
    console.log('   [11/12] Checking SSL certificate...');
    const sslCheck = await sshCommand(
      keyPath,
      instanceIp,
      '[ -f /home/user-data/ssl/ssl_certificate.pem ] && echo "exists" || echo "missing"'
    );
    if (sslCheck.success && sslCheck.output === 'exists') {
      checks.push({
        name: 'SSL Certificate',
        status: 'pass',
        message: 'SSL certificate file exists',
      });
      console.log('      ✅ Pass');
    } else {
      checks.push({
        name: 'SSL Certificate',
        status: 'warning',
        message: 'SSL certificate not found (may need provisioning)',
      });
      console.log('      ⚠️  Warning');
    }

    // Check 12: Setup log shows completion
    console.log('   [12/12] Checking setup log for completion...');
    const logCheck = await sshCommand(
      keyPath,
      instanceIp,
      'tail -5 /var/log/mailinabox_setup.log 2>/dev/null | grep -i "complete" || echo "not found"'
    );
    if (
      logCheck.success &&
      logCheck.output.toLowerCase().includes('complete')
    ) {
      checks.push({
        name: 'Setup Log',
        status: 'pass',
        message: 'Setup log indicates completion',
        details: logCheck.output,
      });
      console.log('      ✅ Pass');
    } else {
      checks.push({
        name: 'Setup Log',
        status: 'warning',
        message: 'Completion message not found in log',
        details: logCheck.output || 'Log file may not exist',
      });
      console.log('      ⚠️  Warning');
    }

    // Summary
    console.log('\n📊 Bootstrap Confirmation Summary\n');
    const passed = checks.filter((c) => c.status === 'pass').length;
    const warnings = checks.filter((c) => c.status === 'warning').length;
    const failed = checks.filter((c) => c.status === 'fail').length;

    console.log(`   ✅ Passed: ${passed}/${checks.length}`);
    console.log(`   ⚠️  Warnings: ${warnings}/${checks.length}`);
    console.log(`   ❌ Failed: ${failed}/${checks.length}\n`);

    // Detailed results
    console.log('📋 Detailed Results:\n');
    checks.forEach((check) => {
      const icon =
        check.status === 'pass'
          ? '✅'
          : check.status === 'warning'
            ? '⚠️'
            : '❌';
      console.log(`${icon} ${check.name}: ${check.message}`);
      if (check.details) {
        console.log(`   Details: ${check.details}`);
      }
    });

    // Final verdict
    console.log('\n🎯 Verdict:\n');
    if (failed === 0 && warnings <= 2) {
      console.log('✅ Bootstrap appears to be SUCCESSFUL');
      console.log('   All critical checks passed. Mail-in-a-Box is operational.\n');
      console.log('💡 Next steps:');
      console.log(`   1. Access admin UI: https://${instanceIp}/admin`);
      console.log(`   2. Login with: admin@${domain}`);
      console.log(`   3. Password: Check SSM parameter ${adminPasswordParam}`);
      console.log(`   4. Provision SSL certificate in admin UI if needed\n`);
      process.exit(0);
    } else if (failed <= 2 && passed >= 8) {
      console.log('⚠️  Bootstrap appears MOSTLY SUCCESSFUL');
      console.log('   Most checks passed, but some issues detected.\n');
      console.log('💡 Recommendations:');
      if (failed > 0) {
        const failedChecks = checks.filter((c) => c.status === 'fail');
        console.log('   Failed checks:');
        failedChecks.forEach((check) => {
          console.log(`     - ${check.name}: ${check.message}`);
        });
      }
      console.log('\n   Review warnings and failed checks above.');
      process.exit(1);
    } else {
      console.log('❌ Bootstrap appears to have FAILED');
      console.log('   Multiple critical checks failed.\n');
      console.log('💡 Troubleshooting:');
      console.log('   1. Check bootstrap logs: pnpm nx run cdk-emcnotary-instance:admin:bootstrap:logs');
      console.log('   2. Check SSM command status: pnpm nx run cdk-emcnotary-instance:admin:bootstrap:status');
      console.log('   3. SSH to instance and check: /var/log/mailinabox_setup.log');
      console.log('   4. Re-run bootstrap if needed: pnpm nx run cdk-emcnotary-instance:admin:bootstrap-miab-ec2-instance\n');
      process.exit(1);
    }
  } catch (error) {
    console.error('\n❌ Confirmation check failed:');
    if (error instanceof Error) {
      console.error(`   ${error.message}`);
    } else {
      console.error(`   ${String(error)}`);
    }
    process.exit(1);
  }
}

// Run if executed directly
if (require.main === module) {
  confirmBootstrap({}).catch((error) => {
    console.error('Unhandled error:', error);
    process.exit(1);
  });
}

