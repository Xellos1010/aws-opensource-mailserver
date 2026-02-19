#!/usr/bin/env ts-node

/**
 * Backup and Cleanup Mailserver
 *
 * Performs a safe maintenance workflow:
 * 1. Backup all mailboxes from remote server to local path (optional tar + sha256)
 * 2. Clean disk pressure on remote host (logs/cache/temp)
 * 3. Verify mail services and queue status
 */

import { getStackInfo, getStackInfoFromApp, type StackInfo } from '@mm/admin-stack-info';
import { getSshKeyPath } from '@mm/admin-ssh';
import { spawn } from 'child_process';
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';

interface Options {
  domain?: string;
  appPath?: string;
  stackName?: string;
  region?: string;
  profile?: string;
  destinationDir?: string;
  sshKeyPath?: string;
  journalVacuumMb?: number;
  skipBackup?: boolean;
  skipCleanup?: boolean;
  noTar?: boolean;
  dryRun?: boolean;
}

interface CommandResult {
  success: boolean;
  code: number;
  stdout: string;
  stderr: string;
}

interface DiskUsage {
  total: string;
  used: string;
  available: string;
  percent: string;
}

interface BackupResult {
  executed: boolean;
  destinationDir?: string;
  tarPath?: string;
  sha256?: string;
  fileCount?: number;
  directoryCount?: number;
  sizeKb?: number;
}

interface CleanupResult {
  executed: boolean;
  beforeDisk?: DiskUsage;
  afterDisk?: DiskUsage;
}

interface FinalChecks {
  services: Record<string, string>;
  mailQueue: string;
  disk: DiskUsage;
}

interface RunReport {
  timestamp: string;
  domain: string;
  stackName: string;
  instanceId: string;
  instanceIp: string;
  dryRun: boolean;
  backup: BackupResult;
  cleanup: CleanupResult;
  finalChecks: FinalChecks;
}

function formatTimestamp(d: Date = new Date()): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  return `${yyyy}${mm}${dd}_${hh}${min}${ss}`;
}

function parseArgs(argv: string[]): Options {
  const options: Options = {};

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case '--domain':
      case '-d':
        options.domain = argv[++i];
        break;
      case '--app-path':
        options.appPath = argv[++i];
        break;
      case '--stack-name':
        options.stackName = argv[++i];
        break;
      case '--region':
      case '-r':
        options.region = argv[++i];
        break;
      case '--profile':
        options.profile = argv[++i];
        break;
      case '--destination-dir':
        options.destinationDir = argv[++i];
        break;
      case '--ssh-key-path':
        options.sshKeyPath = argv[++i];
        break;
      case '--journal-vacuum-mb':
        options.journalVacuumMb = Number(argv[++i]);
        break;
      case '--skip-backup':
        options.skipBackup = true;
        break;
      case '--skip-cleanup':
        options.skipCleanup = true;
        break;
      case '--no-tar':
        options.noTar = true;
        break;
      case '--dry-run':
        options.dryRun = true;
        break;
      case '--help':
      case '-h':
        printHelpAndExit(0);
        break;
      default:
        if (arg.startsWith('-')) {
          console.error(`Unknown option: ${arg}`);
          printHelpAndExit(1);
        }
    }
  }

  return options;
}

function printHelpAndExit(code: number): never {
  console.log(`
Usage: backup-and-cleanup-mailserver.cli.ts [options]

Backs up remote mailboxes locally, then performs disk cleanup on the mail server.

Options:
  --domain, -d <domain>           Domain name (e.g., hepefoundation.org)
  --app-path <path>               App path (default: APP_PATH or apps/cdk-k3frame/instance)
  --stack-name <name>             Explicit CloudFormation stack name (supports legacy stacks)
  --region, -r <region>           AWS region (default: us-east-1)
  --profile <profile>             AWS profile (default: hepe-admin-mfa)
  --destination-dir <path>        Local backup base dir (default: Archive/backups/<domain>/mailboxes)
  --ssh-key-path <path>           Explicit SSH key path (.pem)
  --journal-vacuum-mb <mb>        Journald vacuum target in MB (default: 100)
  --skip-backup                   Skip mailbox backup step
  --skip-cleanup                  Skip remote cleanup step
  --no-tar                        Do not create tar.gz backup archive
  --dry-run                       Preview actions where possible
  --help, -h                      Show this help

Examples:
  # Standard run using app path resolution
  pnpm exec tsx --tsconfig tools/tsconfig.json tools/backup-and-cleanup-mailserver.cli.ts --domain k3frame.com

  # Legacy stack run (hepefoundation style)
  pnpm exec tsx --tsconfig tools/tsconfig.json tools/backup-and-cleanup-mailserver.cli.ts --domain hepefoundation.org --stack-name hepefoundation-org-mailserver

  # Dry run preview
  pnpm exec tsx --tsconfig tools/tsconfig.json tools/backup-and-cleanup-mailserver.cli.ts --domain hepefoundation.org --stack-name hepefoundation-org-mailserver --dry-run
`);
  process.exit(code);
}

