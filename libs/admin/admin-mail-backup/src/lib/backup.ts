import { ImapFlow } from 'imapflow';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import * as tar from 'tar';
import { pipeline } from 'node:stream/promises';
import { createGzip } from 'node:zlib';
import { S3Client } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';

type Cfg = {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  s3Bucket?: string;
  s3Prefix?: string;
  includeMailboxes?: string[];
  excludeMailboxes?: string[];
  domain?: string; // domain name for organizing backups (e.g., "askdaokapra.com")
  outputDir?: string; // optional custom output directory
};

const log = (
  level: 'info' | 'warn' | 'error',
  msg: string,
  meta: Record<string, unknown> = {}
) =>
  console.log(
    JSON.stringify({ ts: new Date().toISOString(), level, msg, ...meta })
  );

async function dumpMailbox(
  client: ImapFlow,
  mailboxPath: string,
  outDir: string
) {
  const safe = mailboxPath.replace(/[\\/]/g, '_');
  const dest = path.join(outDir, `${safe}.eml.ndjson`);
  const write = fs.createWriteStream(dest, { flags: 'w' });

  await client.mailboxOpen(mailboxPath, { readOnly: true });

  let count = 0;
  for await (const msg of client.fetch(
    { seq: '1:*' },
    { source: true, envelope: true }
  )) {
    const line =
      JSON.stringify({
        uid: msg.uid,
        subject: msg.envelope?.subject,
        from: msg.envelope?.from,
        date: msg.envelope?.date,
        raw: (msg.source as Buffer).toString('base64'),
      }) + '\n';
    if (!write.write(line)) {
      await new Promise<void>((resolve) => write.once('drain', () => resolve()));
    }
    count++;
  }

  write.end();
  await new Promise<void>((resolve) => write.on('close', () => resolve()));

  log('info', 'mailbox dumped', {
    mailbox: mailboxPath,
    messages: count,
    file: dest,
  });

  return dest;
}

async function tarGzipDirectory(srcDir: string, outFile: string) {
  const gz = createGzip({ level: 9 });
  const tarStream = tar.create(
    { gzip: false, cwd: srcDir },
    fs.readdirSync(srcDir)
  );
  const out = fs.createWriteStream(outFile, { mode: 0o600 });

  await pipeline(tarStream, gz, out);
  return outFile;
}

async function uploadTarToS3(
  tarPath: string,
  bucket: string,
  key: string,
  region?: string
) {
  const s3 = new S3Client({ region });
  const uploader = new Upload({
    client: s3,
    params: { Bucket: bucket, Key: key, Body: fs.createReadStream(tarPath) },
    partSize: 10 * 1024 * 1024, // 10MB
    leavePartsOnError: false,
  });

  await uploader.done();
  return `s3://${bucket}/${key}`;
}

export async function backupMailbox(cfg: Cfg) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const runId = crypto.randomUUID();
  
  // Use domain-based directory structure if domain is provided
  // Format: dist/backups/{domain-name}/mail/{timestamp}-{runId}
  const domainName = cfg.domain ? cfg.domain.replace(/\./g, '-') : undefined;
  const workDir = cfg.outputDir || 
    (domainName
      ? path.resolve('dist/backups', domainName, 'mail', `${stamp}-${runId}`)
      : path.resolve('dist/backups/mail', `${stamp}-${runId}`));
  fs.mkdirSync(workDir, { recursive: true });

  const client = new ImapFlow({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    auth: { user: cfg.user, pass: cfg.pass },
    logger: false,
  });

  log('info', 'connecting to IMAP', {
    host: cfg.host,
    port: cfg.port,
    user: cfg.user,
  });

  await client.connect();

  const selected: string[] = [];
  const mailboxes = await client.list();
  for (const mbox of mailboxes) {
    const name = mbox.path;
    if (cfg.includeMailboxes && !cfg.includeMailboxes.includes(name)) continue;
    if (cfg.excludeMailboxes && cfg.excludeMailboxes.includes(name)) continue;
    selected.push(name);
  }

  for (const mbox of selected) {
    await dumpMailbox(client, mbox, workDir);
  }

  await client.logout();

  const tarName = `mail-backup-${stamp}-${runId}.tar.gz`;
  const tarPath = path.join(path.dirname(workDir), tarName);
  await tarGzipDirectory(workDir, tarPath);

  log('info', 'tarball created', { tarPath });

  if (cfg.s3Bucket) {
    const key = `${cfg.s3Prefix ?? 'mail/'}${tarName}`;
    const s3Uri = await uploadTarToS3(
      tarPath,
      cfg.s3Bucket,
      key,
      process.env['AWS_REGION']
    );
    log('info', 'uploaded to s3', { s3Uri });
    return { outDir: workDir, tarPath, s3Uri };
  }

  return { outDir: workDir, tarPath };
}

