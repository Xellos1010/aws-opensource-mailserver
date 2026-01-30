#!/usr/bin/env ts-node

import { getStackInfoFromApp } from '@mm/admin-stack-info';
import { getSshKeyPath } from '@mm/admin-ssh';
import { spawn } from 'child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';

interface PullMailboxesOptions {
  destinationDir?: string;
  users?: string[];
  domain?: string;
  appPath?: string;
  region?: string;
  profile?: string;
  dryRun?: boolean;
}

async function listRemoteMailboxes(
  instanceIp: string,
  keyPath: string,
  domain: string
): Promise<string[]> {
  const command = `sudo ls -1 /home/user-data/mail/mailboxes/${domain}`;
  const sshArgs = [
    '-i',
    keyPath,
    '-o',
    'StrictHostKeyChecking=no',
    '-o',
    'UserKnownHostsFile=/dev/null',
    '-o',
    'ConnectTimeout=10',
    `ubuntu@${instanceIp}`,
    command,
  ];

  return new Promise((resolve, reject) => {
    const ssh = spawn('ssh', sshArgs);
    let output = '';
    let errorOutput = '';

    ssh.stdout.on('data', (data) => {
      output += data.toString();
    });

    ssh.stderr.on('data', (data) => {
      errorOutput += data.toString();
    });

    ssh.on('close', (code) => {
      if (code === 0) {
        const users = output
          .split('\n')
          .map(line => line.trim())
          .filter(line => line.length > 0 && !line.startsWith('.'));
        resolve(users);
      } else {
        reject(new Error(errorOutput || `ssh failed with code ${code}`));
      }
    });

    ssh.on('error', (error) => {
      reject(error);
    });
  });
}

async function pullMailboxes(options: PullMailboxesOptions): Promise<void> {
  const region = options.region || process.env.AWS_REGION || 'us-east-1';
  const profile = options.profile || process.env.AWS_PROFILE || 'hepe-admin-mfa';
  const appPath = options.appPath || process.env.APP_PATH || 'apps/cdk-emc-notary/instance';
  const domain = options.domain || process.env.DOMAIN;

  if (!domain && !appPath) {
    throw new Error('Cannot resolve domain. Provide domain or appPath');
  }

  const resolvedDomain = domain || 'emcnotary.com';
  const destinationDir =
    options.destinationDir ||
    process.env.DESTINATION_DIR ||
    path.join('Archive', 'backups', resolvedDomain, 'mailboxes');

  fs.mkdirSync(destinationDir, { recursive: true });

  console.log('⬇️  Pull Mailboxes From Server');
  console.log(`   Domain: ${resolvedDomain}`);
  console.log(`   Destination: ${destinationDir}`);
  console.log(`   Dry run: ${options.dryRun ? 'Yes' : 'No'}\n`);

  try {
    console.log('📋 Step 1: Getting stack information...');
    const stackInfo = await getStackInfoFromApp(appPath, {
      domain: resolvedDomain,
      region,
      profile,
    });

    if (!stackInfo.instanceId) {
      throw new Error('Instance ID not found in stack outputs');
    }

    if (!stackInfo.instancePublicIp) {
      throw new Error('Instance public IP not found');
    }

    const instanceIp = stackInfo.instancePublicIp;
    console.log(`✅ Found instance: ${stackInfo.instanceId}`);
    console.log(`   IP: ${instanceIp}\n`);

    console.log('📋 Step 2: Getting SSH key...');
    const keyPath = await getSshKeyPath({
      appPath,
      domain: resolvedDomain,
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

    console.log('📋 Step 3: Discovering mailboxes...');
    const users = options.users && options.users.length > 0
      ? options.users
      : await listRemoteMailboxes(instanceIp, keyPath, resolvedDomain);

    if (users.length === 0) {
      throw new Error('No mailboxes found');
    }

    console.log(`✅ Found ${users.length} mailbox(es)\n`);

    console.log('📋 Step 4: Pulling mailboxes...\n');

    let successCount = 0;
    let failCount = 0;

    for (const username of users) {
      const localMailboxPath = path.join(destinationDir, resolvedDomain, username);
      const remoteMailboxPath = `/home/user-data/mail/mailboxes/${resolvedDomain}/${username}`;

      fs.mkdirSync(localMailboxPath, { recursive: true });

      console.log(`Pulling ${username}@${resolvedDomain}...`);

      const rsyncArgs = [
        '-avz',
        '--ignore-existing',
        '--exclude=dovecot-*',
        '--exclude=dovecot.index*',
        '--exclude=subscriptions',
        '--exclude=maildirfolder',
        '--rsync-path',
        'sudo rsync',
        '-e',
        `ssh -i ${keyPath} -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o ConnectTimeout=10`,
        `ubuntu@${instanceIp}:${remoteMailboxPath}/`,
        `${localMailboxPath}/`,
      ];

      if (options.dryRun) {
        rsyncArgs.push('--dry-run');
      }

      try {
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
              console.log(`   ✅ Pulled (${filesTransferred} files)\n`);
              resolve();
            } else {
              reject(new Error(output.trim() || `rsync failed with code ${code}`));
            }
          });

          rsync.on('error', (error) => {
            reject(error);
          });
        });
        successCount++;
      } catch (error) {
        failCount++;
        console.log(`   ❌ Pull failed`);
        if (error instanceof Error && error.message) {
          console.log(`   ${error.message}\n`);
        } else {
          console.log(`   ${String(error)}\n`);
        }
      }
    }

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✅ Pull Complete');
    console.log(`   Successful: ${successCount}`);
    console.log(`   Failed: ${failCount}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    if (failCount > 0) {
      process.exit(1);
    }

  } catch (error) {
    console.error('\n❌ Failed to pull mailboxes:');
    if (error instanceof Error) {
      console.error(`   ${error.message}\n`);
    } else {
      console.error(`   ${String(error)}\n`);
    }
    process.exit(1);
  }
}

const args = process.argv.slice(2);
const options: PullMailboxesOptions = {};

const destinationDirIndex = args.indexOf('--destination-dir');
if (destinationDirIndex !== -1 && args[destinationDirIndex + 1]) {
  options.destinationDir = args[destinationDirIndex + 1];
}

const usersIndex = args.indexOf('--users');
if (usersIndex !== -1 && args[usersIndex + 1]) {
  options.users = args[usersIndex + 1].split(',').map(u => u.trim()).filter(Boolean);
}

if (args.includes('--dry-run')) {
  options.dryRun = true;
}

if (require.main === module) {
  pullMailboxes(options).catch((error) => {
    console.error('Unhandled error:', error);
    process.exit(1);
  });
}

export { pullMailboxes };

