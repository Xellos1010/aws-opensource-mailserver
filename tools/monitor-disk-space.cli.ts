#!/usr/bin/env ts-node

/**
 * Monitor disk space on Mail-in-a-Box instance
 * Reports current usage and exits with code 1 if above threshold
 */

import { getStackInfoFromApp } from '@mm/admin-stack-info';
import { getSshKeyPath } from '@mm/admin-ssh';
import { spawn } from 'child_process';

async function sshCommand(
  keyPath: string,
  host: string,
  command: string
): Promise<{ success: boolean; output: string; error?: string }> {
  return new Promise((resolve) => {
    const sshArgs = [
      '-i', keyPath,
      '-o', 'StrictHostKeyChecking=no',
      '-o', 'UserKnownHostsFile=/dev/null',
      '-o', 'ConnectTimeout=10',
      '-o', 'LogLevel=ERROR',
      `ubuntu@${host}`,
      command,
    ];

    let output = '';
    let error = '';
    const ssh = spawn('ssh', sshArgs);
    ssh.stdout.on('data', (data) => { output += data.toString(); });
    ssh.stderr.on('data', (data) => { error += data.toString(); });
    ssh.on('close', (code) => resolve({ success: code === 0, output: output.trim(), error: error.trim() || undefined }));
    ssh.on('error', (err) => resolve({ success: false, output: '', error: err.message }));
  });
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  let domain: string | undefined;
  let threshold = 85;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--domain' && args[i + 1]) { domain = args[++i]; }
    else if (args[i] === '--threshold' && args[i + 1]) { threshold = parseInt(args[++i], 10); }
  }

  const region = process.env.AWS_REGION || 'us-east-1';
  const profile = process.env.AWS_PROFILE || 'hepe-admin-mfa';
  const appPath = process.env.APP_PATH || 'apps/cdk-emc-notary/instance';

  console.log('Disk Space Monitor');
  console.log(`  Domain: ${domain || '(from stack)'}`);
  console.log(`  Threshold: ${threshold}%\n`);

  const stackInfo = await getStackInfoFromApp(appPath, { domain, region, profile });
  if (!stackInfo.instancePublicIp) throw new Error('Instance IP not found in stack outputs');

  const keyPath = await getSshKeyPath({ appPath, domain, region, profile, ensureSetup: true });
  if (!keyPath) throw new Error('SSH key not found');

  const result = await sshCommand(
    keyPath,
    stackInfo.instancePublicIp,
    "df / | awk 'NR==2{print $2,$3,$4,$5}'"
  );

  if (!result.success) throw new Error(`SSH failed: ${result.error}`);

  const [total, used, available, percentStr] = result.output.split(/\s+/);
  const percent = parseInt(percentStr?.replace('%', '') || '0', 10);

  const status = percent >= threshold ? 'ALERT' : percent >= threshold - 10 ? 'WARNING' : 'OK';
  const icon = percent >= threshold ? '🔴' : percent >= threshold - 10 ? '🟡' : '🟢';

  console.log(`${icon} Disk Status: ${status}`);
  console.log(`   Used: ${percentStr} of ${Math.round(parseInt(total) / 1024 / 1024)}GB`);
  console.log(`   Available: ${Math.round(parseInt(available) / 1024)}MB`);
  console.log(`   Instance: ${stackInfo.instancePublicIp}`);

  if (percent >= threshold) {
    console.error(`\n  DISK ABOVE ${threshold}% THRESHOLD — run admin:cleanup:disk-space`);
    process.exit(1);
  } else if (percent >= threshold - 10) {
    console.warn(`\n  Disk approaching threshold (${threshold}%) — consider running admin:cleanup:disk-space`);
  }
}

main().catch((error) => {
  console.error('Error:', String(error));
  process.exit(1);
});