function runCommand(
  cmd: string,
  args: string[],
  options?: { streamOutput?: boolean; stdinData?: string }
): Promise<CommandResult> {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: process.env,
    });

    let stdout = '';
    let stderr = '';
    const streamOutput = options?.streamOutput ?? true;

    child.stdout.on('data', (data: Buffer) => {
      const chunk = data.toString();
      stdout += chunk;
      if (streamOutput) process.stdout.write(chunk);
    });

    child.stderr.on('data', (data: Buffer) => {
      const chunk = data.toString();
      stderr += chunk;
      if (streamOutput) process.stderr.write(chunk);
    });

    child.on('error', (err) => {
      stderr += err.message;
    });

    if (options?.stdinData !== undefined) {
      child.stdin.write(options.stdinData);
    }
    child.stdin.end();

    child.on('close', (code) => {
      resolve({
        success: code === 0,
        code: code ?? 1,
        stdout: stdout.trim(),
        stderr: stderr.trim(),
      });
    });
  });
}

function sshArgs(keyPath: string, host: string, remoteCommand: string): string[] {
  return [
    '-i',
    keyPath,
    '-o',
    'StrictHostKeyChecking=no',
    '-o',
    'UserKnownHostsFile=/dev/null',
    '-o',
    'ConnectTimeout=15',
    '-o',
    'LogLevel=ERROR',
    `ubuntu@${host}`,
    remoteCommand,
  ];
}

async function sshCommand(
  keyPath: string,
  host: string,
  remoteCommand: string,
  streamOutput: boolean = true
): Promise<CommandResult> {
  return runCommand('ssh', sshArgs(keyPath, host, remoteCommand), { streamOutput });
}

async function runRemoteScript(
  keyPath: string,
  host: string,
  script: string,
  streamOutput: boolean = true
): Promise<CommandResult> {
  const encoded = Buffer.from(script, 'utf8').toString('base64');
  const remoteCommand = `echo '${encoded}' | base64 -d | sudo bash`;
  return sshCommand(keyPath, host, remoteCommand, streamOutput);
}

async function resolveStack(options: Options, region: string, profile: string): Promise<StackInfo> {
  const appPath = options.appPath || process.env.APP_PATH || 'apps/cdk-k3frame/instance';

  if (options.stackName) {
    return getStackInfo({
      stackName: options.stackName,
      domain: options.domain,
      region,
      profile,
    });
  }

  if (appPath) {
    return getStackInfoFromApp(appPath, {
      domain: options.domain,
      region,
      profile,
    });
  }

  if (!options.domain) {
    throw new Error('Cannot resolve stack. Provide --domain, --app-path, or --stack-name.');
  }

  return getStackInfo({
    domain: options.domain,
    region,
    profile,
  });
}

function countEntries(root: string): { files: number; directories: number } {
  let files = 0;
  let directories = 0;
  const stack = [root];

  while (stack.length > 0) {
    const dir = stack.pop() as string;
    directories++;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        stack.push(full);
      } else {
        files++;
      }
    }
  }

  return {
    files,
    directories,
  };
}

async function directorySizeKb(dir: string): Promise<number | undefined> {
  const result = await runCommand('du', ['-sk', dir], { streamOutput: false });
  if (!result.success || !result.stdout) return undefined;
  const first = result.stdout.split(/\s+/)[0];
  const num = Number(first);
  return Number.isFinite(num) ? num : undefined;
}

async function sha256File(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);
    stream.on('error', reject);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}

