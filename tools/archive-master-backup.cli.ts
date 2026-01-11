#!/usr/bin/env ts-node

import * as fs from 'node:fs';
import * as path from 'node:path';
import { spawn } from 'child_process';

interface ArchiveMasterBackupOptions {
  masterBackupDir: string;
  archiveBaseDir?: string;
  timestamp?: string;
}

/**
 * Archive master backup folder with timestamp
 */
async function archiveMasterBackup(options: ArchiveMasterBackupOptions): Promise<void> {
  if (!fs.existsSync(options.masterBackupDir)) {
    throw new Error(`Master backup directory does not exist: ${options.masterBackupDir}`);
  }

  // Generate timestamp if not provided
  const timestamp = options.timestamp || new Date().toISOString()
    .replace(/[:.]/g, '-')
    .replace('T', '_')
    .slice(0, -5); // Remove timezone

  // Determine archive base directory
  const archiveBaseDir = options.archiveBaseDir || path.dirname(options.masterBackupDir);
  const masterBackupName = path.basename(options.masterBackupDir);
  const archiveName = `${masterBackupName}-${timestamp}`;
  const archivePath = path.join(archiveBaseDir, archiveName);

  console.log('📦 Archive Master Backup Folder');
  console.log(`   Master backup: ${options.masterBackupDir}`);
  console.log(`   Archive destination: ${archivePath}`);
  console.log(`   Timestamp: ${timestamp}\n`);

  try {
    // Check if archive already exists
    if (fs.existsSync(archivePath)) {
      throw new Error(`Archive already exists: ${archivePath}`);
    }

    // Create archive directory
    console.log('📋 Step 1: Creating archive directory...');
    fs.mkdirSync(archiveBaseDir, { recursive: true });
    console.log(`✅ Archive directory ready\n`);

    // Copy master backup to archive using rsync
    console.log('📋 Step 2: Copying files to archive...');
    
    await new Promise<void>((resolve, reject) => {
      const rsyncArgs = [
        '-av',
        '--progress',
        `${options.masterBackupDir}/`,
        `${archivePath}/`,
      ];
      
      const rsync = spawn('rsync', rsyncArgs);
      
      let output = '';
      rsync.stdout.on('data', (data) => {
        output += data.toString();
        // Show progress
        const lines = output.split('\n');
        const lastLine = lines[lines.length - 2];
        if (lastLine && lastLine.includes('%')) {
          process.stdout.write(`\r   ${lastLine}`);
        }
      });
      
      rsync.stderr.on('data', (data) => {
        output += data.toString();
      });
      
      rsync.on('close', (code) => {
        process.stdout.write('\n');
        if (code === 0) {
          console.log(`✅ Archive created successfully\n`);
          resolve();
        } else {
          reject(new Error(`rsync failed with code ${code}`));
        }
      });
      
      rsync.on('error', (error) => {
        reject(error);
      });
    });

    // Calculate archive size
    const archiveSize = calculateDirectorySize(archivePath);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✅ Archive Complete');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    console.log(`   Archive path: ${archivePath}`);
    console.log(`   Archive size: ${(archiveSize / 1024 / 1024).toFixed(2)} MB\n`);

  } catch (error) {
    console.error('\n❌ Failed to archive master backup:');
    if (error instanceof Error) {
      console.error(`   ${error.message}\n`);
    } else {
      console.error(`   ${String(error)}\n`);
    }
    process.exit(1);
  }
}

/**
 * Calculate directory size recursively
 */
function calculateDirectorySize(dirPath: string): number {
  let totalSize = 0;
  
  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    
    for (const entry of entries) {
      const entryPath = path.join(dirPath, entry.name);
      
      if (entry.isFile()) {
        try {
          const stats = fs.statSync(entryPath);
          totalSize += stats.size;
        } catch {
          // Skip files that can't be accessed
        }
      } else if (entry.isDirectory()) {
        totalSize += calculateDirectorySize(entryPath);
      }
    }
  } catch {
    // Skip directories that can't be accessed
  }
  
  return totalSize;
}

// Parse command line arguments
const args = process.argv.slice(2);
const options: ArchiveMasterBackupOptions = {
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

// Parse --archive-base-dir
const archiveBaseDirIndex = args.indexOf('--archive-base-dir');
if (archiveBaseDirIndex !== -1 && args[archiveBaseDirIndex + 1]) {
  options.archiveBaseDir = args[archiveBaseDirIndex + 1];
}

// Parse --timestamp
const timestampIndex = args.indexOf('--timestamp');
if (timestampIndex !== -1 && args[timestampIndex + 1]) {
  options.timestamp = args[timestampIndex + 1];
}

// Run if executed directly
if (require.main === module) {
  archiveMasterBackup(options).catch((error) => {
    console.error('Unhandled error:', error);
    process.exit(1);
  });
}


