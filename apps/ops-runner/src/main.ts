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
  ssl:check <hostname> [port]
  ssl:provision <domain1> [domain2 ...]

Env:
  See .env.example for all required variables.
`);
    process.exit(0);
  }

  switch (cmd) {
    case 'auth:mfa': {
      // call the TS-ported mfa task
      const mfaModule = await import(
        '../../libs/support-scripts/aws/authentication/src/lib/mfa-user'
      );
      await mfaModule.main();
      break;
    }

    case 'dns:backup': {
      const dnsModule = await import(
        '../../libs/admin/admin-dns-backup/src/lib/backup'
      );
      const outDir = await dnsModule.backupDns({
        bucket: process.env.DNS_BACKUP_BUCKET,
        prefix: process.env.DNS_BACKUP_PREFIX,
      });
      console.log('DNS backup →', outDir);
      break;
    }

    case 'mail:backup': {
      const mailModule = await import(
        '../../libs/admin/admin-mail-backup/src/lib/backup'
      );
      const r = await mailModule.backupMailbox({
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
      const ec2Module = await import(
        '../../libs/admin/admin-ec2/src/lib/ec2'
      );
      const id = process.env.INSTANCE_ID;
      if (!id) throw new Error('INSTANCE_ID is required');

      if (cmd === 'ec2:restart') await ec2Module.restart(id);
      if (cmd === 'ec2:stop') await ec2Module.stop(id);
      if (cmd === 'ec2:start') await ec2Module.start(id);
      if (cmd === 'ec2:type') {
        const itype = args[0] || process.env.INSTANCE_TYPE;
        if (!itype) throw new Error('INSTANCE_TYPE (or arg) required');
        await ec2Module.changeType(id, itype);
      }

      console.log('OK:', cmd, id, args.join(' '));
      break;
    }

    case 'kms:enable':
    case 'kms:disable':
    case 'kms:status': {
      const kmsModule = await import(
        '../../libs/admin/admin-kms/src/lib/kms'
      );
      const keyId = need('KMS_KEY_ID');

      if (cmd === 'kms:enable') await kmsModule.enableRotation(keyId);
      if (cmd === 'kms:disable') await kmsModule.disableRotation(keyId);
      if (cmd === 'kms:status') console.log(await kmsModule.rotationStatus(keyId));

      console.log('OK:', cmd, keyId);
      break;
    }

    case 'ssl:check': {
      const sslCheckModule = await import(
        '../../libs/admin/admin-ssl-check/src/lib/check'
      );
      const hostname = args[0];
      if (!hostname) {
        throw new Error('ssl:check requires a hostname');
      }
      const portArg = args[1];
      const options = portArg ? { port: parseInt(portArg, 10) } : {};
      const result = await sslCheckModule.checkCertificate(hostname, options);
      console.log(sslCheckModule.formatCertCheckResult(result));
      process.exit(result.isValid ? 0 : 1);
      break;
    }

    case 'ssl:provision': {
      const sslProvisionModule = await import(
        '../../libs/admin/admin-ssl-provision/src/lib/provision'
      );
      const domains =
        args.length > 0
          ? args
          : process.env.SSL_DOMAINS?.split(',').filter(Boolean) || [];
      if (domains.length === 0) {
        throw new Error(
          'ssl:provision requires domains as arguments or SSL_DOMAINS env var'
        );
      }
      const result = await sslProvisionModule.provisionCertificate({
        domains,
        email: process.env.ACME_EMAIL,
        challengeType:
          (process.env.ACME_CHALLENGE_TYPE as 'http-01' | 'dns-01') ||
          'http-01',
      });
      console.log('Provisioning requested for:', domains.join(', '));
      console.log('Result:', JSON.stringify(result, null, 2));
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

