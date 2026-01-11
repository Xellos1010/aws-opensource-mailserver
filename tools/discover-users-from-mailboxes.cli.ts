#!/usr/bin/env ts-node

import * as fs from 'node:fs';
import * as path from 'node:path';
import { createReadStream } from 'node:fs';
import { createGunzip } from 'node:zlib';
import { pipeline } from 'node:stream/promises';
import { createWriteStream } from 'node:fs';
import { execSync } from 'child_process';
import * as os from 'node:os';

interface DiscoverUsersOptions {
  backupPath?: string;
  domain?: string;
  output?: string;
  validateStructure?: boolean;
  includeMetadata?: boolean;
  extractTar?: boolean;
  tempDir?: string;
}

interface DiscoveredUser {
  email: string;
  username: string;
  domain: string;
  backupPath: string;
  backupFormat: 'legacy' | 'new' | 'tar.gz';
  mailboxSize?: number;
  fileCount?: number;
  maildirValid: boolean;
}

/**
 * Auto-discover backup path when not provided
 */
function discoverBackupPath(domain?: string): string | null {
  const archiveDir = path.resolve('Archive', 'backups');

  if (!fs.existsSync(archiveDir)) {
    console.warn(`Archive backups directory not found: ${archiveDir}`);
    return null;
  }

  const domainDirs = fs.readdirSync(archiveDir, { withFileTypes: true })
    .filter(dirent => dirent.isDirectory())
    .map(dirent => dirent.name);

  if (domain) {
    // Look for exact domain match
    const mailboxesPath = path.join(archiveDir, domain, 'mailboxes');
    if (fs.existsSync(mailboxesPath)) {
      // Find the latest backup within the mailboxes directory that has the domain subdirectory
      const backupDirs = fs.readdirSync(mailboxesPath, { withFileTypes: true })
        .filter(dirent => dirent.isDirectory() && dirent.name.startsWith('mailboxes-backup-'))
        .map(dirent => ({
          name: dirent.name,
          path: path.join(mailboxesPath, dirent.name),
          mtime: fs.statSync(path.join(mailboxesPath, dirent.name)).mtime,
          hasDomainDir: fs.existsSync(path.join(mailboxesPath, dirent.name, domain))
        }))
        .filter(backup => backup.hasDomainDir)
        .sort((a, b) => b.mtime.getTime() - a.mtime.getTime());

      if (backupDirs.length > 0) {
        const latestBackup = backupDirs[0];
        console.log(`Auto-selected latest backup for ${domain}: ${latestBackup.name} (${latestBackup.mtime.toISOString()})`);
        return latestBackup.path;
      }
    }

    // Try partial match
    const matchingDomain = domainDirs.find(d => d.includes(domain));
    if (matchingDomain) {
      const mailboxesPath = path.join(archiveDir, matchingDomain, 'mailboxes');
      if (fs.existsSync(mailboxesPath)) {
        const backupDirs = fs.readdirSync(mailboxesPath, { withFileTypes: true })
          .filter(dirent => dirent.isDirectory() && dirent.name.startsWith('mailboxes-backup-'))
          .map(dirent => ({
            name: dirent.name,
            path: path.join(mailboxesPath, dirent.name),
            mtime: fs.statSync(path.join(mailboxesPath, dirent.name)).mtime,
            hasDomainDir: fs.existsSync(path.join(mailboxesPath, dirent.name, matchingDomain))
          }))
          .filter(backup => backup.hasDomainDir)
          .sort((a, b) => b.mtime.getTime() - a.mtime.getTime());

        if (backupDirs.length > 0) {
          const latestBackup = backupDirs[0];
          console.log(`Auto-selected latest backup for ${matchingDomain}: ${latestBackup.name} (${latestBackup.mtime.toISOString()})`);
          return latestBackup.path;
        }
      }
    }
  } else {
    // No domain specified, try to find the most recent backup across all domains
    const allBackups: Array<{domain: string, backupName: string, path: string, mtime: Date, hasDomainDir: boolean}> = [];

    for (const domainName of domainDirs) {
      const mailboxesPath = path.join(archiveDir, domainName, 'mailboxes');
      if (fs.existsSync(mailboxesPath)) {
        try {
          const backupDirs = fs.readdirSync(mailboxesPath, { withFileTypes: true })
            .filter(dirent => dirent.isDirectory() && dirent.name.startsWith('mailboxes-backup-'))
            .map(dirent => {
              const backupPath = path.join(mailboxesPath, dirent.name);
              const hasDomainDir = fs.existsSync(path.join(backupPath, domainName));
              return {
                domain: domainName,
                backupName: dirent.name,
                path: backupPath,
                mtime: fs.statSync(backupPath).mtime,
                hasDomainDir
              };
            })
            // Only include backups that have the domain subdirectory
            .filter(backup => backup.hasDomainDir);

          allBackups.push(...backupDirs);
        } catch {
          // Skip domains we can't access
        }
      }
    }

    if (allBackups.length > 0) {
      allBackups.sort((a, b) => b.mtime.getTime() - a.mtime.getTime());
      const latest = allBackups[0];
      console.log(`Auto-selected latest backup across all domains: ${latest.domain}/${latest.backupName} (${latest.mtime.toISOString()})`);
      return latest.path;
    }
  }

  return null;
}

