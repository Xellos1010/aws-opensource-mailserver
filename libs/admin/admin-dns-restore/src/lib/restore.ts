import {
  Route53Client,
  ChangeResourceRecordSetsCommand,
  Change,
  ResourceRecordSet,
  ListResourceRecordSetsCommand,
  ListHostedZonesCommand,
} from '@aws-sdk/client-route-53';
import { fromIni } from '@aws-sdk/credential-providers';
import * as fs from 'node:fs';
import * as path from 'node:path';

const log = (
  level: 'info' | 'warn' | 'error',
  msg: string,
  meta: Record<string, unknown> = {}
) =>
  console.log(
    JSON.stringify({ ts: new Date().toISOString(), level, msg, ...meta })
  );

// Old backup format: array of records with qname, rtype, value
type OldBackupRecord = {
  qname: string;
  rtype: string;
  value: string;
  zone?: string;
};

// New backup format: { zoneId, name, rrsets: [...] }
type NewBackupFormat = {
  zoneId: string;
  name: string;
  rrsets: ResourceRecordSet[];
};

type BackupData = OldBackupRecord[] | NewBackupFormat;

type RestoreConfig = {
  backupFile: string;
  hostedZoneId?: string;
  domain?: string;
  region?: string;
  profile?: string;
  dryRun?: boolean;
};

/**
 * Converts old backup format to Route53 ResourceRecordSet format
 */
function convertOldFormatToRRSets(
  oldRecords: OldBackupRecord[],
  hostedZoneId: string
): ResourceRecordSet[] {
  const rrsets: ResourceRecordSet[] = [];

  for (const record of oldRecords) {
    // Skip NS and SOA records (these are managed by Route53)
    if (record.rtype === 'NS' || record.rtype === 'SOA') {
      continue;
    }

    const name = record.qname.endsWith('.')
      ? record.qname
      : `${record.qname}.`;

    rrsets.push({
      Name: name,
      Type: record.rtype as any,
      TTL: 300, // Default TTL
      ResourceRecords: [
        {
          Value: record.value,
        },
      ],
    });
  }

  return rrsets;
}

/**
 * Reads and parses DNS backup file
 */
function readBackupFile(filePath: string): BackupData {
  const fullPath = path.resolve(filePath);
  if (!fs.existsSync(fullPath)) {
    throw new Error(`Backup file not found: ${fullPath}`);
  }

  const content = fs.readFileSync(fullPath, 'utf-8');
  const data = JSON.parse(content);

  // Check if it's old format (array) or new format (object with zoneId)
  if (Array.isArray(data)) {
    return data as OldBackupRecord[];
  } else if (data.zoneId && data.rrsets) {
    return data as NewBackupFormat;
  } else {
    throw new Error(
      'Unknown backup format. Expected array of records or object with zoneId and rrsets.'
    );
  }
}

/**
 * Finds hosted zone ID by domain name
 */
async function findHostedZoneByDomain(
  client: Route53Client,
  domain: string
): Promise<string | null> {
  const normalizedDomain = domain.endsWith('.') ? domain : `${domain}.`;
  
  try {
    const response = await client.send(new ListHostedZonesCommand({}));
    const zones = response.HostedZones || [];
    
    for (const zone of zones) {
      if (zone.Name === normalizedDomain) {
        return zone.Id?.replace('/hostedzone/', '') || null;
      }
    }
  } catch (err) {
    log('warn', 'Could not list hosted zones', { error: String(err) });
  }
  
  return null;
}

/**
 * Gets current records from Route53 (to compare and avoid duplicates)
 */
async function getCurrentRecords(
  client: Route53Client,
  hostedZoneId: string
): Promise<Map<string, ResourceRecordSet>> {
  const current = new Map<string, ResourceRecordSet>();

  try {
    const response = await client.send(
      new ListResourceRecordSetsCommand({ HostedZoneId: hostedZoneId })
    );

    if (response.ResourceRecordSets) {
      for (const rrset of response.ResourceRecordSets) {
        // Skip NS and SOA records
        if (rrset.Type === 'NS' || rrset.Type === 'SOA') {
          continue;
        }
        const key = `${rrset.Name}:${rrset.Type}`;
        current.set(key, rrset);
      }
    }
  } catch (err) {
    log('warn', 'Could not fetch current records', { error: String(err) });
  }

  return current;
}

/**
 * Restores DNS records from backup file to Route53
 */
