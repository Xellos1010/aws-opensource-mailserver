#!/usr/bin/env node

import { backupMailbox } from '../src/lib/backup';
import { getStackInfo, getStackInfoFromApp } from '@mm/admin-stack-info';

const log = (
  level: 'info' | 'warn' | 'error',
  msg: string,
  meta: Record<string, unknown> = {}
) =>
  console.log(
    JSON.stringify({ ts: new Date().toISOString(), level, msg, ...meta })
  );

async function main() {
  const appPath = process.env.APP_PATH;
  const stackName = process.env.STACK_NAME;
  const domainEnv = process.env.DOMAIN;

  let mailHost: string | undefined;
  let mailUser: string | undefined;
  let mailPass: string | undefined;
  let domain: string | undefined;

  // If app path is provided, get stack info to find mail server details
  if (appPath) {
    try {
      const stackInfo = await getStackInfoFromApp(appPath, {
        region: process.env.AWS_REGION,
        profile: process.env.AWS_PROFILE,
      });
      mailHost = stackInfo.instancePublicIp || stackInfo.outputs.InstancePublicIp;
      mailUser = `admin@${stackInfo.domain}`;
      mailPass = stackInfo.adminPassword;
      domain = stackInfo.domain;
      log('info', 'Retrieved stack info', {
        stack: stackInfo.stackName,
        domain: stackInfo.domain,
        hasHost: !!mailHost,
        hasPassword: !!mailPass,
      });
    } catch (err) {
      log('warn', 'Could not get stack info from app path', { error: String(err) });
    }
  } else if (stackName || domainEnv) {
    try {
      const stackInfo = await getStackInfo({
        stackName,
        domain: domainEnv,
        region: process.env.AWS_REGION,
        profile: process.env.AWS_PROFILE,
      });
      mailHost = stackInfo.instancePublicIp || stackInfo.outputs.InstancePublicIp;
      mailUser = `admin@${stackInfo.domain}`;
      mailPass = stackInfo.adminPassword;
      domain = stackInfo.domain;
      log('info', 'Retrieved stack info', {
        stack: stackInfo.stackName,
        domain: stackInfo.domain,
        hasHost: !!mailHost,
        hasPassword: !!mailPass,
      });
    } catch (err) {
      log('warn', 'Could not get stack info', { error: String(err) });
    }
  }

  // Use stack info or environment variables (env vars take precedence)
  const need = (k: string, fallback?: string): string => {
    const v = process.env[k];
    if (v) return v;
    if (fallback) return fallback;
    throw new Error(`Missing ${k}`);
  };

  await backupMailbox({
    host: need('MAIL_HOST', mailHost),
    port: Number(process.env.MAIL_PORT ?? 993),
    secure: process.env.MAIL_SECURE ? process.env.MAIL_SECURE === '1' : true,
    user: need('MAIL_USER', mailUser),
    pass: need('MAIL_PASS', mailPass),
    s3Bucket: process.env.MAIL_BACKUP_BUCKET,
    s3Prefix: process.env.MAIL_BACKUP_PREFIX,
    includeMailboxes: process.env.MAIL_INCLUDE?.split(',').filter(Boolean),
    excludeMailboxes: process.env.MAIL_EXCLUDE?.split(',').filter(Boolean),
    domain: domain || domainEnv,
    outputDir: process.env.OUTPUT_DIR,
  })
    .then((r) => log('info', 'backup complete', r))
    .catch((e) => {
      log('error', e.message);
      process.exit(1);
    });
}

main();

