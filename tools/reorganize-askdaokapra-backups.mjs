#!/usr/bin/env node

/**
 * Reorganize archived askdaokapra backups to match the structure
 * expected by admin-dns-backup and admin-mail-backup libraries
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.resolve(__dirname, '..');

const ARCHIVE_DIR = path.join(workspaceRoot, 'Archive/backups/askdaokapra.com');
const DOMAIN = 'askdaokapra';
const TARGET_DNS_DIR = path.join(workspaceRoot, 'dist/backups', DOMAIN, 'dns');
const TARGET_MAIL_DIR = path.join(workspaceRoot, 'dist/backups', DOMAIN, 'mail');

// Convert old timestamp format (20250915-120236) to ISO format (2025-09-15T12-02-36-000Z)
function convertTimestamp(oldTimestamp) {
  // Format: YYYYMMDD-HHMMSS -> YYYY-MM-DDTHH-MM-SS-000Z
  const match = oldTimestamp.match(/^(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})$/);
  if (match) {
    const [, year, month, day, hour, min, sec] = match;
    return `${year}-${month}-${day}T${hour}-${min}-${sec}-000Z`;
  }
  
  // Format: YYYYMMDD_HHMMSS -> YYYY-MM-DDTHH-MM-SS-000Z
  const match2 = oldTimestamp.match(/^(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})(\d{2})$/);
  if (match2) {
    const [, year, month, day, hour, min, sec] = match2;
    return `${year}-${month}-${day}T${hour}-${min}-${sec}-000Z`;
  }
  
  return oldTimestamp;
}

// Get hosted zone ID from Route53 or stack info
async function getHostedZoneId() {
  // Try to get from Route53 directly
  try {
    const { execSync } = await import('child_process');
    const result = execSync(
      `AWS_PROFILE=hepe-admin-mfa AWS_REGION=us-east-1 aws route53 list-hosted-zones --query "HostedZones[?Name=='askdaokapra.com.'].Id" --output text 2>/dev/null`,
      { encoding: 'utf-8', cwd: workspaceRoot }
    );
    const zoneId = result.trim();
    if (zoneId && zoneId.startsWith('/hostedzone/')) {
      return zoneId.replace('/hostedzone/', '');
    }
    if (zoneId) {
      return zoneId;
    }
  } catch (err) {
    // Ignore
  }
  
  // Try to get from stack info
  try {
    const { execSync } = await import('child_process');
    const result = execSync(
      'pnpm nx run admin-stack-info:get:askdaokapra 2>&1',
      { encoding: 'utf-8', cwd: workspaceRoot }
    );
    // Find JSON block in output
    const lines = result.split('\n');
    let jsonStart = -1;
    let jsonEnd = -1;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].trim().startsWith('{')) {
        jsonStart = i;
        break;
      }
    }
    if (jsonStart >= 0) {
      for (let i = jsonStart; i < lines.length; i++) {
        if (lines[i].trim() === '}') {
          jsonEnd = i;
          break;
        }
      }
      if (jsonEnd > jsonStart) {
        const jsonStr = lines.slice(jsonStart, jsonEnd + 1).join('\n');
        const stackInfo = JSON.parse(jsonStr);
        return stackInfo.hostedZoneId || stackInfo.outputs?.HostedZoneId;
      }
    }
  } catch (err) {
    // Ignore
  }
  
  return null;
}

// Convert old DNS backup format to new format
function convertDnsBackup(oldData, zoneId, zoneName) {
  // Old format: array of records
  // New format: { zoneId, name, rrsets: [...] }
  
  if (!Array.isArray(oldData)) {
    // Already in new format?
    if (oldData.zoneId && oldData.rrsets) {
      return oldData;
    }
    return null;
  }
  
  const rrsets = oldData.map(record => ({
    Name: record.qname.endsWith('.') ? record.qname : `${record.qname}.`,
    Type: record.rtype,
    TTL: 300, // Default TTL if not specified
    ResourceRecords: [
      {
        Value: record.value
      }
    ]
  }));
  
  return {
    zoneId: zoneId || 'UNKNOWN',
    name: zoneName || 'askdaokapra.com.',
    rrsets
  };
}

async function reorganizeDnsBackups(hostedZoneId) {
  const dnsArchiveDir = path.join(ARCHIVE_DIR, 'dns');
  if (!fs.existsSync(dnsArchiveDir)) {
    console.log('No DNS backups found in archive');
    return;
  }
  
  const dnsFiles = fs.readdirSync(dnsArchiveDir).filter(f => f.endsWith('.json'));
  
  for (const file of dnsFiles) {
    const oldPath = path.join(dnsArchiveDir, file);
    const oldData = JSON.parse(fs.readFileSync(oldPath, 'utf-8'));
    
    // Extract timestamp from filename: dns-backup-20250915-120236.json
    const timestampMatch = file.match(/dns-backup-(\d{4}\d{2}\d{2}-\d{6})\.json/);
    if (!timestampMatch) {
      console.warn(`Skipping DNS file with unexpected format: ${file}`);
      continue;
    }
    
    const oldTimestamp = timestampMatch[1];
    const newTimestamp = convertTimestamp(oldTimestamp);
    
    // Convert to new format
    const newData = convertDnsBackup(oldData, hostedZoneId, 'askdaokapra.com.');
    if (!newData) {
      console.warn(`Could not convert DNS backup: ${file}`);
      continue;
    }
    
    // Create target directory
    const targetDir = path.join(TARGET_DNS_DIR, newTimestamp);
    fs.mkdirSync(targetDir, { recursive: true });
    
    // Write new format file
    const zoneId = newData.zoneId;
    const targetFile = path.join(targetDir, `${zoneId}.json`);
    fs.writeFileSync(targetFile, JSON.stringify(newData, null, 2));
    
    console.log(`✓ Reorganized DNS backup: ${file} -> ${newTimestamp}/${zoneId}.json`);
  }
}

async function reorganizeMailBackups() {
  const mailArchiveDir = path.join(ARCHIVE_DIR, 'mailboxes');
  if (!fs.existsSync(mailArchiveDir)) {
    console.log('No mail backups found in archive');
    return;
  }
  
  const mailDirs = fs.readdirSync(mailArchiveDir).filter(f => {
    const fullPath = path.join(mailArchiveDir, f);
    return fs.statSync(fullPath).isDirectory();
  });
  
  for (const dir of mailDirs) {
    // Extract timestamp: mailboxes-backup-20250915_120248
    const timestampMatch = dir.match(/mailboxes-backup-(\d{8}_\d{6})/);
    if (!timestampMatch) {
      console.warn(`Skipping mail directory with unexpected format: ${dir}`);
      continue;
    }
    
    const oldTimestamp = timestampMatch[1];
    const newTimestamp = convertTimestamp(oldTimestamp);
    
    // Generate a run ID (use first 8 chars of timestamp as runId for consistency)
    const runId = oldTimestamp.replace(/[_-]/g, '').substring(0, 8);
    const targetDir = path.join(TARGET_MAIL_DIR, `${newTimestamp}-${runId}`);
    
    // Copy directory contents
    const sourceDir = path.join(mailArchiveDir, dir);
    fs.mkdirSync(targetDir, { recursive: true });
    
    // Copy recursively
    function copyRecursive(src, dest) {
      const entries = fs.readdirSync(src, { withFileTypes: true });
      for (const entry of entries) {
        const srcPath = path.join(src, entry.name);
        const destPath = path.join(dest, entry.name);
        
        if (entry.isDirectory()) {
          fs.mkdirSync(destPath, { recursive: true });
          copyRecursive(srcPath, destPath);
        } else {
          fs.copyFileSync(srcPath, destPath);
        }
      }
    }
    
    copyRecursive(sourceDir, targetDir);
    
    console.log(`✓ Reorganized mail backup: ${dir} -> ${newTimestamp}-${runId}/`);
    
    // Note: The mail backup library creates tar.gz files, but we're just organizing
    // the source directories. The tar.gz can be created later if needed.
  }
}

async function main() {
  console.log('Reorganizing askdaokapra backups...\n');
  
  // Get hosted zone ID
  console.log('Fetching hosted zone ID from stack...');
  const hostedZoneId = await getHostedZoneId();
  if (!hostedZoneId) {
    console.warn('⚠ Could not determine hosted zone ID. DNS backups will use placeholder.');
    console.warn('  You may need to update the zoneId in the reorganized files.');
  } else {
    console.log(`✓ Found hosted zone ID: ${hostedZoneId}\n`);
  }
  
  // Reorganize DNS backups
  console.log('Reorganizing DNS backups...');
  await reorganizeDnsBackups(hostedZoneId);
  console.log('');
  
  // Reorganize mail backups
  console.log('Reorganizing mail backups...');
  await reorganizeMailBackups();
  console.log('');
  
  console.log('✓ Reorganization complete!');
  console.log(`  DNS backups: ${TARGET_DNS_DIR}`);
  console.log(`  Mail backups: ${TARGET_MAIL_DIR}`);
  console.log(`\nDomain: ${DOMAIN}`);
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});

