#!/usr/bin/env ts-node

/**
 * Quick restore script for k3-frame.com
 * Restores DNS and mailboxes from Archive backups
 */

import { spawn } from 'child_process';

async function main(): Promise<void> {
  const DOMAIN = process.env.DOMAIN;
  const APP_PATH = process.env.APP_PATH || 'apps/cdk-k3frame/instance';

  if (!DOMAIN) {
    console.error('Error: DOMAIN environment variable is required');
    console.error('Usage: DOMAIN=k3-frame.com pnpm nx run cdk-k3frame-instance:admin:restore:k3frame');
    process.exit(1);
  }

  const MAILBOX_BACKUP_PATH =
    process.env.MAILBOX_BACKUP_PATH ||
    `Archive/backups/${DOMAIN}/mailboxes/mailboxes-backup-20250923_195631`;
  const DNS_BACKUP_PATH =
    process.env.DNS_BACKUP_PATH ||
    `Archive/backups/${DOMAIN}/dns/dns-backup-20250915-120038.json`;

  console.log('🔄 K3 Frame Restore');
  console.log(`   Domain: ${DOMAIN}`);
  console.log(`   App Path: ${APP_PATH}`);
  console.log(`   Mailbox Backup: ${MAILBOX_BACKUP_PATH}`);
  console.log(`   DNS Backup: ${DNS_BACKUP_PATH}\n`);

  // Run the comprehensive test and restore tool
  const args = [
    'exec',
    'tsx',
    '--tsconfig',
    'tools/tsconfig.json',
    'tools/test-and-restore-e2e.cli.ts',
    '--mailbox-backup-path',
    MAILBOX_BACKUP_PATH,
    '--dns-backup-path',
    DNS_BACKUP_PATH,
    '--domain',
    DOMAIN,
  ];

  // Pass APP_PATH to spawned process
  const env = { ...process.env, APP_PATH };
  if (!env.AWS_PROFILE) {
    env.AWS_PROFILE = 'k3frame';
  }
  if (!env.AWS_DEFAULT_PROFILE) {
    env.AWS_DEFAULT_PROFILE = env.AWS_PROFILE;
  }

  // Add dry-run flag if DRY_RUN env var is set
  if (process.env.DRY_RUN === '1') {
    args.push('--dry-run');
  }

  // Add skip flags if set
  if (process.env.SKIP_DEPLOY === '1') {
    args.push('--skip-deploy');
  }
  if (process.env.SKIP_RESTORE === '1') {
    args.push('--skip-restore');
  }
  if (process.env.SKIP_TESTS === '1') {
    args.push('--skip-tests');
  }

  const proc = spawn('pnpm', args, {
    stdio: 'inherit',
    shell: true,
    env,
  });

  await new Promise<void>((resolve, reject) => {
    proc.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Restore process exited with code ${code}`));
      }
    });

    proc.on('error', (error) => {
      reject(error);
    });
  });
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`\n❌ Error: ${String(error)}`);
    if (error instanceof Error && error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  });
}
