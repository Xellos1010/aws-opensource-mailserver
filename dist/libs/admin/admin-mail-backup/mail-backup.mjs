#!/usr/bin/env node
var __getOwnPropNames = Object.getOwnPropertyNames;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __commonJS = (cb, mod) => function __require() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};

// libs/admin/admin-mail-backup/src/lib/backup.ts
import { ImapFlow } from "imapflow";
import * as fs from "node:fs";
import * as path from "node:path";
import * as crypto from "node:crypto";
import * as tar from "tar";
import { pipeline } from "node:stream/promises";
import { createGzip } from "node:zlib";
import { S3Client } from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
async function dumpMailbox(client, mailboxPath, outDir) {
  const safe = mailboxPath.replace(/[\\/]/g, "_");
  const dest = path.join(outDir, `${safe}.eml.ndjson`);
  const write = fs.createWriteStream(dest, { flags: "w" });
  await client.mailboxOpen(mailboxPath, { readOnly: true });
  let count = 0;
  for await (const msg of client.fetch(
    { seq: "1:*" },
    { source: true, envelope: true }
  )) {
    const line = JSON.stringify({
      uid: msg.uid,
      subject: msg.envelope?.subject,
      from: msg.envelope?.from,
      date: msg.envelope?.date,
      raw: msg.source.toString("base64")
    }) + "\n";
    if (!write.write(line)) {
      await new Promise((resolve2) => write.once("drain", () => resolve2()));
    }
    count++;
  }
  write.end();
  await new Promise((resolve2) => write.on("close", () => resolve2()));
  log("info", "mailbox dumped", {
    mailbox: mailboxPath,
    messages: count,
    file: dest
  });
  return dest;
}
async function tarGzipDirectory(srcDir, outFile) {
  const gz = createGzip({ level: 9 });
  const tarStream = tar.create(
    { gzip: false, cwd: srcDir },
    fs.readdirSync(srcDir)
  );
  const out = fs.createWriteStream(outFile, { mode: 384 });
  await pipeline(tarStream, gz, out);
  return outFile;
}
async function uploadTarToS3(tarPath, bucket, key, region) {
  const s3 = new S3Client({ region });
  const uploader = new Upload({
    client: s3,
    params: { Bucket: bucket, Key: key, Body: fs.createReadStream(tarPath) },
    partSize: 10 * 1024 * 1024,
    // 10MB
    leavePartsOnError: false
  });
  await uploader.done();
  return `s3://${bucket}/${key}`;
}
async function backupMailbox(cfg) {
  const stamp = (/* @__PURE__ */ new Date()).toISOString().replace(/[:.]/g, "-");
  const runId = crypto.randomUUID();
  const workDir = path.resolve("dist/backups/mail", `${stamp}-${runId}`);
  fs.mkdirSync(workDir, { recursive: true });
  const client = new ImapFlow({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    auth: { user: cfg.user, pass: cfg.pass },
    logger: false
  });
  log("info", "connecting to IMAP", {
    host: cfg.host,
    port: cfg.port,
    user: cfg.user
  });
  await client.connect();
  const selected = [];
  const mailboxes = await client.list();
  for (const mbox of mailboxes) {
    const name = mbox.path;
    if (cfg.includeMailboxes && !cfg.includeMailboxes.includes(name))
      continue;
    if (cfg.excludeMailboxes && cfg.excludeMailboxes.includes(name))
      continue;
    selected.push(name);
  }
  for (const mbox of selected) {
    await dumpMailbox(client, mbox, workDir);
  }
  await client.logout();
  const tarName = `mail-backup-${stamp}-${runId}.tar.gz`;
  const tarPath = path.join(path.dirname(workDir), tarName);
  await tarGzipDirectory(workDir, tarPath);
  log("info", "tarball created", { tarPath });
  if (cfg.s3Bucket) {
    const key = `${cfg.s3Prefix ?? "mail/"}${tarName}`;
    const s3Uri = await uploadTarToS3(
      tarPath,
      cfg.s3Bucket,
      key,
      process.env["AWS_REGION"]
    );
    log("info", "uploaded to s3", { s3Uri });
    return { outDir: workDir, tarPath, s3Uri };
  }
  return { outDir: workDir, tarPath };
}
var log;
var init_backup = __esm({
  "libs/admin/admin-mail-backup/src/lib/backup.ts"() {
    log = (level, msg, meta = {}) => console.log(
      JSON.stringify({ ts: (/* @__PURE__ */ new Date()).toISOString(), level, msg, ...meta })
    );
  }
});

