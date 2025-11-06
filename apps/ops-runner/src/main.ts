#!/usr/bin/env node

function need(k: string): string {
  const v = process.env[k];
  if (!v) throw new Error(`Missing ${k}`);
  return v;
}

async function run(): Promise<void> {
  const [, , cmd, ...args] = process.argv;

  if (!cmd || ['-h', '--help', 'help'].includes(cmd)) {
    console.log(`ops <command>

Commands:
  auth:mfa
  dns:backup
  mail:backup
  ec2:restart|ec2:stop|ec2:start|ec2:type <instanceType>
  kms:enable|kms:disable|kms:status

Env:
  See .env.example for all required variables.
`);
    process.exit(0);
  }

  switch (cmd) {
    case 'auth:mfa': {
      // call the TS-ported mfa task
      const { main } = await import(
        '../../libs/support-scripts/aws/authentication/src/lib/mfa-user'
      );
      await main();
      break;
    }

    case 'dns:backup': {
      const { backupDns } = await import(
        '../../libs/admin/admin-dns-backup/src/lib/backup'
      );
      const outDir = await backupDns({
        bucket: process.env.DNS_BACKUP_BUCKET,
        prefix: process.env.DNS_BACKUP_PREFIX,
      });
      console.log('DNS backup →', outDir);
      break;
    }

    case 'mail:backup': {
      const { backupMailbox } = await import(
        '../../libs/admin/admin-mail-backup/src/lib/backup'
      );
      const r = await backupMailbox({
        host: need('MAIL_HOST'),
        port: Number(process.env.MAIL_PORT ?? 993),
        secure: process.env.MAIL_SECURE
          ? process.env.MAIL_SECURE === '1'
          : true,
        user: need('MAIL_USER'),
        pass: need('MAIL_PASS'),
        s3Bucket: process.env.MAIL_BACKUP_BUCKET,
        s3Prefix: process.env.MAIL_BACKUP_PREFIX,
        includeMailboxes: process.env.MAIL_INCLUDE?.split(',').filter(Boolean),
        excludeMailboxes: process.env.MAIL_EXCLUDE?.split(',').filter(Boolean),
      });
      console.log('Mail backup complete:', r);
      break;
    }

    case 'ec2:restart':
    case 'ec2:stop':
    case 'ec2:start':
    case 'ec2:type': {
      const { restart, stop, start, changeType } = await import(
        '../../libs/admin/admin-ec2/src/lib/ec2'
      );
      const id = process.env.INSTANCE_ID;
      if (!id) throw new Error('INSTANCE_ID is required');

      if (cmd === 'ec2:restart') await restart(id);
      if (cmd === 'ec2:stop') await stop(id);
      if (cmd === 'ec2:start') await start(id);
      if (cmd === 'ec2:type') {
        const itype = args[0] || process.env.INSTANCE_TYPE;
        if (!itype) throw new Error('INSTANCE_TYPE (or arg) required');
        await changeType(id, itype);
      }

      console.log('OK:', cmd, id, args.join(' '));
      break;
    }

    case 'kms:enable':
    case 'kms:disable':
    case 'kms:status': {
      const { enableRotation, disableRotation, rotationStatus } = await import(
        '../../libs/admin/admin-kms/src/lib/kms'
      );
      const keyId = need('KMS_KEY_ID');

      if (cmd === 'kms:enable') await enableRotation(keyId);
      if (cmd === 'kms:disable') await disableRotation(keyId);
      if (cmd === 'kms:status') console.log(await rotationStatus(keyId));

      console.log('OK:', cmd, keyId);
      break;
    }

    default:
      throw new Error(`Unknown command: ${cmd}`);
  }
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});

