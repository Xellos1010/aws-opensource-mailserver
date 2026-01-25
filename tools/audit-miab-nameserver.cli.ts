#!/usr/bin/env ts-node

/**
 * Audit Mail-in-a-Box instance's NSD (Name Server Daemon) configuration
 * 
 * MIAB uses NSD as the authoritative, non-recursive DNS nameserver.
 * This tool audits:
 * - NSD configuration files
 * - DNS zones managed by NSD
 * - Domain recognition in MIAB
 * - DNS custom records
 * 
 * Usage:
 *   APP_PATH=apps/cdk-emc-notary/instance DOMAIN=emcnotary.com pnpm exec tsx tools/audit-miab-nameserver.cli.ts
 */

import { getStackInfoFromApp } from '@mm/admin-stack-info';
import { getSshKeyPath, buildSshArgs } from '@mm/admin-ssh';
import { spawn } from 'child_process';

const appPath = process.env['APP_PATH'] || 'apps/cdk-emc-notary/instance';
const domain = process.env['DOMAIN'] || 'emcnotary.com';
const region = process.env['AWS_REGION'] || 'us-east-1';
const profile = process.env['AWS_PROFILE'] || 'hepe-admin-mfa';

/**
 * Execute SSH command and return output
 */
async function sshCommand(
  keyPath: string | null,
  host: string,
  command: string
): Promise<{ success: boolean; output: string; error?: string }> {
  return new Promise(async (resolve) => {
    const sshArgs = await buildSshArgs(keyPath, host, 'ubuntu');
    sshArgs.push(command);

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

async function auditNameserver() {
  console.log('\n🔍 Auditing Mail-in-a-Box NSD Nameserver Configuration\n');
  console.log('='.repeat(70));
  console.log(`Domain: ${domain}`);
  console.log('='.repeat(70));
  console.log('\n📝 Mail-in-a-Box uses NSD (Name Server Daemon) as the authoritative DNS nameserver.\n');

  try {
    // Get stack info
    const stackInfo = await getStackInfoFromApp(appPath, { domain, region, profile });
    const instanceIp = stackInfo.instancePublicIp;
    
    if (!instanceIp) {
      throw new Error('Could not determine instance IP address');
    }

    // Get SSH key
    const keyPath = await getSshKeyPath({
      appPath,
      domain,
      region,
      profile,
      ensureSetup: false,
    });

    if (!keyPath) {
      throw new Error('SSH key not found. Run: pnpm nx run cdk-emcnotary-instance:admin:ssh:setup');
    }

    console.log('📋 Step 1: Checking NSD service status...\n');
    const nsdStatus = await sshCommand(
      keyPath,
      instanceIp,
      'systemctl status nsd --no-pager -l 2>&1 | head -20 || echo "NSD not running"'
    );
    console.log(nsdStatus.output);
    console.log('');

    console.log('📋 Step 2: Checking NSD configuration files...\n');
    const nsdConfig = await sshCommand(
      keyPath,
      instanceIp,
      'cat /etc/nsd/nsd.conf 2>&1 | head -50 || echo "Config file not found"'
    );
    console.log(nsdConfig.output);
    console.log('');

    console.log('📋 Step 3: Listing DNS zones managed by NSD...\n');
    const nsdZones = await sshCommand(
      keyPath,
      instanceIp,
      'nsd-control list 2>&1 || echo "nsd-control not available"'
    );
    console.log(nsdZones.output);
    console.log('');

    console.log('📋 Step 4: Checking Mail-in-a-Box DNS zones configuration...\n');
    const miabZones = await sshCommand(
      keyPath,
      instanceIp,
      'cat /home/user-data/dns/zones.conf 2>&1 | head -50 || echo "zones.conf not found"'
    );
    console.log(miabZones.output);
    console.log('');

    console.log('📋 Step 5: Checking Mail-in-a-Box custom DNS records...\n');
    const customDns = await sshCommand(
      keyPath,
      instanceIp,
      'cat /home/user-data/dns/custom.yaml 2>&1 | head -100 || echo "custom.yaml not found"'
    );
    console.log(customDns.output);
    console.log('');

    console.log('📋 Step 6: Checking Mail-in-a-Box managed domains...\n');
    const managedDomains = await sshCommand(
      keyPath,
      instanceIp,
      'cd /opt/mailinabox && sudo -u user-data python3 -c "from utils import get_mail_domains; print(\"\\n\".join(get_mail_domains()))" 2>&1 || echo "Could not get managed domains"'
    );
    console.log('Managed domains:');
    console.log(managedDomains.output);
    console.log('');

    console.log('📋 Step 7: Checking DNS zone files for the domain...\n');
    const zoneFile = await sshCommand(
      keyPath,
      instanceIp,
      `ls -la /home/user-data/dns/zones/*.${domain} 2>&1 | head -10 || echo "Zone file not found for ${domain}"`
    );
    console.log(zoneFile.output);
    console.log('');

    if (zoneFile.output.includes(domain)) {
      const zoneContent = await sshCommand(
        keyPath,
        instanceIp,
        `cat /home/user-data/dns/zones/*.${domain} 2>&1 | head -100`
      );
      console.log('Zone file content:');
      console.log(zoneContent.output);
      console.log('');
    }

    console.log('📋 Step 8: Checking if domain is recognized for DNS management...\n');
    const domainCheck = await sshCommand(
      keyPath,
      instanceIp,
      `cd /opt/mailinabox && sudo -u user-data python3 -c "
import sys
sys.path.insert(0, '/opt/mailinabox')
from utils import get_dns_domains
domains = get_dns_domains()
print('DNS managed domains:')
for d in domains:
    print(f'  - {d}')
if '${domain}' in domains:
    print(f'\\n✅ ${domain} IS recognized as a DNS-managed domain')
else:
    print(f'\\n❌ ${domain} is NOT recognized as a DNS-managed domain')
" 2>&1`
    );
    console.log(domainCheck.output);
    console.log('');

    console.log('📋 Step 9: Testing DNS query for domain...\n');
    const dnsQuery = await sshCommand(
      keyPath,
      instanceIp,
      `dig @127.0.0.1 ${domain} NS +short 2>&1 || echo "DNS query failed"`
    );
    console.log(`NS records for ${domain}:`);
    console.log(dnsQuery.output);
    console.log('');

    console.log('📋 Step 10: Checking NSD zone status for domain...\n');
    const zoneStatus = await sshCommand(
      keyPath,
      instanceIp,
      `nsd-control status 2>&1 | grep -i "${domain}" || echo "Domain not found in NSD status"`
    );
    console.log(zoneStatus.output);
    console.log('');

    console.log('='.repeat(70));
    console.log('✅ Nameserver audit complete\n');

  } catch (error) {
    console.error('❌ Error auditing nameserver:', error);
    if (error instanceof Error) {
      console.error('   Message:', error.message);
    }
    process.exit(1);
  }
}

auditNameserver().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});

