import { getStackInfo, getStackInfoFromApp } from '@mm/admin-stack-info';
import { backupDns } from 'admin-dns-backup';
import { backupMailbox } from 'admin-mail-backup';
import { backupUsers } from '@mm/admin-users-backup';
import * as path from 'node:path';
import * as fs from 'node:fs';

export type BackupBridgeConfig = {
  appPath?: string;
  stackName?: string;
  domain?: string;
  region?: string;
  profile?: string;
  skipDns?: boolean;
  skipUsers?: boolean;
  skipMail?: boolean;
  dnsBucket?: string;
  dnsPrefix?: string;
  mailBucket?: string;
  mailPrefix?: string;
  mailInclude?: string[];
  mailExclude?: string[];
};

export type BackupBridgeResult = {
  timestamp: string;
  stackInfo: {
    stackName: string;
    domain: string;
    instancePublicIp?: string;
  };
  dnsBackup?: {
    outputDir: string;
  };
  userBackup?: {
    outputDir: string;
    userCount: number;
  };
  mailBackup?: {
    outDir: string;
    tarPath: string;
    s3Uri?: string;
  };
  summary: {
    dnsSuccess: boolean;
    userSuccess: boolean;
    mailSuccess: boolean;
    errors: string[];
  };
};

const log = (
  level: 'info' | 'warn' | 'error',
  msg: string,
  meta: Record<string, unknown> = {}
) =>
  console.log(
    JSON.stringify({ ts: new Date().toISOString(), level, msg, ...meta })
  );

/**
 * Bridge script that backs up both DNS and mail server for a given stack
 */
export async function backupBridge(
  config: BackupBridgeConfig
): Promise<BackupBridgeResult> {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const errors: string[] = [];
  let dnsBackup: { outputDir: string } | undefined;
  let userBackup: { outputDir: string; userCount: number } | undefined;
  let mailBackup:
    | { outDir: string; tarPath: string; s3Uri?: string }
    | undefined;

  // Get stack information
  log('info', 'Retrieving stack information', {
    appPath: config.appPath,
    stackName: config.stackName,
    domain: config.domain,
  });

  let stackInfo;
  try {
    if (config.appPath) {
      stackInfo = await getStackInfoFromApp(config.appPath, {
        region: config.region,
        profile: config.profile,
      });
    } else {
      stackInfo = await getStackInfo({
        stackName: config.stackName,
        domain: config.domain,
        region: config.region,
        profile: config.profile,
      });
    }

    log('info', 'Stack information retrieved', {
      stackName: stackInfo.stackName,
      domain: stackInfo.domain,
      hasInstanceIp: !!stackInfo.instancePublicIp,
      hasAdminPassword: !!stackInfo.adminPassword,
      hasHostedZone: !!stackInfo.hostedZoneId,
    });
  } catch (err) {
    const errorMsg = `Failed to get stack info: ${err}`;
    log('error', errorMsg);
    errors.push(errorMsg);
    throw new Error(errorMsg);
  }

  // Backup DNS
  if (!config.skipDns) {
    log('info', 'Starting DNS backup', {
      stackName: stackInfo.stackName,
      domain: stackInfo.domain,
    });

    try {
      const dnsOutputDir = await backupDns({
        bucket: config.dnsBucket,
        prefix: config.dnsPrefix,
        zones: stackInfo.hostedZoneId
          ? [stackInfo.hostedZoneId]
          : undefined,
      });

      dnsBackup = { outputDir: dnsOutputDir };
      log('info', 'DNS backup completed', { outputDir: dnsOutputDir });
    } catch (err) {
      const errorMsg = `DNS backup failed: ${err}`;
      log('error', errorMsg);
      errors.push(errorMsg);
    }
  } else {
    log('info', 'Skipping DNS backup (skipDns=true)');
  }

  // Backup Users
  if (!config.skipUsers) {
    log('info', 'Starting users backup', {
      stackName: stackInfo.stackName,
      domain: stackInfo.domain,
    });

    try {
      const userResult = await backupUsers({
        appPath: config.appPath,
        stackName: config.stackName,
        domain: stackInfo.domain,
        region: config.region,
        profile: config.profile,
        outputDir: path.resolve(
          'dist/backups',
          stackInfo.domain.replace(/\./g, '-'),
          'users',
          timestamp
        ),
      });

      userBackup = userResult;
      log('info', 'Users backup completed', {
        outputDir: userResult.outputDir,
        userCount: userResult.userCount,
      });
    } catch (err) {
      const errorMsg = `Users backup failed: ${err}`;
      log('error', errorMsg);
      errors.push(errorMsg);
    }
  } else {
    log('info', 'Skipping users backup (skipUsers=true)');
  }

  // Backup Mail
  if (!config.skipMail) {
    log('info', 'Starting mail backup', {
      stackName: stackInfo.stackName,
      domain: stackInfo.domain,
      instanceIp: stackInfo.instancePublicIp,
    });

    if (!stackInfo.instancePublicIp) {
      const errorMsg = 'Cannot backup mail: instance public IP not found';
      log('error', errorMsg);
      errors.push(errorMsg);
    } else if (!stackInfo.adminPassword) {
      const errorMsg = 'Cannot backup mail: admin password not found';
      log('error', errorMsg);
      errors.push(errorMsg);
    } else {
      try {
        const mailResult = await backupMailbox({
          host: stackInfo.instancePublicIp,
          port: 993,
          secure: true,
          user: `admin@${stackInfo.domain}`,
          pass: stackInfo.adminPassword,
          s3Bucket: config.mailBucket,
          s3Prefix: config.mailPrefix,
          includeMailboxes: config.mailInclude,
          excludeMailboxes: config.mailExclude,
        });

        mailBackup = mailResult;
        log('info', 'Mail backup completed', {
          outDir: mailResult.outDir,
          tarPath: mailResult.tarPath,
          s3Uri: mailResult.s3Uri,
        });
      } catch (err) {
        const errorMsg = `Mail backup failed: ${err}`;
        log('error', errorMsg);
        errors.push(errorMsg);
      }
    }
  } else {
    log('info', 'Skipping mail backup (skipMail=true)');
  }

  // Create summary
  const result: BackupBridgeResult = {
    timestamp,
    stackInfo: {
      stackName: stackInfo.stackName,
      domain: stackInfo.domain,
      instancePublicIp: stackInfo.instancePublicIp,
    },
    dnsBackup,
    userBackup,
    mailBackup,
    summary: {
      dnsSuccess: !!dnsBackup,
      userSuccess: !!userBackup,
      mailSuccess: !!mailBackup,
      errors,
    },
  };

  // Write summary to file
  const summaryDir = path.resolve('dist/backups', stackInfo.domain);
  fs.mkdirSync(summaryDir, { recursive: true });
  const summaryPath = path.join(summaryDir, `backup-summary-${timestamp}.json`);
  fs.writeFileSync(summaryPath, JSON.stringify(result, null, 2));
  log('info', 'Backup summary written', { summaryPath });

  return result;
}