/**
 * Detect backup format from path
 */
function detectBackupFormat(backupPath: string): 'legacy' | 'new' | 'tar.gz' {
  const stat = fs.statSync(backupPath);
  
  if (stat.isFile() && backupPath.endsWith('.tar.gz')) {
    return 'tar.gz';
  }
  
  if (stat.isDirectory()) {
    // Check for legacy format pattern: mailboxes-backup-{timestamp}
    if (backupPath.includes('mailboxes-backup-')) {
      return 'legacy';
    }
    
    // Check for new format pattern: {timestamp}-{runId}
    const dirName = path.basename(backupPath);
    if (/^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z-\w+$/.test(dirName)) {
      return 'new';
    }
    
    // Check parent directory for patterns
    const parentDir = path.dirname(backupPath);
    if (parentDir.includes('mailboxes-backup-')) {
      return 'legacy';
    }
    if (parentDir.match(/\/mail\/\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z-\w+$/)) {
      return 'new';
    }
  }
  
  // Default to new format if we can't determine
  return 'new';
}

/**
 * Extract tar.gz file to temporary directory
 */
async function extractTarGz(
  tarPath: string,
  tempDir: string
): Promise<string> {
  console.log(`Extracting ${tarPath} to ${tempDir}...`);
  
  const extractDir = path.join(tempDir, `extracted-${Date.now()}`);
  fs.mkdirSync(extractDir, { recursive: true });
  
  // Use tar command to extract
  try {
    execSync(`tar -xzf "${tarPath}" -C "${extractDir}"`, {
      stdio: 'inherit',
    });
    console.log(`Extraction complete: ${extractDir}`);
    return extractDir;
  } catch (error) {
    throw new Error(`Failed to extract tar.gz: ${String(error)}`);
  }
}

/**
 * Auto-detect domain from backup path structure
 */
function detectDomain(backupPath: string, format: 'legacy' | 'new' | 'tar.gz'): string | null {
  // Try to find domain in path structure
  const parts = backupPath.split(path.sep);
  
  // Look for domain patterns (e.g., emcnotary.com, askdaokapra.com)
  for (const part of parts) {
    if (part.includes('.com') || part.includes('.org') || part.includes('.net')) {
      return part;
    }
  }
  
  // Check parent directories
  let currentPath = backupPath;
  for (let i = 0; i < 5; i++) {
    const parent = path.dirname(currentPath);
    const parentName = path.basename(parent);
    if (parentName.includes('.com') || parentName.includes('.org') || parentName.includes('.net')) {
      return parentName;
    }
    currentPath = parent;
    if (currentPath === '/' || currentPath === parent) {
      break;
    }
  }
  
  return null;
}

/**
 * Validate Maildir structure
 */