// libs/admin/admin-stack-info/src/lib/stack-info.ts
import {
  CloudFormationClient,
  DescribeStacksCommand
} from "@aws-sdk/client-cloudformation";
import { SSMClient, GetParameterCommand } from "@aws-sdk/client-ssm";
import { EC2Client, DescribeInstancesCommand } from "@aws-sdk/client-ec2";
import { fromIni } from "@aws-sdk/credential-providers";
function resolveDomain(appPath, stackName) {
  if (appPath) {
    const parts = appPath.split("/");
    const appName = parts[parts.length - 1];
    const domainPart = appName.replace(/^cdk-/, "");
    const domainMap = {
      "emc-notary": "emcnotary.com",
      "emcnotary": "emcnotary.com"
    };
    return domainMap[domainPart] || `${domainPart.replace(/-/g, "")}.com`;
  }
  if (stackName) {
    const withoutSuffix = stackName.replace(/-mailserver$/, "");
    return withoutSuffix.replace(/-/g, ".");
  }
  return null;
}
function resolveStackName(domain, appPath, explicitStackName) {
  if (explicitStackName) {
    return explicitStackName;
  }
  if (domain) {
    return `${domain.replace(/\./g, "-")}-mailserver`;
  }
  const resolvedDomain = resolveDomain(appPath);
  if (resolvedDomain) {
    return `${resolvedDomain.replace(/\./g, "-")}-mailserver`;
  }
  throw new Error(
    "Cannot resolve stack name. Provide domain, appPath, or explicit stackName"
  );
}
async function getStackInfo(config) {
  const region = config.region || process.env["AWS_REGION"] || "us-east-1";
  const profile = config.profile || process.env["AWS_PROFILE"] || "hepe-admin-mfa";
  const domain = config.domain || resolveDomain(config.appPath, config.stackName) || "emcnotary.com";
  const stackName = resolveStackName(
    config.domain,
    config.appPath,
    config.stackName
  );
  const credentials = fromIni({ profile });
  const cfClient = new CloudFormationClient({ region, credentials });
  const ssmClient = new SSMClient({ region, credentials });
  const ec2Client = new EC2Client({ region, credentials });
  const stackResp = await cfClient.send(
    new DescribeStacksCommand({ StackName: stackName })
  );
  if (!stackResp.Stacks || stackResp.Stacks.length === 0) {
    throw new Error(`Stack ${stackName} not found`);
  }
  const stack = stackResp.Stacks[0];
  const outputs = {};
  if (stack.Outputs) {
    for (const output of stack.Outputs) {
      if (output.OutputKey && output.OutputValue) {
        outputs[output.OutputKey] = output.OutputValue;
      }
    }
  }
  const instanceId = outputs.RestorePrefix || outputs.InstanceId || outputs.InstancePublicIp;
  let instancePublicIp = outputs.InstancePublicIp;
  let instanceKeyName;
  if (instanceId && instanceId.startsWith("i-")) {
    try {
      const instancesResp = await ec2Client.send(
        new DescribeInstancesCommand({
          InstanceIds: [instanceId]
        })
      );
      const instance = instancesResp.Reservations?.[0]?.Instances?.[0];
      if (instance) {
        if (!instancePublicIp && instance.PublicIpAddress) {
          instancePublicIp = instance.PublicIpAddress;
        }
        if (instance.KeyName) {
          instanceKeyName = instance.KeyName;
        }
      }
    } catch (err) {
    }
  }
  if ((!instanceKeyName || !instancePublicIp) && stackName) {
    try {
      const instancesResp = await ec2Client.send(
        new DescribeInstancesCommand({
          Filters: [
            {
              Name: "tag:aws:cloudformation:stack-name",
              Values: [stackName]
            },
            {
              Name: "instance-state-name",
              Values: ["running", "stopped"]
            }
          ]
        })
      );
      const instance = instancesResp.Reservations?.[0]?.Instances?.[0];
      if (instance) {
        if (!instancePublicIp && instance.PublicIpAddress) {
          instancePublicIp = instance.PublicIpAddress;
        }
        if (!instanceKeyName && instance.KeyName) {
          instanceKeyName = instance.KeyName;
        }
      }
    } catch (err) {
    }
  }
  let adminPassword = outputs.AdminPassword;
  if (!adminPassword) {
    try {
      const ssmParamName = `/MailInABoxAdminPassword-${stackName}`;
      const ssmResp = await ssmClient.send(
        new GetParameterCommand({
          Name: ssmParamName,
          WithDecryption: true
        })
      );
      adminPassword = ssmResp.Parameter?.Value;
    } catch (err) {
    }
  }
  return {
    stackName,
    domain,
    region,
    outputs,
    instanceId,
    instancePublicIp,
    instanceKeyName,
    keyPairId: outputs.KeyPairId,
    adminPassword,
    hostedZoneId: outputs.HostedZoneId
  };
}
async function getStackInfoFromApp(appPath, config) {
  return getStackInfo({ ...config, appPath });
}
var init_stack_info = __esm({
  "libs/admin/admin-stack-info/src/lib/stack-info.ts"() {
  }
});