async function getDiskUsage(keyPath: string, host: string): Promise<DiskUsage> {
  const result = await sshCommand(
    keyPath,
    host,
    `df -h / | tail -1 | awk '{print $2 " " $3 " " $4 " " $5}'`,
    false
  );

  if (!result.success || !result.stdout) {
    throw new Error(`Failed to read disk usage: ${result.stderr || 'unknown error'}`);
  }

  const parts = result.stdout.split(/\s+/);
  return {
    total: parts[0] || 'unknown',
    used: parts[1] || 'unknown',
    available: parts[2] || 'unknown',
    percent: parts[3] || 'unknown',
  };
}

async function getServiceStates(keyPath: string, host: string): Promise<Record<string, string>> {
  const script = `
set -euo pipefail
for svc in postfix dovecot nginx fail2ban; do
  state="$(systemctl is-active "$svc" 2>/dev/null || true)"
  echo "$svc=$state"
done
`;
  const result = await runRemoteScript(keyPath, host, script, false);
  const states: Record<string, string> = {};
  for (const line of result.stdout.split('\n')) {
    const [k, v] = line.trim().split('=');
    if (k) states[k] = v || 'unknown';
  }
  return states;
}

async function getMailQueueSummary(keyPath: string, host: string): Promise<string> {
  const result = await sshCommand(keyPath, host, 'mailq | tail -n 1', false);
  return result.stdout || result.stderr || 'unknown';
}

function cleanupScript(journalVacuumMb: number, dryRun: boolean): string {
  if (dryRun) {
    return `
set -euo pipefail
echo "=== DRY RUN: backup/cleanup preview ==="
echo "Current disk:"
df -h /
echo
echo "Current heavy dirs:"
du -sh /var/log /var/lib/snapd /var/lib/apt /var/cache/apt 2>/dev/null || true
echo
journalctl --disk-usage || true
echo
echo "Would run:"
echo "  - ensure /var/log/fail2ban.log exists"
echo "  - ensure /var/log/roundcubemail/errors.log exists"
echo "  - journalctl --vacuum-size=${journalVacuumMb}M"
echo "  - apt-get clean && rm -rf /var/lib/apt/lists/*"
echo "  - snap set system refresh.retain=2"
echo "  - remove disabled snap revisions"
echo "  - delete /var/lib/snapd/cache files with link count 1"
echo "  - remove old /var/log/amazon/ssm rotated logs"
echo "  - clean old files from /tmp and /var/tmp"
echo "  - force logrotate"
echo "  - restart fail2ban"
`;
  }

  return `
set -euo pipefail

# Ensure files used by active fail2ban jails exist.
if [ ! -f /var/log/fail2ban.log ]; then
  install -m 640 -o root -g adm /dev/null /var/log/fail2ban.log
fi
mkdir -p /var/log/roundcubemail
chown www-data:www-data /var/log/roundcubemail || true
if [ ! -f /var/log/roundcubemail/errors.log ]; then
  install -m 640 -o www-data -g www-data /dev/null /var/log/roundcubemail/errors.log
fi

# Journald cleanup.
journalctl --vacuum-size=${journalVacuumMb}M || true

# Apt cache/list cleanup.
apt-get clean || true
rm -rf /var/lib/apt/lists/* || true

# Snap cleanup.
snap set system refresh.retain=2 || true
if command -v snap >/dev/null 2>&1; then
  snap list --all | awk '/disabled/{print $1, $3}' | while read -r name rev; do
    if [ -n "$name" ] && [ -n "$rev" ]; then
      snap remove "$name" --revision="$rev" || true
    fi
  done
fi
if [ -d /var/lib/snapd/cache ]; then
  find /var/lib/snapd/cache -maxdepth 1 -type f -links 1 -delete || true
fi

# Rotated SSM logs and temp cleanup.
find /var/log/amazon/ssm -type f \\( -name '*.log.[0-9]*' -o -name '*.log.*.gz' \\) -delete 2>/dev/null || true
find /tmp -xdev -type f -mtime +1 -delete 2>/dev/null || true
find /var/tmp -xdev -type f -mtime +1 -delete 2>/dev/null || true

# Standard log rotation.
logrotate -f /etc/logrotate.conf || true

# Bring fail2ban back if possible.
systemctl restart fail2ban || true
`;
}