function validateMaildir(mailboxPath: string): boolean {
  try {
    const curDir = path.join(mailboxPath, 'cur');
    const newDir = path.join(mailboxPath, 'new');
    const tmpDir = path.join(mailboxPath, 'tmp');
    
    return (
      fs.existsSync(curDir) &&
      fs.statSync(curDir).isDirectory() &&
      fs.existsSync(newDir) &&
      fs.statSync(newDir).isDirectory() &&
      fs.existsSync(tmpDir) &&
      fs.statSync(tmpDir).isDirectory()
    );
  } catch {
    return false;
  }
}

/**
 * Calculate directory size and file count
 */
function calculateMailboxStats(mailboxPath: string): { size: number; fileCount: number } {
  let size = 0;
  let fileCount = 0;
  
  function walkDir(dir: string): void {
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        try {
          if (entry.isDirectory()) {
            walkDir(fullPath);
          } else if (entry.isFile()) {
            const stat = fs.statSync(fullPath);
            size += stat.size;
            fileCount++;
          }
        } catch {
          // Skip files we can't access
        }
      }
    } catch {
      // Skip directories we can't access
    }
  }
  
  walkDir(mailboxPath);
  return { size, fileCount };
}

/**
 * Discover users from mailbox backup
 */
async function discoverUsers(options: DiscoverUsersOptions): Promise<DiscoveredUser[]> {
  const {
    backupPath,
    domain,
    validateStructure = true,
    includeMetadata = false,
    extractTar = true,
    tempDir,
  } = options;
  
  // Validate backup path exists
  if (!fs.existsSync(backupPath)) {
    throw new Error(`Backup path does not exist: ${backupPath}`);
  }
  
  // Detect backup format
  const format = detectBackupFormat(backupPath);
  console.log(`Detected backup format: ${format}`);
  
  // Handle tar.gz extraction
  let workingPath = backupPath;
  let extractedDir: string | null = null;
  
  if (format === 'tar.gz' && extractTar) {
    const tempExtractDir = tempDir || os.tmpdir();
    extractedDir = await extractTarGz(backupPath, tempExtractDir);
    workingPath = extractedDir;
  }
  
  // Auto-detect domain if not provided
  let detectedDomain = domain;
  if (!detectedDomain) {
    detectedDomain = detectDomain(workingPath, format) || null;
    if (detectedDomain) {
      console.log(`Auto-detected domain: ${detectedDomain}`);
    } else {
      throw new Error(
        'Domain not provided and could not be auto-detected. ' +
        'Please specify --domain option.'
      );
    }
  }
  
  // Find domain subdirectory based on format
  let domainPath: string | null = null;
  
  if (format === 'legacy') {
    // Legacy format: Archive/backups/{domain}/mailboxes/mailboxes-backup-{timestamp}/{domain}/{username}/
    // Look for domain subdirectory
    const entries = fs.readdirSync(workingPath, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory() && entry.name === detectedDomain) {
        domainPath = path.join(workingPath, entry.name);
        break;
      }
    }
  } else if (format === 'new') {
    // New format: dist/backups/{domain-name}/mail/{timestamp}-{runId}/{domain}/{username}/
    // Look for domain subdirectory
    const entries = fs.readdirSync(workingPath, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory() && entry.name === detectedDomain) {
        domainPath = path.join(workingPath, entry.name);
        break;
      }
    }
  }
  
  if (!domainPath || !fs.existsSync(domainPath)) {
    throw new Error(
      `Domain subdirectory not found: ${detectedDomain}. ` +
      `Expected structure: {backup-path}/${detectedDomain}/`
    );
  }
  
  console.log(`Scanning domain directory: ${domainPath}`);
  
  // Scan for user directories
  const discoveredUsers: DiscoveredUser[] = [];
  const entries = fs.readdirSync(domainPath, { withFileTypes: true });
  
  for (const entry of entries) {
    // Skip system directories
    if (entry.name.startsWith('.') || entry.name === '..') {
      continue;
    }
    
    if (!entry.isDirectory()) {
      continue;
    }
    
    const username = entry.name;
    const mailboxPath = path.join(domainPath, username);
    
    // Validate Maildir structure if requested
    let maildirValid = true;
    if (validateStructure) {
      maildirValid = validateMaildir(mailboxPath);
      if (!maildirValid) {
        console.warn(`Warning: Invalid Maildir structure for ${username}, skipping...`);
        continue;
      }
    }
    
    // Calculate metadata if requested
    let mailboxSize: number | undefined;
    let fileCount: number | undefined;
    if (includeMetadata) {
      const stats = calculateMailboxStats(mailboxPath);
      mailboxSize = stats.size;
      fileCount = stats.fileCount;
    }
    
    const email = `${username}@${detectedDomain}`;
    
    discoveredUsers.push({
      email,
      username,
      domain: detectedDomain,
      backupPath: mailboxPath,
      backupFormat: format,
      mailboxSize,
      fileCount,
      maildirValid,
    });
  }
  
  // Clean up extracted directory if we created it
  if (extractedDir && fs.existsSync(extractedDir)) {
    console.log(`Cleaning up extracted directory: ${extractedDir}`);
    fs.rmSync(extractedDir, { recursive: true, force: true });
  }
  
  return discoveredUsers;
}