export async function restoreDns(config: RestoreConfig): Promise<{
  changes: number;
  created: number;
  updated: number;
  skipped: number;
}> {
  const region = config.region || process.env['AWS_REGION'] || 'us-east-1';
  const profile = config.profile || process.env['AWS_PROFILE'] || 'hepe-admin-mfa';
  const dryRun = config.dryRun ?? false;

  const credentials = fromIni({ profile });
  const client = new Route53Client({ region, credentials });

  // Read backup file
  log('info', 'Reading backup file', { file: config.backupFile });
  const backupData = readBackupFile(config.backupFile);

  let hostedZoneId = config.hostedZoneId;
  let rrsets: ResourceRecordSet[];

  // Process backup data based on format
  if (Array.isArray(backupData)) {
    // Old format
    if (!hostedZoneId && !config.domain) {
      throw new Error(
        'hostedZoneId or domain required for old backup format'
      );
    }

    if (!hostedZoneId && config.domain) {
      // Try to find hosted zone by domain
      log('info', 'Looking up hosted zone by domain', { domain: config.domain });
      const foundZoneId = await findHostedZoneByDomain(client, config.domain);
      if (foundZoneId) {
        hostedZoneId = foundZoneId;
        log('info', 'Found hosted zone', { hostedZoneId, domain: config.domain });
      } else {
        throw new Error(
          `Could not find hosted zone for domain: ${config.domain}. Please provide HOSTED_ZONE_ID.`
        );
      }
    }

    rrsets = convertOldFormatToRRSets(backupData, hostedZoneId!);
  } else {
    // New format
    hostedZoneId = backupData.zoneId;
    rrsets = backupData.rrsets.filter(
      (rr) => rr.Type !== 'NS' && rr.Type !== 'SOA'
    );
  }

  if (!hostedZoneId) {
    throw new Error('Could not determine hosted zone ID');
  }

  log('info', 'Preparing to restore DNS records', {
    hostedZoneId,
    recordCount: rrsets.length,
    dryRun,
  });

  // Get current records to avoid duplicates
  const currentRecords = await getCurrentRecords(client, hostedZoneId);

  // Prepare changes
  const changes: Change[] = [];
  let created = 0;
  let updated = 0;
  let skipped = 0;

  for (const rrset of rrsets) {
    const key = `${rrset.Name}:${rrset.Type}`;
    const existing = currentRecords.get(key);

    if (existing) {
      // Update existing record
      changes.push({
        Action: 'UPSERT',
        ResourceRecordSet: rrset,
      });
      updated++;
      log('info', 'Will update record', {
        name: rrset.Name,
        type: rrset.Type,
      });
    } else {
      // Create new record
      changes.push({
        Action: 'CREATE',
        ResourceRecordSet: rrset,
      });
      created++;
      log('info', 'Will create record', {
        name: rrset.Name,
        type: rrset.Type,
      });
    }
  }

  if (changes.length === 0) {
    log('info', 'No changes to apply', { skipped });
    return { changes: 0, created: 0, updated: 0, skipped };
  }

  if (dryRun) {
    log('info', 'Dry run - would apply changes', {
      total: changes.length,
      created,
      updated,
    });
    return { changes: changes.length, created, updated, skipped };
  }

  // Apply changes in batches (Route53 limit is 1000 changes per batch)
  const batchSize = 1000;
  let totalApplied = 0;

  for (let i = 0; i < changes.length; i += batchSize) {
    const batch = changes.slice(i, i + batchSize);
    log('info', 'Applying batch', {
      batch: Math.floor(i / batchSize) + 1,
      size: batch.length,
    });

    try {
      const response = await client.send(
        new ChangeResourceRecordSetsCommand({
          HostedZoneId: hostedZoneId,
          ChangeBatch: {
            Changes: batch,
            Comment: `DNS restore from backup: ${path.basename(config.backupFile)}`,
          },
        })
      );

      totalApplied += batch.length;
      log('info', 'Batch applied', {
        changeId: response.ChangeInfo?.Id,
        status: response.ChangeInfo?.Status,
      });
    } catch (err) {
      log('error', 'Failed to apply batch', {
        error: String(err),
        batchStart: i,
        batchSize: batch.length,
      });
      throw err;
    }
  }

  log('info', 'DNS restore complete', {
    totalApplied,
    created,
    updated,
    skipped,
  });

  return { changes: totalApplied, created, updated, skipped };
}

