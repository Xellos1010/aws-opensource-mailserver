import {
  Route53Client,
  ListHostedZonesCommand,
  ListResourceRecordSetsCommand,
} from '@aws-sdk/client-route-53';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import * as fs from 'node:fs';
import * as path from 'node:path';

type Cfg = {
  bucket?: string; // optional S3 bucket
  prefix?: string; // e.g. backups/dns/
  zones?: string[]; // optional zone IDs to restrict
};

export async function backupDns(cfg: Cfg = {}) {
  const r53 = new Route53Client({});
  const s3 = new S3Client({});

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');

  const zonesResp = await r53.send(new ListHostedZonesCommand({}));
  const zones =
    zonesResp.HostedZones?.filter(
      (z) => !cfg.zones || cfg.zones.includes(z.Id!.replace('/hostedzone/', ''))
    ) ?? [];

  const outDir = path.resolve('dist/backups/dns', stamp);
  fs.mkdirSync(outDir, { recursive: true });

  for (const z of zones) {
    const zoneId = z.Id!.replace('/hostedzone/', '');
    const rr = await r53.send(
      new ListResourceRecordSetsCommand({ HostedZoneId: z.Id })
    );
    const data = {
      zoneId,
      name: z.Name,
      rrsets: rr.ResourceRecordSets ?? [],
    };
    const file = path.join(outDir, `${zoneId}.json`);
    fs.writeFileSync(file, JSON.stringify(data, null, 2));

    if (cfg.bucket) {
      const key = `${cfg.prefix ?? 'dns/'}${stamp}/${zoneId}.json`;
      await s3.send(
        new PutObjectCommand({
          Bucket: cfg.bucket,
          Key: key,
          Body: JSON.stringify(data),
        })
      );
      // keep local file too for Actions artifacts
    }
  }

  return outDir;
}

if (require.main === module) {
  backupDns({
    bucket: process.env.DNS_BACKUP_BUCKET,
    prefix: process.env.DNS_BACKUP_PREFIX,
  })
    .then((dir) => console.log(`DNS backup written to ${dir}`))
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}

