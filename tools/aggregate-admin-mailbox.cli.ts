#!/usr/bin/env ts-node

import { getStackInfoFromApp } from '@mm/admin-stack-info';
import { getSshKeyPath } from '@mm/admin-ssh';
import { spawn } from 'child_process';
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

interface AggregateAdminMailboxOptions {
  sourcePath: string;
  user?: string;
  domain?: string;
  appPath?: string;
  region?: string;
  profile?: string;
  stagingDir?: string;
  dryRun?: boolean;
}

const DELETED_DIRS = new Set(['.Trash', '.Deleted', '.Junk', '.Spam']);

function isDeletedFlag(filename: string): boolean {
  return filename.includes(':2,') && filename.includes('T');
}

function isTrashPath(filePath: string): boolean {
  return filePath.split(path.sep).some((segment) => DELETED_DIRS.has(segment));
}

function readMessageId(content: string): string | null {
  const headerEnd = content.indexOf('\n\n');
  const headerBlock = headerEnd === -1 ? content : content.slice(0, headerEnd);
  const lines = headerBlock.split('\n');
  let currentHeader = '';
  let currentValue = '';

  for (const line of lines) {
    if (line.startsWith(' ') || line.startsWith('\t')) {
      currentValue += ` ${line.trim()}`;
      continue;
    }

    if (currentHeader.toLowerCase() === 'message-id') {
      return currentValue.trim().replace(/[<>]/g, '') || null;
    }

    const [name, ...rest] = line.split(':');
    currentHeader = name || '';
    currentValue = rest.join(':').trim();
  }

  if (currentHeader.toLowerCase() === 'message-id') {
    return currentValue.trim().replace(/[<>]/g, '') || null;
  }

  return null;
}

function computeMessageKey(buffer: Buffer): string {
  const content = buffer.toString('utf8');
  const messageId = readMessageId(content);
  if (messageId) {
    return `mid:${messageId.toLowerCase()}`;
  }
  return `sha:${crypto.createHash('sha256').update(buffer).digest('hex')}`;
}

function copyWithDedupe(
  sourceFiles: string[],
  destinationDir: string,
  seen: Set<string>
): { copied: number; skippedDuplicate: number; skippedDeleted: number } {
  let copied = 0;
  let skippedDuplicate = 0;
  let skippedDeleted = 0;

  for (const filePath of sourceFiles) {
    if (isTrashPath(filePath) || isDeletedFlag(path.basename(filePath))) {
      skippedDeleted++;
      continue;
    }

    const buffer = fs.readFileSync(filePath);
    const key = computeMessageKey(buffer);
    if (seen.has(key)) {
      skippedDuplicate++;
      continue;
    }
    seen.add(key);

    const destPath = path.join(destinationDir, path.basename(filePath));
    fs.copyFileSync(filePath, destPath);
    copied++;
  }

  return { copied, skippedDuplicate, skippedDeleted };
}

function listMaildirFiles(dirPath: string): string[] {
  if (!fs.existsSync(dirPath)) {
    return [];
  }
  return fs
    .readdirSync(dirPath, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => path.join(dirPath, entry.name));
}

