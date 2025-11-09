#!/usr/bin/env ts-node

import { getStackInfoFromApp } from '@mm/admin-stack-info';
import { getSshKeyPath } from '@mm/admin-ssh';
import * as https from 'https';
import * as tls from 'tls';
import { spawn } from 'child_process';

interface SslStatusOptions {
  domain?: string;
  appPath?: string;
  region?: string;
  profile?: string;
}

interface SslCheck {
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
 * Check SSL certificate from HTTPS endpoint
 */
async function checkSslCertificate(
  host: string,
  port: number = 443
): Promise<{
  valid: boolean;
  issuer?: string;
  subject?: string;
  validFrom?: Date;
  validTo?: Date;
  daysUntilExpiry?: number;
  error?: string;
}> {
  return new Promise((resolve) => {
    const options = {
      hostname: host,
      port,
      method: 'GET',
      path: '/',
      rejectUnauthorized: false,
      timeout: 10000,
    };

    const req = https.request(options, (res) => {
      const socket = res.socket as tls.TLSSocket;
      const cert = socket.getPeerCertificate(true);

      if (cert && cert.valid_to) {
        const validTo = new Date(cert.valid_to);
        const daysUntilExpiry = Math.floor(
          (validTo.getTime() - Date.now()) / (1000 * 60 * 60 * 24)
        );

        resolve({
          valid: daysUntilExpiry > 0,
          issuer: cert.issuer?.CN || cert.issuer?.O || 'Unknown',
          subject: cert.subject?.CN || cert.subject?.O || 'Unknown',
          validFrom: cert.valid_from ? new Date(cert.valid_from) : undefined,
          validTo,
          daysUntilExpiry,
        });
      } else {
        resolve({
          valid: false,
          error: 'Certificate information not available',
        });
      }

      res.destroy();
    });

    req.on('error', (err) => {
      resolve({
        valid: false,
        error: err.message,
      });
    });

    req.on('timeout', () => {
      req.destroy();
      resolve({
        valid: false,
        error: 'Connection timeout',
      });
    });

    req.end();
  });
}

/**
 * Check SSL certificate status
 */
async function checkSslStatus(options: SslStatusOptions): Promise<void> {
  const region = options.region || process.env.AWS_REGION || 'us-east-1';
  const profile = options.profile || process.env.AWS_PROFILE || 'hepe-admin-mfa';
  const appPath = options.appPath || 'apps/cdk-emc-notary/instance';
  const domain = options.domain || process.env.DOMAIN || 'emcnotary.com';

  console.log('🔐 SSL Certificate Status Check');
  console.log(`   Domain: ${domain}`);
  console.log(`   Region: ${region}`);
  console.log(`   Profile: ${profile}\n`);

  const checks: SslCheck[] = [];

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
    console.log('🔍 Step 3: Running SSL certificate checks...\n');

    // Check 1: SSL certificate file exists
    console.log('   [1/8] Checking SSL certificate file...');
    const certFileCheck = await sshCommand(
      keyPath,
      instanceIp,
      '[ -f /home/user-data/ssl/ssl_certificate.pem ] && echo "exists" || echo "missing"'
    );
    if (certFileCheck.success && certFileCheck.output === 'exists') {
      checks.push({
        name: 'Certificate File',
        status: 'pass',
        message: 'SSL certificate file exists',
      });
      console.log('      ✅ Pass');
    } else {
      checks.push({
        name: 'Certificate File',
        status: 'fail',
        message: 'SSL certificate file not found',
        details: '/home/user-data/ssl/ssl_certificate.pem',
      });
      console.log('      ❌ Fail');
    }

    // Check 2: Private key file exists
    console.log('   [2/8] Checking SSL private key file...');
    const keyFileCheck = await sshCommand(
      keyPath,
      instanceIp,
      '[ -f /home/user-data/ssl/ssl_private_key.pem ] && echo "exists" || echo "missing"'
    );
    if (keyFileCheck.success && keyFileCheck.output === 'exists') {
      checks.push({
        name: 'Private Key File',
        status: 'pass',
        message: 'SSL private key file exists',
      });
      console.log('      ✅ Pass');
    } else {
      checks.push({
        name: 'Private Key File',
        status: 'fail',
        message: 'SSL private key file not found',
        details: '/home/user-data/ssl/ssl_private_key.pem',
      });
      console.log('      ❌ Fail');
    }

    // Check 3: Certificate details from file
    console.log('   [3/8] Checking certificate details from file...');
    const certDetailsCheck = await sshCommand(
      keyPath,
      instanceIp,
      'openssl x509 -in /home/user-data/ssl/ssl_certificate.pem -noout -subject -issuer -dates 2>/dev/null || echo "error"'
    );
    if (
      certDetailsCheck.success &&
      certDetailsCheck.output !== 'error' &&
      certDetailsCheck.output.length > 0
    ) {
      const details = certDetailsCheck.output;
      checks.push({
        name: 'Certificate Details',
        status: 'pass',
        message: 'Certificate details readable',
        details: details.split('\n').slice(0, 4).join('; '),
      });
      console.log('      ✅ Pass');
    } else {
      checks.push({
        name: 'Certificate Details',
        status: 'warning',
        message: 'Could not read certificate details',
        details: certDetailsCheck.error || 'Certificate file may not exist',
      });
      console.log('      ⚠️  Warning');
    }

    // Check 4: Certificate expiration check
    console.log('   [4/8] Checking certificate expiration...');
    const expiryCheck = await sshCommand(
      keyPath,
      instanceIp,
      'openssl x509 -in /home/user-data/ssl/ssl_certificate.pem -noout -checkend 2592000 2>/dev/null && echo "valid" || echo "expiring"'
    );
    if (expiryCheck.success && expiryCheck.output === 'valid') {
      const expiryDateCheck = await sshCommand(
        keyPath,
        instanceIp,
        'openssl x509 -in /home/user-data/ssl/ssl_certificate.pem -noout -enddate 2>/dev/null | cut -d= -f2'
      );
      checks.push({
        name: 'Certificate Expiration',
        status: 'pass',
        message: 'Certificate valid for at least 30 days',
        details: expiryDateCheck.output
          ? `Expires: ${expiryDateCheck.output}`
          : undefined,
      });
      console.log('      ✅ Pass');
    } else {
      checks.push({
        name: 'Certificate Expiration',
        status: 'warning',
        message: 'Certificate expiring soon or expired',
        details: expiryCheck.output || 'Check certificate expiration date',
      });
      console.log('      ⚠️  Warning');
    }

    // Check 5: HTTPS endpoint certificate (via IP)
    console.log('   [5/8] Checking HTTPS endpoint certificate (via IP)...');
    const ipCertCheck = await checkSslCertificate(instanceIp, 443);
    if (ipCertCheck.valid && ipCertCheck.daysUntilExpiry && ipCertCheck.daysUntilExpiry > 0) {
      checks.push({
        name: 'HTTPS Certificate (IP)',
        status: 'pass',
        message: `Valid certificate (expires in ${ipCertCheck.daysUntilExpiry} days)`,
        details: `Issuer: ${ipCertCheck.issuer}, Subject: ${ipCertCheck.subject}`,
      });
      console.log('      ✅ Pass');
    } else if (ipCertCheck.valid === false && ipCertCheck.error) {
      checks.push({
        name: 'HTTPS Certificate (IP)',
        status: 'warning',
        message: 'Could not verify HTTPS certificate',
        details: ipCertCheck.error,
      });
      console.log('      ⚠️  Warning');
    } else {
      checks.push({
        name: 'HTTPS Certificate (IP)',
        status: 'fail',
        message: 'Invalid or expired certificate',
        details: ipCertCheck.error || 'Certificate validation failed',
      });
      console.log('      ❌ Fail');
    }

    // Check 6: Nginx SSL configuration
    console.log('   [6/8] Checking Nginx SSL configuration...');
    const nginxSslCheck = await sshCommand(
      keyPath,
      instanceIp,
      'grep -r "ssl_certificate" /etc/nginx/sites-enabled/ 2>/dev/null | head -2 || echo "not found"'
    );
    if (
      nginxSslCheck.success &&
      nginxSslCheck.output !== 'not found' &&
      nginxSslCheck.output.length > 0
    ) {
      checks.push({
        name: 'Nginx SSL Config',
        status: 'pass',
        message: 'Nginx SSL configuration found',
      });
      console.log('      ✅ Pass');
    } else {
      checks.push({
        name: 'Nginx SSL Config',
        status: 'warning',
        message: 'Nginx SSL configuration not found',
      });
      console.log('      ⚠️  Warning');
    }

    // Check 7: Let's Encrypt certificate directory
    console.log('   [7/8] Checking Let\'s Encrypt certificate directory...');
    const letsencryptCheck = await sshCommand(
      keyPath,
      instanceIp,
      '[ -d /home/user-data/ssl/lets_encrypt ] && echo "exists" || echo "missing"'
    );
    if (letsencryptCheck.success && letsencryptCheck.output === 'exists') {
      const certCountCheck = await sshCommand(
        keyPath,
        instanceIp,
        'ls -1 /home/user-data/ssl/lets_encrypt/*.pem 2>/dev/null | wc -l'
      );
      checks.push({
        name: 'Let\'s Encrypt Directory',
        status: 'pass',
        message: 'Let\'s Encrypt certificate directory exists',
        details: certCountCheck.output
          ? `${certCountCheck.output.trim()} certificate file(s) found`
          : undefined,
      });
      console.log('      ✅ Pass');
    } else {
      checks.push({
        name: 'Let\'s Encrypt Directory',
        status: 'warning',
        message: 'Let\'s Encrypt directory not found',
        details: 'Certificates may be stored elsewhere',
      });
      console.log('      ⚠️  Warning');
    }

    // Check 8: Certificate auto-renewal check
    console.log('   [8/8] Checking certificate auto-renewal...');
    const renewalCheck = await sshCommand(
      keyPath,
      instanceIp,
      'systemctl list-timers --all 2>/dev/null | grep -i "ssl\|cert\|letsencrypt" || crontab -l 2>/dev/null | grep -i "ssl\|cert\|letsencrypt" || echo "not found"'
    );
    if (
      renewalCheck.success &&
      renewalCheck.output !== 'not found' &&
      renewalCheck.output.length > 0
    ) {
      checks.push({
        name: 'Auto-Renewal',
        status: 'pass',
        message: 'Certificate auto-renewal configured',
      });
      console.log('      ✅ Pass');
    } else {
      checks.push({
        name: 'Auto-Renewal',
        status: 'warning',
        message: 'Auto-renewal configuration not found',
        details: 'Mail-in-a-Box may handle renewal automatically',
      });
      console.log('      ⚠️  Warning');
    }

    // Summary
    console.log('\n📊 SSL Certificate Status Summary\n');
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

    // Certificate info if available
    if (ipCertCheck.valid && ipCertCheck.validTo) {
      console.log('\n📜 Certificate Information:\n');
      console.log(`   Issuer: ${ipCertCheck.issuer || 'Unknown'}`);
      console.log(`   Subject: ${ipCertCheck.subject || 'Unknown'}`);
      if (ipCertCheck.validFrom) {
        console.log(`   Valid From: ${ipCertCheck.validFrom.toISOString().split('T')[0]}`);
      }
      console.log(`   Valid To: ${ipCertCheck.validTo.toISOString().split('T')[0]}`);
      if (ipCertCheck.daysUntilExpiry !== undefined) {
        console.log(`   Days Until Expiry: ${ipCertCheck.daysUntilExpiry}`);
      }
    }

    // Final verdict
    console.log('\n🎯 Verdict:\n');
    if (failed === 0 && warnings <= 2) {
      console.log('✅ SSL certificates are PROVISIONED and VALID');
      console.log('   Certificates are properly configured and working.\n');
      process.exit(0);
    } else if (failed <= 2 && passed >= 5) {
      console.log('⚠️  SSL certificates are PARTIALLY PROVISIONED');
      console.log('   Some certificates exist but may need attention.\n');
      console.log('💡 Recommendations:');
      if (failed > 0) {
        const failedChecks = checks.filter((c) => c.status === 'fail');
        console.log('   Failed checks:');
        failedChecks.forEach((check) => {
          console.log(`     - ${check.name}: ${check.message}`);
        });
      }
      console.log('\n   Run: pnpm nx run cdk-emcnotary-instance:admin:ssl:provision');
      process.exit(1);
    } else {
      console.log('❌ SSL certificates are NOT PROVISIONED');
      console.log('   Certificates need to be provisioned.\n');
      console.log('💡 Next steps:');
      console.log('   1. Provision certificates: pnpm nx run cdk-emcnotary-instance:admin:ssl:provision');
      console.log('   2. Wait 1-2 minutes for provisioning to complete');
      console.log('   3. Re-run this check: pnpm nx run cdk-emcnotary-instance:admin:ssl:status\n');
      process.exit(1);
    }
  } catch (error) {
    console.error('\n❌ SSL status check failed:');
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
  checkSslStatus({}).catch((error) => {
    console.error('Unhandled error:', error);
    process.exit(1);
  });
}

