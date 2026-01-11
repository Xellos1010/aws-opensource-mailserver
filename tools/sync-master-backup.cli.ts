#!/usr/bin/env ts-node

import { getStackInfoFromApp } from '@mm/admin-stack-info';
import { getSshKeyPath } from '@mm/admin-ssh';
import { spawn } from 'child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';

interface SyncMasterBackupOptions {
  masterBackupDir: string;
  domain?: string;
  appPath?: string;
  region?: string;
  profile?: string;
  dryRun?: boolean;
}

/**
 * Sync master backup folder with mailserver
 */
async function syncMasterBackup(options: SyncMasterBackupOptions): Promise<void> {
  const region = options.region || process.env.AWS_REGION || 'us-east-1';
  const profile = options.profile || process.env.AWS_PROFILE || 'hepe-admin-mfa';
  const appPath = options.appPath || process.env.APP_PATH || 'apps/cdk-emc-notary/instance';
  const domain = options.domain || process.env.DOMAIN;
  
  if (!domain && !appPath) {
    throw new Error('Cannot resolve domain. Provide domain or appPath');
  }

  if (!fs.existsSync(options.masterBackupDir)) {
    throw new Error(`Master backup directory does not exist: ${options.masterBackupDir}`);
  }

  console.log('🔄 Sync Master Backup Folder');
  console.log(`   Domain: ${domain}`);
  console.log(`   Master backup: ${options.masterBackupDir}`);
  console.log(`   Dry run: ${options.dryRun ? 'Yes' : 'No'}\n`);

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

    const instanceIp = stackInfo.instancePublicIp;
    console.log(`✅ Found instance: ${stackInfo.instanceId}`);
    console.log(`   IP: ${instanceIp}\n`);

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

    // Find domain subdirectory in master backup
    const domainPath = path.join(options.masterBackupDir, domain!);
    if (!fs.existsSync(domainPath)) {
      throw new Error(`Domain subdirectory not found: ${domainPath}`);
    }

    // Find all user mailboxes
    console.log('📋 Step 3: Discovering mailboxes...');
    const entries = fs.readdirSync(domainPath, { withFileTypes: true });
    const mailboxes: string[] = [];
    
    for (const entry of entries) {
      if (entry.isDirectory() && !entry.name.startsWith('.')) {
        const mailboxPath = path.join(domainPath, entry.name);
        // Validate Maildir structure
        const hasMaildir = ['cur', 'new', 'tmp'].some(subdir => 
          fs.existsSync(path.join(mailboxPath, subdir))
        );
        if (hasMaildir) {
          mailboxes.push(entry.name);
        }
      }
    }

    console.log(`✅ Found ${mailboxes.length} mailbox(es)\n`);

    // Sync each mailbox
    console.log('📋 Step 4: Syncing mailboxes...\n');
    
    for (const username of mailboxes) {
      const localMailboxPath = path.join(domainPath, username);
      const remoteMailboxPath = `/home/user-data/mail/mailboxes/${domain}/${username}`;
      
      console.log(`Syncing ${username}@${domain}...`);
      
      // Use rsync with --ignore-existing to skip duplicates
      const rsyncArgs = [
        '-avz',
        '--ignore-existing', // Skip files that already exist
        '--exclude=dovecot-*', // Exclude dovecot index files
        '--exclude=dovecot.index*',
        '--exclude=subscriptions',
        '--exclude=maildirfolder',
        `${localMailboxPath}/`,
        `-e`,
        `ssh -i ${keyPath} -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o ConnectTimeout=10`,
        `ubuntu@${instanceIp}:${remoteMailboxPath}/`,
      ];
      
      if (options.dryRun) {
        rsyncArgs.push('--dry-run');
      }
      
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
            // Count files transferred
            const filesTransferred = (output.match(/^\S+\s+\d+\s+\d+%/) || []).length;
            console.log(`   ✅ Synced (${filesTransferred} files)\n`);
            resolve();
          } else {
            console.log(`   ❌ Sync failed\n`);
            reject(new Error(`rsync failed with code ${code}`));
          }
        });
        
        rsync.on('error', (error) => {
          console.log(`   ❌ Sync error: ${error.message}\n`);
          reject(error);
        });
      });
    }

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✅ Sync Complete');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  } catch (error) {
    console.error('\n❌ Failed to sync master backup:');
    if (error instanceof Error) {
      console.error(`   ${error.message}\n`);
    } else {
      console.error(`   ${String(error)}\n`);
    }
    process.exit(1);
  }
}

// Parse command line arguments
const args = process.argv.slice(2);
const options: SyncMasterBackupOptions = {
  masterBackupDir: '',
};

// Parse --master-backup-dir
const masterBackupDirIndex = args.indexOf('--master-backup-dir');
if (masterBackupDirIndex !== -1 && args[masterBackupDirIndex + 1]) {
  options.masterBackupDir = args[masterBackupDirIndex + 1];
} else {
  console.error('Error: --master-backup-dir is required');
  process.exit(1);
}

// Parse --dry-run
if (args.includes('--dry-run')) {
  options.dryRun = true;
}

// Run if executed directly
if (require.main === module) {
  syncMasterBackup(options).catch((error) => {
    console.error('Unhandled error:', error);
    process.exit(1);
  });
}