async function aggregateAdminMailbox(options: AggregateAdminMailboxOptions): Promise<void> {
  const region = options.region || process.env.AWS_REGION || 'us-east-1';
  const profile = options.profile || process.env.AWS_PROFILE || 'hepe-admin-mfa';
  const appPath = options.appPath || process.env.APP_PATH || 'apps/cdk-emc-notary/instance';
  const domain = options.domain || process.env.DOMAIN || 'emcnotary.com';
  const user = options.user || 'admin';

  if (!options.sourcePath) {
    throw new Error('Missing --source-path');
  }

  if (!fs.existsSync(options.sourcePath)) {
    throw new Error(`Source path does not exist: ${options.sourcePath}`);
  }

  const stagingDir =
    options.stagingDir ||
    path.join(
      'Archive',
      'staging',
      domain,
      `${user}-${new Date().toISOString().replace(/[:.]/g, '-')}`
    );

  const stagingMailboxRoot = path.join(stagingDir, user);
  const stagingInboxCur = path.join(stagingMailboxRoot, 'cur');
  const stagingInboxNew = path.join(stagingMailboxRoot, 'new');
  const stagingSentCur = path.join(stagingMailboxRoot, '.Sent', 'cur');
  const stagingSentNew = path.join(stagingMailboxRoot, '.Sent', 'new');

  fs.mkdirSync(stagingInboxCur, { recursive: true });
  fs.mkdirSync(stagingInboxNew, { recursive: true });
  fs.mkdirSync(stagingSentCur, { recursive: true });
  fs.mkdirSync(stagingSentNew, { recursive: true });

  console.log('📦 Aggregate Admin Mailbox');
  console.log(`   Domain: ${domain}`);
  console.log(`   User: ${user}`);
  console.log(`   Source: ${options.sourcePath}`);
  console.log(`   Staging: ${stagingDir}`);
  console.log(`   Dry run: ${options.dryRun ? 'Yes' : 'No'}\n`);

  const seen = new Set<string>();
  const inboxCur = listMaildirFiles(path.join(options.sourcePath, 'cur'));
  const inboxNew = listMaildirFiles(path.join(options.sourcePath, 'new'));
  const sentCur = listMaildirFiles(path.join(options.sourcePath, '.Sent', 'cur'));
  const sentNew = listMaildirFiles(path.join(options.sourcePath, '.Sent', 'new'));

  console.log('📋 Step 1: Aggregating mail (dedupe + skip deleted)...');
  const inboxCurResult = copyWithDedupe(inboxCur, stagingInboxCur, seen);
  const inboxNewResult = copyWithDedupe(inboxNew, stagingInboxNew, seen);
  const sentCurResult = copyWithDedupe(sentCur, stagingSentCur, seen);
  const sentNewResult = copyWithDedupe(sentNew, stagingSentNew, seen);

  const totalCopied =
    inboxCurResult.copied +
    inboxNewResult.copied +
    sentCurResult.copied +
    sentNewResult.copied;
  const totalSkippedDuplicate =
    inboxCurResult.skippedDuplicate +
    inboxNewResult.skippedDuplicate +
    sentCurResult.skippedDuplicate +
    sentNewResult.skippedDuplicate;
  const totalSkippedDeleted =
    inboxCurResult.skippedDeleted +
    inboxNewResult.skippedDeleted +
    sentCurResult.skippedDeleted +
    sentNewResult.skippedDeleted;

  console.log(`✅ Aggregated mail: ${totalCopied} files`);
  console.log(`   Skipped duplicates: ${totalSkippedDuplicate}`);
  console.log(`   Skipped deleted/trash: ${totalSkippedDeleted}\n`);

  if (options.dryRun) {
    console.log('Dry run enabled, skipping upload.');
    return;
  }

  console.log('📋 Step 2: Uploading to server...');
  const stackInfo = await getStackInfoFromApp(appPath, {
    domain,
    region,
    profile,
  });

  if (!stackInfo.instanceId || !stackInfo.instancePublicIp) {
    throw new Error('Instance ID or IP not found in stack outputs');
  }

  const keyPath = await getSshKeyPath({
    appPath,
    domain,
    region,
    profile,
    ensureSetup: true,
  });

  if (!keyPath) {
    throw new Error('SSH key not found. Run: pnpm nx run cdk-emcnotary-instance:admin:ssh:setup');
  }

  const instanceIp = stackInfo.instancePublicIp;
  const remoteMailboxPath = `/home/user-data/mail/mailboxes/${domain}/${user}`;

  const rsyncArgs = [
    '-avz',
    '--ignore-existing',
    '--exclude=dovecot-*',
    '--exclude=dovecot.index*',
    '--exclude=subscriptions',
    '--exclude=maildirfolder',
    '--rsync-path',
    'sudo rsync',
    `${stagingMailboxRoot}/`,
    '-e',
    `ssh -i ${keyPath} -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o ConnectTimeout=10`,
    `ubuntu@${instanceIp}:${remoteMailboxPath}/`,
  ];

  await new Promise<void>((resolve, reject) => {
    const rsync = spawn('rsync', rsyncArgs);
    let output = '';

    rsync.stdout.on('data', (data) => {
      output += data.toString();
    });

    rsync.stderr.on('data', (data) => {
      output += data.toString();
    });

    rsync.on('close', (code) => {
      if (code === 0) {
        const filesTransferred = (output.match(/^\S+\s+\d+\s+\d+%/gm) || []).length;
        console.log(`✅ Upload complete (${filesTransferred} files transferred)\n`);
        resolve();
      } else {
        reject(new Error(output.trim() || `rsync failed with code ${code}`));
      }
    });

    rsync.on('error', (error) => {
      reject(error);
    });
  });
}

const args = process.argv.slice(2);
const options: AggregateAdminMailboxOptions = {
  sourcePath: '',
};

const sourceIndex = args.indexOf('--source-path');
if (sourceIndex !== -1 && args[sourceIndex + 1]) {
  options.sourcePath = args[sourceIndex + 1];
}

const userIndex = args.indexOf('--user');
if (userIndex !== -1 && args[userIndex + 1]) {
  options.user = args[userIndex + 1];
}

const domainIndex = args.indexOf('--domain');
if (domainIndex !== -1 && args[domainIndex + 1]) {
  options.domain = args[domainIndex + 1];
}

const stagingIndex = args.indexOf('--staging-dir');
if (stagingIndex !== -1 && args[stagingIndex + 1]) {
  options.stagingDir = args[stagingIndex + 1];
}

if (args.includes('--dry-run')) {
  options.dryRun = true;
}

if (require.main === module) {
  aggregateAdminMailbox(options).catch((error) => {
    console.error('Unhandled error:', error);
    process.exit(1);
  });
}

export { aggregateAdminMailbox };