async function backupMailboxes(
  keyPath: string,
  host: string,
  domain: string,
  options: Options
): Promise<BackupResult> {
  if (options.skipBackup) {
    console.log('⏭️  Skipping backup (--skip-backup)');
    return { executed: false };
  }

  const timestamp = formatTimestamp();
  const destinationRoot =
    options.destinationDir ||
    path.join('Archive', 'backups', domain, 'mailboxes');
  const destinationDir = path.join(destinationRoot, `mailboxes-backup-${timestamp}`);

  fs.mkdirSync(destinationDir, { recursive: true });

  console.log('📦 Backing up remote mailboxes...');
  console.log(`   Destination: ${destinationDir}`);
  if (options.dryRun) {
    console.log('   Mode: DRY RUN (rsync --dry-run)');
  }
  console.log('');

  const existsCheck = await sshCommand(
    keyPath,
    host,
    'test -d /home/user-data/mail/mailboxes && echo OK || echo MISSING',
    false
  );

  if (!existsCheck.stdout.includes('OK')) {
    throw new Error('Remote mailbox path /home/user-data/mail/mailboxes not found.');
  }

  const sshTransport = `ssh -i ${keyPath} -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o ConnectTimeout=15 -o LogLevel=ERROR`;
  const rsyncArgs = [
    '-avz',
    '--progress',
    '--rsync-path',
    'sudo rsync',
    '-e',
    sshTransport,
    `ubuntu@${host}:/home/user-data/mail/mailboxes/`,
    `${destinationDir}/`,
  ];

  if (options.dryRun) {
    rsyncArgs.splice(1, 0, '--dry-run');
  }

  const rsyncResult = await runCommand('rsync', rsyncArgs, { streamOutput: true });
  if (!rsyncResult.success) {
    throw new Error(`Mailbox backup failed: ${rsyncResult.stderr || `exit code ${rsyncResult.code}`}`);
  }

  if (options.dryRun) {
    return {
      executed: true,
      destinationDir,
    };
  }

  const counts = countEntries(destinationDir);
  const sizeKb = await directorySizeKb(destinationDir);
  const backupResult: BackupResult = {
    executed: true,
    destinationDir,
    fileCount: counts.files,
    directoryCount: counts.directories,
    sizeKb,
  };

  if (!options.noTar) {
    const tarPath = `${destinationDir}.tar.gz`;
    console.log('\n📦 Creating tar archive...');
    const tarResult = await runCommand(
      'tar',
      ['-czf', tarPath, '-C', destinationRoot, path.basename(destinationDir)],
      { streamOutput: true }
    );
    if (!tarResult.success) {
      throw new Error(`Failed to create tar archive: ${tarResult.stderr || `exit code ${tarResult.code}`}`);
    }

    const sha = await sha256File(tarPath);
    const shaPath = `${tarPath}.sha256`;
    fs.writeFileSync(shaPath, `${sha}  ${tarPath}\n`, 'utf8');
    backupResult.tarPath = tarPath;
    backupResult.sha256 = sha;
    console.log(`✅ Tar created: ${tarPath}`);
    console.log(`✅ SHA256: ${sha}`);
  }

  return backupResult;
}

