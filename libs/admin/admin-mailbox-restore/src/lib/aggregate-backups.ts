/**
 * Aggregate Users and Emails from Multiple Backup Folders
 * 
 * This module aggregates users and emails from multiple backup folders,
 * de-duplicates them, and prepares them for restoration.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';

export interface UserEmail {
  /** Email file path */
  path: string;
  /** Email file size in bytes */
  size: number;
  /** Email file hash (for deduplication) */
  hash: string;
  /** Backup folder source */
  sourceFolder: string;
  /** Email filename */
  filename: string;
}

export interface AggregatedUser {
  /** User email address */
  email: string;
  /** Username (without domain) */
  username: string;
  /** All emails from all backup folders (de-duplicated by hash) */
  emails: Map<string, UserEmail>;
  /** Total email count */
  emailCount: number;
  /** Total size in bytes */
  totalSize: number;
  /** Source folders this user was found in */
  sourceFolders: Set<string>;
}

export interface AggregateBackupsResult {
  /** Aggregated users (de-duplicated) */
  users: Map<string, AggregatedUser>;
  /** Total users found */
  totalUsers: number;
  /** Total emails found (after deduplication) */
  totalEmails: number;
  /** Total size in bytes */
  totalSize: number;
  /** Backup folders processed */
  foldersProcessed: string[];
}

/**
 * Calculate file hash for deduplication
 */
async function calculateFileHash(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);
    
    stream.on('data', (data) => hash.update(data));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', reject);
  });
}

/**
 * Find all email files in a Maildir directory (cur, new, tmp)
 */
function findEmailFiles(maildirPath: string): string[] {
  const emailFiles: string[] = [];
  const subdirs = ['cur', 'new', 'tmp'];
  
  for (const subdir of subdirs) {
    const subdirPath = path.join(maildirPath, subdir);
    if (!fs.existsSync(subdirPath)) {
      continue;
    }
    
    try {
      const files = fs.readdirSync(subdirPath, { withFileTypes: true });
      for (const file of files) {
        if (file.isFile()) {
          emailFiles.push(path.join(subdirPath, file.name));
        }
      }
    } catch (error) {
      // Skip if directory doesn't exist or can't be read
      continue;
    }
  }
  
  return emailFiles;
}

/**
 * Process a single backup folder and extract users and emails
 */
async function processBackupFolder(
  backupFolder: string,
  domain: string
): Promise<Map<string, AggregatedUser>> {
  const users = new Map<string, AggregatedUser>();
  const domainPath = path.join(backupFolder, domain);
  
  if (!fs.existsSync(domainPath)) {
    return users;
  }
  
  // Find all user directories
  const entries = fs.readdirSync(domainPath, { withFileTypes: true });
  
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith('.')) {
      continue;
    }
    
    const username = entry.name;
    const email = `${username}@${domain}`;
    const userMaildirPath = path.join(domainPath, username);
    
    // Validate Maildir structure (must have cur, new, or tmp)
    const hasMaildir = ['cur', 'new', 'tmp'].some(subdir => 
      fs.existsSync(path.join(userMaildirPath, subdir))
    );
    
    if (!hasMaildir) {
      continue;
    }
    
    // Get or create user
    let user = users.get(email);
    if (!user) {
      user = {
        email,
        username,
        emails: new Map<string, UserEmail>(),
        emailCount: 0,
        totalSize: 0,
        sourceFolders: new Set<string>(),
      };
      users.set(email, user);
    }
    
    user.sourceFolders.add(backupFolder);
    
    // Find all email files
    const emailFiles = findEmailFiles(userMaildirPath);
    
    // Process each email file
    for (const emailPath of emailFiles) {
      try {
        const stats = fs.statSync(emailPath);
        if (!stats.isFile()) {
          continue;
        }
        
        // Calculate hash for deduplication
        const hash = await calculateFileHash(emailPath);
        
        // Check if email already exists (by hash)
        if (!user.emails.has(hash)) {
          const filename = path.basename(emailPath);
          user.emails.set(hash, {
            path: emailPath,
            size: stats.size,
            hash,
            sourceFolder: backupFolder,
            filename,
          });
          user.emailCount++;
          user.totalSize += stats.size;
        }
      } catch (error) {
        // Skip files that can't be read
        continue;
      }
    }
  }
  
  return users;
}

/**
 * Aggregate users and emails from multiple backup folders
 */
export async function aggregateBackups(
  backupFolders: string[],
  domain: string
): Promise<AggregateBackupsResult> {
  const allUsers = new Map<string, AggregatedUser>();
  const foldersProcessed: string[] = [];
  
  // Process each backup folder
  for (const folder of backupFolders) {
    if (!fs.existsSync(folder)) {
      console.warn(`Warning: Backup folder does not exist: ${folder}`);
      continue;
    }
    
    try {
      const users = await processBackupFolder(folder, domain);
      
      // Merge users into aggregated map
      for (const [email, user] of users.entries()) {
        const existingUser = allUsers.get(email);
        
        if (existingUser) {
          // Merge emails (deduplication by hash)
          for (const [hash, emailData] of user.emails.entries()) {
            if (!existingUser.emails.has(hash)) {
              existingUser.emails.set(hash, emailData);
              existingUser.emailCount++;
              existingUser.totalSize += emailData.size;
            }
          }
          
          // Merge source folders
          user.sourceFolders.forEach(folder => existingUser.sourceFolders.add(folder));
        } else {
          allUsers.set(email, user);
        }
      }
      
      foldersProcessed.push(folder);
    } catch (error) {
      console.error(`Error processing backup folder ${folder}:`, error);
      continue;
    }
  }
  
  // Calculate totals
  let totalEmails = 0;
  let totalSize = 0;
  
  for (const user of allUsers.values()) {
    totalEmails += user.emailCount;
    totalSize += user.totalSize;
  }
  
  return {
    users: allUsers,
    totalUsers: allUsers.size,
    totalEmails,
    totalSize,
    foldersProcessed,
  };
}

/**
 * Get list of backup folders from a base directory
 */
export function findBackupFolders(baseDir: string, pattern?: string): string[] {
  if (!fs.existsSync(baseDir)) {
    return [];
  }
  
  const folders: string[] = [];
  const entries = fs.readdirSync(baseDir, { withFileTypes: true });
  
  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }
    
    // Skip maintenance folders
    if (entry.name.includes('maintenance')) {
      continue;
    }
    
    // Apply pattern filter if provided
    if (pattern && !entry.name.match(new RegExp(pattern))) {
      continue;
    }
    
    const folderPath = path.join(baseDir, entry.name);
    folders.push(folderPath);
  }
  
  return folders.sort();
}


