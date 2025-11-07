#!/usr/bin/env node

import { backupDns } from '../src/lib/backup';
import { getStackInfo, getStackInfoFromApp } from '@mm/admin-stack-info';

async function main() {
  const appPath = process.env.APP_PATH;
  const stackName = process.env.STACK_NAME;
  const domainEnv = process.env.DOMAIN;

  let hostedZoneId: string | undefined;
  let domain: string | undefined;
  
  // If app path is provided, get stack info to find hosted zone and domain
  if (appPath) {
    try {
      const stackInfo = await getStackInfoFromApp(appPath, {
        region: process.env.AWS_REGION,
        profile: process.env.AWS_PROFILE,
      });
      hostedZoneId = stackInfo.hostedZoneId;
      domain = stackInfo.domain;
      console.log(`Using stack: ${stackInfo.stackName} (${stackInfo.domain})`);
      if (hostedZoneId) {
        console.log(`Found hosted zone: ${hostedZoneId}`);
      }
    } catch (err) {
      console.warn(`Could not get stack info from app path: ${err}`);
    }
  } else if (stackName || domainEnv) {
    try {
      const stackInfo = await getStackInfo({
        stackName,
        domain: domainEnv,
        region: process.env.AWS_REGION,
        profile: process.env.AWS_PROFILE,
      });
      hostedZoneId = stackInfo.hostedZoneId;
      domain = stackInfo.domain;
      console.log(`Using stack: ${stackInfo.stackName} (${stackInfo.domain})`);
      if (hostedZoneId) {
        console.log(`Found hosted zone: ${hostedZoneId}`);
      }
    } catch (err) {
      console.warn(`Could not get stack info: ${err}`);
    }
  }

  // Use explicit zone IDs or the one from stack
  const zoneIds = process.env.DNS_ZONE_IDS?.split(',').filter(Boolean) ||
    (hostedZoneId ? [hostedZoneId] : undefined);

  await backupDns({
    bucket: process.env.DNS_BACKUP_BUCKET,
    prefix: process.env.DNS_BACKUP_PREFIX,
    zones: zoneIds,
    domain: domain || domainEnv,
    outputDir: process.env.OUTPUT_DIR,
  })
    .then((dir) => console.log(`DNS backup written to ${dir}`))
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}

main();

