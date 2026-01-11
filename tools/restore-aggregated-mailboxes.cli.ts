#!/usr/bin/env ts-node

import { getStackInfoFromApp } from '@mm/admin-stack-info';
import { getSshKeyPath } from '@mm/admin-ssh';
import { getAdminCredentials } from '@mm/admin-credentials';
import { aggregateBackups, findBackupFolders, AggregateBackupsResult } from '@mm/admin-mailbox-restore';
import { restoreMailboxes } from '@mm/admin-mailbox-restore';
import * as path from 'node:path';

interface RestoreAggregatedOptions {
  backupFolders?: string[];
  backupBaseDir?: string;
  domain?: string;
  appPath?: string;
  region?: string;
  profile?: string;
  adminPassword?: string;
  generatePasswords?: boolean;
  skipExistingUsers?: boolean;
  skipExistingEmails?: boolean;
  dryRun?: boolean;
}

/**
 * Restore aggregated mailboxes from multiple backup folders
 */
async function restoreAggregatedMailboxes(options: RestoreAggregatedOptions): Promise<void> {
  const region = options.region || process.env.AWS_REGION || 'us-east-1';
  const profile = options.profile || process.env.AWS_PROFILE || 'hepe-admin-mfa';
  const appPath = options.appPath || process.env.APP_PATH || 'apps/cdk-emc-notary/instance';
  const domain = options.domain || process.env.DOMAIN;
  
  if (!domain && !appPath) {
    throw new Error('Cannot resolve domain. Provide domain or appPath');
  }

  console.log('📦 Restore Aggregated Mailboxes');
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

    // Determine backup folders
    let backupFolders: string[] = [];
    
    if (options.backupFolders && options.backupFolders.length > 0) {
      backupFolders = options.backupFolders;
    } else if (options.backupBaseDir) {
      backupFolders = findBackupFolders(options.backupBaseDir);
    } else {
      // Default to Archive/backups/{domain}/mailboxes
      const defaultBaseDir = path.join('Archive', 'backups', domain!, 'mailboxes');
      backupFolders = findBackupFolders(defaultBaseDir);
    }

    if (backupFolders.length === 0) {
      throw new Error('No backup folders found');
    }

    console.log('📋 Step 3: Aggregating users and emails from backup folders...');
    console.log(`   Found ${backupFolders.length} backup folder(s):`);
    backupFolders.forEach(folder => console.log(`   - ${folder}`));
    console.log('');

    // Aggregate backups
    const aggregateResult = await aggregateBackups(backupFolders, domain!);
    
    console.log(`✅ Aggregation complete:`);
    console.log(`   Users found: ${aggregateResult.totalUsers}`);
    console.log(`   Total emails: ${aggregateResult.totalEmails}`);
    console.log(`   Total size: ${(aggregateResult.totalSize / 1024 / 1024).toFixed(2)} MB\n`);

    // Get admin password if needed
    let adminPassword: string | undefined = options.adminPassword;
    if (!adminPassword) {
      const credentials = await getAdminCredentials({
        appPath,
        domain,
        region,
        profile,
      });
      adminPassword = credentials.password;
    }

    // Restore mailboxes
    console.log('📋 Step 4: Restoring mailboxes...\n');
    const restoreResults = await restoreMailboxes({
      keyPath,
      instanceIp,
      domain: domain!,
      users: aggregateResult.users,
      adminPassword,
      generatePasswords: options.generatePasswords !== false,
      skipExistingUsers: options.skipExistingUsers !== false,
      skipExistingEmails: options.skipExistingEmails !== false,
      dryRun: options.dryRun || false,
    });

    // Print results
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📊 Restore Results');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    let successCount = 0;
    let failCount = 0;
    let totalEmailsRestored = 0;
    let totalEmailsSkipped = 0;

    for (const [email, result] of restoreResults.entries()) {
      if (result.success) {
        successCount++;
        totalEmailsRestored += result.emailsRestored;
        totalEmailsSkipped += result.emailsSkipped;
        
        console.log(`✅ ${email}:`);
        if (result.userCreated) {
          console.log(`   User created: ✅`);
        } else {
          console.log(`   User: ${result.userMessage}`);
        }
        console.log(`   Emails restored: ${result.emailsRestored}`);
        console.log(`   Emails skipped: ${result.emailsSkipped}`);
        console.log(`   Total emails: ${result.totalEmails}\n`);
      } else {
        failCount++;
        console.log(`❌ ${email}:`);
        console.log(`   Error: ${result.error}\n`);
      }
    }

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📊 Summary');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    console.log(`   Users processed: ${restoreResults.size}`);
    console.log(`   Successful: ${successCount}`);
    console.log(`   Failed: ${failCount}`);
    console.log(`   Total emails restored: ${totalEmailsRestored}`);
    console.log(`   Total emails skipped: ${totalEmailsSkipped}\n`);

  } catch (error) {
    console.error('\n❌ Failed to restore aggregated mailboxes:');
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
const options: RestoreAggregatedOptions = {};

// Parse --backup-folders
const foldersIndex = args.indexOf('--backup-folders');
if (foldersIndex !== -1 && args[foldersIndex + 1]) {
  options.backupFolders = args[foldersIndex + 1].split(',').map(f => f.trim());
}

// Parse --backup-base-dir
const baseDirIndex = args.indexOf('--backup-base-dir');
if (baseDirIndex !== -1 && args[baseDirIndex + 1]) {
  options.backupBaseDir = args[baseDirIndex + 1];
}

// Parse --admin-password
const adminPasswordIndex = args.indexOf('--admin-password');
if (adminPasswordIndex !== -1 && args[adminPasswordIndex + 1]) {
  options.adminPassword = args[adminPasswordIndex + 1];
}

// Parse --no-generate-passwords
if (args.includes('--no-generate-passwords')) {
  options.generatePasswords = false;
}

// Parse --no-skip-existing-users
if (args.includes('--no-skip-existing-users')) {
  options.skipExistingUsers = false;
}

// Parse --no-skip-existing-emails
if (args.includes('--no-skip-existing-emails')) {
  options.skipExistingEmails = false;
}

// Parse --dry-run
if (args.includes('--dry-run')) {
  options.dryRun = true;
}

// Run if executed directly
if (require.main === module) {
  restoreAggregatedMailboxes(options).catch((error) => {
    console.error('Unhandled error:', error);
    process.exit(1);
  });
}


