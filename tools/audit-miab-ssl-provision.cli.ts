#!/usr/bin/env ts-node

import { getStackInfoFromApp } from '@mm/admin-stack-info';
import { getSshKeyPath } from '@mm/admin-ssh';
import { spawn } from 'child_process';

interface AuditOptions {
  domain?: string;
  appPath?: string;
  region?: string;
  profile?: string;
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
      'ConnectTimeout=30',
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
 * Audit Mail-in-a-Box SSL provisioning mechanism
 */
async function auditMiabSslProvision(options: AuditOptions): Promise<void> {
  const region = options.region || process.env.AWS_REGION || 'us-east-1';
  const profile = options.profile || process.env.AWS_PROFILE || 'hepe-admin-mfa';
  const appPath = options.appPath || process.env.APP_PATH || 'apps/cdk-emc-notary/instance';
  const domain = options.domain || process.env.DOMAIN;
  
  if (!domain && !appPath) {
    throw new Error('Cannot resolve domain. Provide domain or appPath');
  }

  console.log('🔍 Mail-in-a-Box SSL Provisioning Audit');
  console.log(`   Domain: ${domain}`);
  console.log(`   Region: ${region}`);
  console.log(`   Profile: ${profile}\n`);

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

    // Audit Mail-in-a-Box SSL provisioning
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📋 Step 3: Auditing Mail-in-a-Box SSL Provisioning');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    // 1. Check Mail-in-a-Box installation
    console.log('🔍 [1/8] Checking Mail-in-a-Box installation...');
    const miabCheck = await sshCommand(
      keyPath,
      instanceIp,
      '[ -d /opt/mailinabox ] && echo "EXISTS" || echo "NOT_FOUND"'
    );
    if (miabCheck.success && miabCheck.output === 'EXISTS') {
      console.log('   ✅ Mail-in-a-Box installed at /opt/mailinabox\n');
    } else {
      console.log('   ❌ Mail-in-a-Box not found\n');
      throw new Error('Mail-in-a-Box not installed');
    }

    // 2. Find SSL certificate management script
    console.log('🔍 [2/8] Finding SSL certificate management script...');
    const sslScriptCheck = await sshCommand(
      keyPath,
      instanceIp,
      'ls -la /opt/mailinabox/management/ssl_certificates.py 2>/dev/null && echo "---" && head -50 /opt/mailinabox/management/ssl_certificates.py 2>/dev/null || echo "NOT_FOUND"'
    );
    if (sslScriptCheck.success && sslScriptCheck.output !== 'NOT_FOUND') {
      const parts = sslScriptCheck.output.split('---');
      console.log('   ✅ SSL certificate script found');
      console.log(`   File info: ${parts[0]?.trim() || 'N/A'}`);
      console.log(`   First 50 lines:\n${parts[1]?.trim() || 'N/A'}\n`);
    } else {
      console.log('   ❌ SSL certificate script not found\n');
    }

    // 3. List all web UI Python files
    console.log('🔍 [3/8] Listing web UI Python files...');
    const webFilesCheck = await sshCommand(
      keyPath,
      instanceIp,
      'find /opt/mailinabox/web -name "*.py" -type f | head -20'
    );
    if (webFilesCheck.success && webFilesCheck.output) {
      console.log('   ✅ Found web UI files:');
      webFilesCheck.output.split('\n').forEach((file) => {
        if (file.trim()) console.log(`      - ${file.trim()}`);
      });
      console.log('');
    }

    // 4. Check for SSL/TLS related files in web directory
    console.log('🔍 [4/8] Finding SSL/TLS related web files...');
    const sslFilesCheck = await sshCommand(
      keyPath,
      instanceIp,
      'find /opt/mailinabox/web -name "*.py" -exec grep -l "ssl\|tls\|certificate" {} \\; 2>/dev/null | head -10'
    );
    if (sslFilesCheck.success && sslFilesCheck.output) {
      console.log('   ✅ Found SSL-related web files:');
      sslFilesCheck.output.split('\n').forEach((file) => {
        if (file.trim()) console.log(`      - ${file.trim()}`);
      });
      console.log('');
    } else {
      console.log('   ⚠️  No SSL-related web files found\n');
    }

    // 5. Check for Flask routes related to SSL
    console.log('🔍 [5/8] Checking Flask routes for SSL...');
    const routesCheck = await sshCommand(
      keyPath,
      instanceIp,
      'grep -r "@.*route.*ssl\|@.*route.*tls\|@.*route.*cert" /opt/mailinabox/web 2>/dev/null | head -20 || echo "NOT_FOUND"'
    );
    if (routesCheck.success && routesCheck.output !== 'NOT_FOUND') {
      console.log('   ✅ Found SSL-related routes:');
      routesCheck.output.split('\n').forEach((line) => {
        if (line.trim()) console.log(`      ${line.trim()}`);
      });
      console.log('');
    } else {
      console.log('   ⚠️  No SSL routes found, checking all routes...');
      const allRoutesCheck = await sshCommand(
        keyPath,
        instanceIp,
        'grep -r "@.*route" /opt/mailinabox/web 2>/dev/null | grep -i "system\|admin" | head -20'
      );
      if (allRoutesCheck.success && allRoutesCheck.output) {
        console.log('   Found system/admin routes:');
        allRoutesCheck.output.split('\n').forEach((line) => {
          if (line.trim()) console.log(`      ${line.trim()}`);
        });
      }
      console.log('');
    }

    // 6. Check for SSL provisioning function calls
    console.log('🔍 [6/8] Checking for SSL provisioning function calls...');
    const provisionCheck = await sshCommand(
      keyPath,
      instanceIp,
      'grep -r "ssl_certificates\|provision.*cert\|get.*cert" /opt/mailinabox/web 2>/dev/null | head -30 || echo "NOT_FOUND"'
    );
    if (provisionCheck.success && provisionCheck.output !== 'NOT_FOUND') {
      console.log('   ✅ Found SSL provisioning references:');
      provisionCheck.output.split('\n').forEach((line) => {
        if (line.trim()) console.log(`      ${line.trim()}`);
      });
      console.log('');
    } else {
      console.log('   ⚠️  No provisioning references found\n');
    }

    // 7. Check management script usage
    console.log('🔍 [7/8] Checking how management script is invoked...');
    const scriptUsageCheck = await sshCommand(
      keyPath,
      instanceIp,
      'grep -r "ssl_certificates.py\|management/ssl" /opt/mailinabox 2>/dev/null | head -20 || echo "NOT_FOUND"'
    );
    if (scriptUsageCheck.success && scriptUsageCheck.output !== 'NOT_FOUND') {
      console.log('   ✅ Found script invocation references:');
      scriptUsageCheck.output.split('\n').forEach((line) => {
        if (line.trim()) console.log(`      ${line.trim()}`);
      });
      console.log('');
    } else {
      console.log('   ⚠️  No script invocations found\n');
    }

    // 8. Check for API documentation or endpoints
    console.log('🔍 [8/8] Checking for API documentation...');
    const apiDocCheck = await sshCommand(
      keyPath,
      instanceIp,
      'find /opt/mailinabox -name "*api*" -o -name "*doc*" 2>/dev/null | grep -i "ssl\|tls\|cert" | head -10 || echo "NOT_FOUND"'
    );
    if (apiDocCheck.success && apiDocCheck.output !== 'NOT_FOUND') {
      console.log('   ✅ Found API documentation:');
      apiDocCheck.output.split('\n').forEach((file) => {
        if (file.trim()) console.log(`      - ${file.trim()}`);
      });
      console.log('');
    } else {
      console.log('   ⚠️  No API documentation found\n');
    }

    // Detailed examination of key files
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📋 Step 4: Detailed File Examination');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    // Examine SSL certificates script
    console.log('📄 Examining ssl_certificates.py script...');
    const sslScriptFull = await sshCommand(
      keyPath,
      instanceIp,
      'cat /opt/mailinabox/management/ssl_certificates.py 2>/dev/null | head -200'
    );
    if (sslScriptFull.success && sslScriptFull.output) {
      console.log('   First 200 lines:\n');
      console.log(sslScriptFull.output);
      console.log('\n');
    }

    // Find web UI SSL handler - check main web.py file
    console.log('📄 Finding web UI SSL handler...');
    const webPyCheck = await sshCommand(
      keyPath,
      instanceIp,
      'ls -la /opt/mailinabox/web/*.py 2>/dev/null | head -10'
    );
    if (webPyCheck.success && webPyCheck.output) {
      console.log('   Web UI Python files:');
      console.log(webPyCheck.output);
      console.log('');
    }

    // Check for system.py or ssl.py files
    const systemFilesCheck = await sshCommand(
      keyPath,
      instanceIp,
      'find /opt/mailinabox/web -name "*system*.py" -o -name "*ssl*.py" -o -name "*tls*.py" 2>/dev/null'
    );
    if (systemFilesCheck.success && systemFilesCheck.output) {
      const files = systemFilesCheck.output.split('\n').filter(f => f.trim());
      for (const file of files.slice(0, 3)) {
        if (file.trim()) {
          console.log(`\n   Examining: ${file.trim()}`);
          const fileContent = await sshCommand(
            keyPath,
            instanceIp,
            `head -200 "${file.trim()}" 2>/dev/null`
          );
          if (fileContent.success && fileContent.output) {
            console.log(fileContent.output);
            console.log('\n   ... (truncated)\n');
          }
        }
      }
    }

    // Check main web.py for SSL routes
    const mainWebCheck = await sshCommand(
      keyPath,
      instanceIp,
      'grep -n "ssl\|tls\|certificate\|provision" /opt/mailinabox/web/web.py 2>/dev/null | head -50 || echo "NOT_FOUND"'
    );
    if (mainWebCheck.success && mainWebCheck.output !== 'NOT_FOUND') {
      console.log('\n   SSL references in web.py:');
      console.log(mainWebCheck.output);
      console.log('');
    }

    // Summary
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📊 Audit Summary');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    console.log('✅ Audit completed successfully');
    console.log('   Review the output above to understand:');
    console.log('   1. How the UI provisions SSL certificates');
    console.log('   2. What API endpoints are available');
    console.log('   3. How to programmatically invoke SSL provisioning\n');

  } catch (error) {
    console.error('\n❌ Audit failed:');
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
  auditMiabSslProvision({}).catch((error) => {
    console.error('Unhandled error:', error);
    process.exit(1);
  });
}

export { auditMiabSslProvision };