async function cleanupDisk(
  keyPath: string,
  host: string,
  options: Options
): Promise<CleanupResult> {
  if (options.skipCleanup) {
    console.log('⏭️  Skipping cleanup (--skip-cleanup)');
    return { executed: false };
  }

  const beforeDisk = await getDiskUsage(keyPath, host);
  console.log('\n🧹 Running disk cleanup...');
  console.log(`   Before: ${beforeDisk.used}/${beforeDisk.total} (${beforeDisk.percent})`);
  console.log(`   Mode: ${options.dryRun ? 'DRY RUN' : 'APPLY'}\n`);

  const journalVacuumMb =
    options.journalVacuumMb ||
    Number(process.env.JOURNAL_VACUUM_MB || 100) ||
    100;

  const script = cleanupScript(journalVacuumMb, Boolean(options.dryRun));
  const result = await runRemoteScript(keyPath, host, script, true);
  if (!result.success) {
    throw new Error(`Cleanup script failed: ${result.stderr || `exit code ${result.code}`}`);
  }

  const afterDisk = await getDiskUsage(keyPath, host);
  console.log(`\n✅ Cleanup complete`);
  console.log(`   After:  ${afterDisk.used}/${afterDisk.total} (${afterDisk.percent})`);

  return {
    executed: true,
    beforeDisk,
    afterDisk,
  };
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));

  const region = options.region || process.env.AWS_REGION || 'us-east-1';
  const profile = options.profile || process.env.AWS_PROFILE || 'hepe-admin-mfa';
  const appPath = options.appPath || process.env.APP_PATH || 'apps/cdk-k3frame/instance';

  if (!options.stackName && !options.domain && !appPath) {
    throw new Error('Cannot resolve target stack. Provide --domain, --app-path, or --stack-name.');
  }

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🛠️  Mail Backup + Disk Cleanup');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  console.log(`   Region: ${region}`);
  console.log(`   Profile: ${profile}`);
  console.log(`   App Path: ${appPath}`);
  if (options.stackName) console.log(`   Stack Name: ${options.stackName}`);
  if (options.domain) console.log(`   Domain (input): ${options.domain}`);
  console.log(`   Dry Run: ${options.dryRun ? 'Yes' : 'No'}`);
  console.log('');

  const stackInfo = await resolveStack(options, region, profile);

  if (!stackInfo.instancePublicIp) {
    throw new Error(`Could not resolve instance public IP from stack ${stackInfo.stackName}`);
  }
  if (!stackInfo.instanceId) {
    throw new Error(`Could not resolve instance ID from stack ${stackInfo.stackName}`);
  }

  const domain = stackInfo.domain;
  const host = stackInfo.instancePublicIp;

  let keyPath = options.sshKeyPath;
  if (!keyPath) {
    keyPath = await getSshKeyPath({
      appPath: options.stackName ? undefined : appPath,
      stackName: options.stackName,
      domain,
      region,
      profile,
      ensureSetup: true,
    }) || undefined;
  }

  if (!keyPath) {
    throw new Error('SSH key path could not be resolved. Use --ssh-key-path or run SSH setup first.');
  }

  if (!fs.existsSync(keyPath)) {
    throw new Error(`SSH key file not found: ${keyPath}`);
  }

  console.log('✅ Resolved target');
  console.log(`   Domain: ${domain}`);
  console.log(`   Stack: ${stackInfo.stackName}`);
  console.log(`   Instance: ${stackInfo.instanceId}`);
  console.log(`   IP: ${host}`);
  console.log(`   SSH Key: ${keyPath}`);
  console.log('');

  const backup = await backupMailboxes(keyPath, host, domain, options);
  const cleanup = await cleanupDisk(keyPath, host, options);

  const finalChecks: FinalChecks = {
    services: {},
    mailQueue: 'unknown',
    disk: { total: 'unknown', used: 'unknown', available: 'unknown', percent: 'unknown' },
  };

  try {
    finalChecks.services = await getServiceStates(keyPath, host);
  } catch (error) {
    console.warn(`⚠️  Could not read final service states: ${String(error)}`);
  }

  try {
    finalChecks.mailQueue = await getMailQueueSummary(keyPath, host);
  } catch (error) {
    console.warn(`⚠️  Could not read final mail queue: ${String(error)}`);
  }

  try {
    finalChecks.disk = await getDiskUsage(keyPath, host);
  } catch (error) {
    console.warn(`⚠️  Could not read final disk usage: ${String(error)}`);
  }

  const report: RunReport = {
    timestamp: new Date().toISOString(),
    domain,
    stackName: stackInfo.stackName,
    instanceId: stackInfo.instanceId,
    instanceIp: host,
    dryRun: Boolean(options.dryRun),
    backup,
    cleanup,
    finalChecks,
  };

  const reportPath = `./backup-cleanup-report-${domain}-${Date.now()}.json`;
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📊 Summary');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  if (backup.executed) {
    console.log(`   Backup dir: ${backup.destinationDir}`);
    if (backup.tarPath) console.log(`   Backup tar: ${backup.tarPath}`);
    if (backup.sha256) console.log(`   SHA256: ${backup.sha256}`);
  } else {
    console.log('   Backup: skipped');
  }
  if (cleanup.executed && cleanup.beforeDisk && cleanup.afterDisk) {
    console.log(
      `   Disk: ${cleanup.beforeDisk.percent} -> ${cleanup.afterDisk.percent}`
    );
  } else {
    console.log('   Cleanup: skipped');
  }
  console.log(`   Services: ${JSON.stringify(finalChecks.services)}`);
  console.log(`   Mail queue: ${finalChecks.mailQueue}`);
  console.log(`   Final disk: ${finalChecks.disk.used}/${finalChecks.disk.total} (${finalChecks.disk.percent})`);
  console.log(`   Report: ${path.resolve(reportPath)}\n`);
}

if (require.main === module) {
  main().catch((error) => {
    console.error('\n❌ Backup+Cleanup failed:');
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
