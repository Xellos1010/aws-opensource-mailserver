#!/usr/bin/env ts-node

import { getStackInfoFromApp } from '@mm/admin-stack-info';
import { getSshKeyPath } from '@mm/admin-ssh';
import { spawn } from 'child_process';

interface ListDnsOptions {
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
 * List Mail-in-a-Box DNS records
 */
async function listDns(options: ListDnsOptions): Promise<void> {
  const region = options.region || process.env.AWS_REGION || 'us-east-1';
  const profile = options.profile || process.env.AWS_PROFILE || 'hepe-admin-mfa';
  const appPath = options.appPath || 'apps/cdk-emc-notary/instance';
  const domain = options.domain || process.env.DOMAIN || 'emcnotary.com';

  console.log('🌐 Mail-in-a-Box DNS Records');
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

    console.log(`✅ SSH key ready\n`);

    // Get DNS records using Mail-in-a-Box management script
    console.log('📋 Step 3: Retrieving DNS records...');
    
    // Try to get DNS records via management script
    const dnsCommand = `bash -c 'cd /opt/mailinabox && git config --global --add safe.directory /opt/mailinabox 2>/dev/null || true && sudo -u user-data /opt/mailinabox/management/dns.py show 2>/dev/null || cat /home/user-data/dns/custom.yaml 2>/dev/null || echo "DNS records not available"'`;

    const result = await sshCommand(keyPath, instanceIp, dnsCommand);

    // Also get DNS zone file if available
    const zoneCommand = `bash -c 'cat /home/user-data/dns/zones/*.txt 2>/dev/null | head -100 || echo ""'`;
    const zoneResult = await sshCommand(keyPath, instanceIp, zoneCommand);

    // Get DNS configuration summary
    const summaryCommand = `bash -c 'ls -la /home/user-data/dns/ 2>/dev/null && echo "---" && cat /home/user-data/dns/custom.yaml 2>/dev/null | head -50 || echo "No custom DNS records"'`;
    const summaryResult = await sshCommand(keyPath, instanceIp, summaryCommand);

    // Display DNS records
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📋 Mail-in-a-Box DNS Configuration');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    if (result.success && result.output && !result.output.includes('not available')) {
      console.log('📝 DNS Records (from management script):\n');
      console.log(result.output);
      console.log('\n');
    }

    if (summaryResult.success && summaryResult.output) {
      console.log('📁 DNS Configuration Files:\n');
      const lines = summaryResult.output.split('\n');
      let inCustomYaml = false;
      
      for (const line of lines) {
        if (line === '---') {
          inCustomYaml = true;
          console.log('\n📄 Custom DNS Records (custom.yaml):\n');
          continue;
        }
        
        if (inCustomYaml) {
          console.log(`   ${line}`);
        } else {
          // Show file listing
          if (line.trim() && !line.startsWith('total')) {
            console.log(`   ${line}`);
          }
        }
      }
      console.log('\n');
    }

    if (zoneResult.success && zoneResult.output && zoneResult.output.trim()) {
      console.log('🌍 DNS Zone File (first 100 lines):\n');
      const zoneLines = zoneResult.output.split('\n').slice(0, 100);
      zoneLines.forEach((line) => {
        if (line.trim()) {
          console.log(`   ${line}`);
        }
      });
      console.log('\n');
    }

    // Get public IP and show expected DNS records
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('💡 Expected DNS Records');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    console.log(`   A Record:     ${hostname} → ${instanceIp}`);
    console.log(`   MX Record:    ${domain} → ${hostname} (priority 10)`);
    console.log(`   SPF Record:   ${domain} → v=spf1 mx ~all`);
    console.log(`   DKIM Record:  mail._domainkey.${domain} → (from Mail-in-a-Box)`);
    console.log(`   DMARC Record: _dmarc.${domain} → v=DMARC1; p=quarantine`);
    console.log(`\n   Admin URL:    https://${hostname}/admin`);
    console.log(`   Webmail URL:  https://${hostname}/mail\n`);

    // Check if DNS is properly configured
    console.log('🔍 DNS Verification:\n');
    const verifyCommand = `bash -c 'dig +short ${hostname} @8.8.8.8 2>/dev/null || echo "DNS lookup failed"'`;
    const verifyResult = await sshCommand(keyPath, instanceIp, verifyCommand);
    
    if (verifyResult.success && verifyResult.output) {
      const resolvedIp = verifyResult.output.trim();
      if (resolvedIp === instanceIp) {
        console.log(`   ✅ DNS A record resolves correctly: ${hostname} → ${resolvedIp}`);
      } else if (resolvedIp && resolvedIp !== 'DNS lookup failed') {
        console.log(`   ⚠️  DNS A record resolves to: ${resolvedIp} (expected: ${instanceIp})`);
      } else {
        console.log(`   ⚠️  DNS A record not resolving (may need time to propagate)`);
      }
    }

  } catch (error) {
    console.error('\n❌ Failed to list DNS records:');
    if (error instanceof Error) {
      console.error(`   ${error.message}\n`);
      console.error('💡 Troubleshooting:');
      console.error('   1. Verify Mail-in-a-Box is installed and running');
      console.error('   2. Check SSH access to the instance');
      console.error('   3. Verify DNS management script exists: /opt/mailinabox/management/dns.py');
      console.error('   4. Check DNS configuration: /home/user-data/dns/\n');
    } else {
      console.error(`   ${String(error)}\n`);
    }
    process.exit(1);
  }
}

// Run if executed directly
if (require.main === module) {
  listDns({}).catch((error) => {
    console.error('Unhandled error:', error);
    process.exit(1);
  });
}