// libs/admin/admin-stack-info/src/index.ts
var init_src = __esm({
  "libs/admin/admin-stack-info/src/index.ts"() {
    init_stack_info();
  }
});

// libs/admin/admin-mail-backup/bin/mail-backup.ts
var require_mail_backup = __commonJS({
  "libs/admin/admin-mail-backup/bin/mail-backup.ts"() {
    init_backup();
    init_src();
    var log2 = (level, msg, meta = {}) => console.log(
      JSON.stringify({ ts: (/* @__PURE__ */ new Date()).toISOString(), level, msg, ...meta })
    );
    async function main() {
      const appPath = process.env.APP_PATH;
      const stackName = process.env.STACK_NAME;
      const domain = process.env.DOMAIN;
      let mailHost;
      let mailUser;
      let mailPass;
      if (appPath) {
        try {
          const stackInfo = await getStackInfoFromApp(appPath, {
            region: process.env.AWS_REGION,
            profile: process.env.AWS_PROFILE
          });
          mailHost = stackInfo.instancePublicIp || stackInfo.outputs.InstancePublicIp;
          mailUser = `admin@${stackInfo.domain}`;
          mailPass = stackInfo.adminPassword;
          log2("info", "Retrieved stack info", {
            stack: stackInfo.stackName,
            domain: stackInfo.domain,
            hasHost: !!mailHost,
            hasPassword: !!mailPass
          });
        } catch (err) {
          log2("warn", "Could not get stack info from app path", { error: String(err) });
        }
      } else if (stackName || domain) {
        try {
          const stackInfo = await getStackInfo({
            stackName,
            domain,
            region: process.env.AWS_REGION,
            profile: process.env.AWS_PROFILE
          });
          mailHost = stackInfo.instancePublicIp || stackInfo.outputs.InstancePublicIp;
          mailUser = `admin@${stackInfo.domain}`;
          mailPass = stackInfo.adminPassword;
          log2("info", "Retrieved stack info", {
            stack: stackInfo.stackName,
            domain: stackInfo.domain,
            hasHost: !!mailHost,
            hasPassword: !!mailPass
          });
        } catch (err) {
          log2("warn", "Could not get stack info", { error: String(err) });
        }
      }
      const need = (k, fallback) => {
        const v = process.env[k];
        if (v)
          return v;
        if (fallback)
          return fallback;
        throw new Error(`Missing ${k}`);
      };
      await backupMailbox({
        host: need("MAIL_HOST", mailHost),
        port: Number(process.env.MAIL_PORT ?? 993),
        secure: process.env.MAIL_SECURE ? process.env.MAIL_SECURE === "1" : true,
        user: need("MAIL_USER", mailUser),
        pass: need("MAIL_PASS", mailPass),
        s3Bucket: process.env.MAIL_BACKUP_BUCKET,
        s3Prefix: process.env.MAIL_BACKUP_PREFIX,
        includeMailboxes: process.env.MAIL_INCLUDE?.split(",").filter(Boolean),
        excludeMailboxes: process.env.MAIL_EXCLUDE?.split(",").filter(Boolean)
      }).then((r) => log2("info", "backup complete", r)).catch((e) => {
        log2("error", e.message);
        process.exit(1);
      });
    }
    main();
  }
});
export default require_mail_backup();