/**
 * Main function
 */
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const options: DiscoverUsersOptions = {
    backupPath: '',
    validateStructure: true,
    includeMetadata: false,
    extractTar: true,
  };
  
  // Parse arguments
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    if (arg === '--backup-path' && args[i + 1]) {
      options.backupPath = args[i + 1];
      i++;
    } else if (arg === '--domain' && args[i + 1]) {
      options.domain = args[i + 1];
      i++;
    } else if (arg === '--output' && args[i + 1]) {
      options.output = args[i + 1];
      i++;
    } else if (arg === '--validate-structure') {
      options.validateStructure = args[i + 1] !== 'false';
      i++;
    } else if (arg === '--include-metadata') {
      options.includeMetadata = args[i + 1] !== 'false';
      i++;
    } else if (arg === '--extract-tar') {
      options.extractTar = args[i + 1] !== 'false';
      i++;
    } else if (arg === '--temp-dir' && args[i + 1]) {
      options.tempDir = args[i + 1];
      i++;
    }
  }
  
  // Auto-discover backup path if not provided
  if (!options.backupPath) {
    console.log('No backup path specified, attempting auto-discovery...');
    options.backupPath = discoverBackupPath(options.domain);

    if (!options.backupPath) {
      console.error('Error: Could not auto-discover backup path.');
      console.error('Please specify --backup-path or ensure backups exist in Archive/backups/');
      console.error('');
      console.error('Available domains with backups:');
      try {
        const archiveDir = path.resolve('Archive', 'backups');
        if (fs.existsSync(archiveDir)) {
          const domains = fs.readdirSync(archiveDir, { withFileTypes: true })
            .filter(dirent => dirent.isDirectory() && fs.existsSync(path.join(archiveDir, dirent.name, 'mailboxes')))
            .map(dirent => dirent.name);
          if (domains.length > 0) {
            domains.forEach(domain => console.error(`  - ${domain}`));
          } else {
            console.error('  No domains with mailbox backups found');
          }
        }
      } catch (error) {
        console.error('  Could not scan for available backups');
      }
      process.exit(1);
    }

    console.log(`Auto-discovered backup path: ${options.backupPath}`);
  }
  
  try {
    console.log('Discovering users from mailbox backup...');
    console.log(`Backup path: ${options.backupPath}`);
    
    const users = await discoverUsers(options);
    
    console.log(`\nDiscovered ${users.length} users:`);
    users.forEach((user) => {
      console.log(`  - ${user.email} (${user.backupFormat})`);
    });
    
    // Output results
    const output = JSON.stringify(users, null, 2);
    
    if (options.output) {
      fs.writeFileSync(options.output, output);
      console.log(`\nResults written to: ${options.output}`);
    } else {
      console.log('\n--- Discovered Users (JSON) ---');
      console.log(output);
    }
  } catch (error) {
    console.error(`\nError: ${String(error)}`);
    if (error instanceof Error && error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

// Run if executed directly
if (require.main === module) {
  main().catch((error) => {
    console.error('Unhandled error:', error);
    process.exit(1);
  });
}


