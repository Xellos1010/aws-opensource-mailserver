#!/usr/bin/env node
var __getOwnPropNames = Object.getOwnPropertyNames;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __commonJS = (cb, mod) => function __require() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};

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
  if (!instancePublicIp && instanceId) {
    try {
      const instancesResp = await ec2Client.send(
        new DescribeInstancesCommand({
          InstanceIds: [instanceId]
        })
      );
      if (instancesResp.Reservations && instancesResp.Reservations[0]?.Instances?.[0]?.PublicIpAddress) {
        instancePublicIp = instancesResp.Reservations[0].Instances[0].PublicIpAddress;
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
    adminPassword,
    hostedZoneId: outputs.HostedZoneId
  };
}
async function getStackInfoFromApp(appPath, config) {
  return getStackInfo({ ...config, appPath });
}
var init_stack_info = __esm({
  "libs/admin/admin-stack-info/src/lib/stack-info.ts"() {
    "use strict";
  }
});

// libs/admin/admin-stack-info/src/index.ts
var init_src = __esm({
  "libs/admin/admin-stack-info/src/index.ts"() {
    "use strict";
    init_stack_info();
  }
});

// libs/admin/admin-dns-backup/src/lib/backup.ts
import {
  Route53Client,
  ListHostedZonesCommand,
  ListResourceRecordSetsCommand
} from "@aws-sdk/client-route-53";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import * as fs from "node:fs";
import * as path from "node:path";
async function backupDns(cfg = {}) {
  const r53 = new Route53Client({});
  const s3 = new S3Client({});
  const stamp = (/* @__PURE__ */ new Date()).toISOString().replace(/[:.]/g, "-");
  const zonesResp = await r53.send(new ListHostedZonesCommand({}));
  const zones = zonesResp.HostedZones?.filter(
    (z) => !cfg.zones || cfg.zones.includes(z.Id.replace("/hostedzone/", ""))
  ) ?? [];
  const outDir = path.resolve("dist/backups/dns", stamp);
  fs.mkdirSync(outDir, { recursive: true });
  for (const z of zones) {
    const zoneId = z.Id.replace("/hostedzone/", "");
    const rr = await r53.send(
      new ListResourceRecordSetsCommand({ HostedZoneId: z.Id })
    );
    const data = {
      zoneId,
      name: z.Name,
      rrsets: rr.ResourceRecordSets ?? []
    };
    const file = path.join(outDir, `${zoneId}.json`);
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
    if (cfg.bucket) {
      const key = `${cfg.prefix ?? "dns/"}${stamp}/${zoneId}.json`;
      await s3.send(
        new PutObjectCommand({
          Bucket: cfg.bucket,
          Key: key,
          Body: JSON.stringify(data)
        })
      );
    }
  }
  return outDir;
}
var init_backup = __esm({
  "libs/admin/admin-dns-backup/src/lib/backup.ts"() {
    "use strict";
  }
});

// libs/admin/admin-dns-backup/src/index.ts
var init_src2 = __esm({
  "libs/admin/admin-dns-backup/src/index.ts"() {
    "use strict";
    init_backup();
  }
});

// libs/admin/admin-mail-backup/src/lib/backup.ts
import { ImapFlow } from "imapflow";
import * as fs2 from "node:fs";
import * as path2 from "node:path";
import * as crypto from "node:crypto";
import * as tar from "tar";
import { pipeline } from "node:stream/promises";
import { createGzip } from "node:zlib";
import { S3Client as S3Client2 } from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
async function dumpMailbox(client, mailboxPath, outDir) {
  const safe = mailboxPath.replace(/[\\/]/g, "_");
  const dest = path2.join(outDir, `${safe}.eml.ndjson`);
  const write = fs2.createWriteStream(dest, { flags: "w" });
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
      await new Promise((resolve4) => write.once("drain", () => resolve4()));
    }
    count++;
  }
  write.end();
  await new Promise((resolve4) => write.on("close", () => resolve4()));
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
    fs2.readdirSync(srcDir)
  );
  const out = fs2.createWriteStream(outFile, { mode: 384 });
  await pipeline(tarStream, gz, out);
  return outFile;
}
async function uploadTarToS3(tarPath, bucket, key, region) {
  const s3 = new S3Client2({ region });
  const uploader = new Upload({
    client: s3,
    params: { Bucket: bucket, Key: key, Body: fs2.createReadStream(tarPath) },
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
  const workDir = path2.resolve("dist/backups/mail", `${stamp}-${runId}`);
  fs2.mkdirSync(workDir, { recursive: true });
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
  const tarPath = path2.join(path2.dirname(workDir), tarName);
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
var init_backup2 = __esm({
  "libs/admin/admin-mail-backup/src/lib/backup.ts"() {
    "use strict";
    log = (level, msg, meta = {}) => console.log(
      JSON.stringify({ ts: (/* @__PURE__ */ new Date()).toISOString(), level, msg, ...meta })
    );
  }
});

// libs/admin/admin-mail-backup/src/index.ts
var init_src3 = __esm({
  "libs/admin/admin-mail-backup/src/index.ts"() {
    "use strict";
    init_backup2();
  }
});

// libs/admin/admin-backup-bridge/src/lib/backup-bridge.ts
import * as path3 from "node:path";
import * as fs3 from "node:fs";
async function backupBridge(config) {
  const timestamp = (/* @__PURE__ */ new Date()).toISOString().replace(/[:.]/g, "-");
  const errors = [];
  let dnsBackup;
  let mailBackup;
  log2("info", "Retrieving stack information", {
    appPath: config.appPath,
    stackName: config.stackName,
    domain: config.domain
  });
  let stackInfo;
  try {
    if (config.appPath) {
      stackInfo = await getStackInfoFromApp(config.appPath, {
        region: config.region,
        profile: config.profile
      });
    } else {
      stackInfo = await getStackInfo({
        stackName: config.stackName,
        domain: config.domain,
        region: config.region,
        profile: config.profile
      });
    }
    log2("info", "Stack information retrieved", {
      stackName: stackInfo.stackName,
      domain: stackInfo.domain,
      hasInstanceIp: !!stackInfo.instancePublicIp,
      hasAdminPassword: !!stackInfo.adminPassword,
      hasHostedZone: !!stackInfo.hostedZoneId
    });
  } catch (err) {
    const errorMsg = `Failed to get stack info: ${err}`;
    log2("error", errorMsg);
    errors.push(errorMsg);
    throw new Error(errorMsg);
  }
  if (!config.skipDns) {
    log2("info", "Starting DNS backup", {
      stackName: stackInfo.stackName,
      domain: stackInfo.domain
    });
    try {
      const dnsOutputDir = await backupDns({
        bucket: config.dnsBucket,
        prefix: config.dnsPrefix,
        zones: stackInfo.hostedZoneId ? [stackInfo.hostedZoneId] : void 0
      });
      dnsBackup = { outputDir: dnsOutputDir };
      log2("info", "DNS backup completed", { outputDir: dnsOutputDir });
    } catch (err) {
      const errorMsg = `DNS backup failed: ${err}`;
      log2("error", errorMsg);
      errors.push(errorMsg);
    }
  } else {
    log2("info", "Skipping DNS backup (skipDns=true)");
  }
  if (!config.skipMail) {
    log2("info", "Starting mail backup", {
      stackName: stackInfo.stackName,
      domain: stackInfo.domain,
      instanceIp: stackInfo.instancePublicIp
    });
    if (!stackInfo.instancePublicIp) {
      const errorMsg = "Cannot backup mail: instance public IP not found";
      log2("error", errorMsg);
      errors.push(errorMsg);
    } else if (!stackInfo.adminPassword) {
      const errorMsg = "Cannot backup mail: admin password not found";
      log2("error", errorMsg);
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
          excludeMailboxes: config.mailExclude
        });
        mailBackup = mailResult;
        log2("info", "Mail backup completed", {
          outDir: mailResult.outDir,
          tarPath: mailResult.tarPath,
          s3Uri: mailResult.s3Uri
        });
      } catch (err) {
        const errorMsg = `Mail backup failed: ${err}`;
        log2("error", errorMsg);
        errors.push(errorMsg);
      }
    }
  } else {
    log2("info", "Skipping mail backup (skipMail=true)");
  }
  const result = {
    timestamp,
    stackInfo: {
      stackName: stackInfo.stackName,
      domain: stackInfo.domain,
      instancePublicIp: stackInfo.instancePublicIp
    },
    dnsBackup,
    mailBackup,
    summary: {
      dnsSuccess: !!dnsBackup,
      mailSuccess: !!mailBackup,
      errors
    }
  };
  const summaryDir = path3.resolve("dist/backups", stackInfo.domain);
  fs3.mkdirSync(summaryDir, { recursive: true });
  const summaryPath = path3.join(summaryDir, `backup-summary-${timestamp}.json`);
  fs3.writeFileSync(summaryPath, JSON.stringify(result, null, 2));
  log2("info", "Backup summary written", { summaryPath });
  return result;
}
var log2;
var init_backup_bridge = __esm({
  "libs/admin/admin-backup-bridge/src/lib/backup-bridge.ts"() {
    "use strict";
    init_src();
    init_src2();
    init_src3();
    log2 = (level, msg, meta = {}) => console.log(
      JSON.stringify({ ts: (/* @__PURE__ */ new Date()).toISOString(), level, msg, ...meta })
    );
  }
});

// libs/admin/admin-backup-bridge/bin/backup-bridge.ts
var require_backup_bridge = __commonJS({
  "libs/admin/admin-backup-bridge/bin/backup-bridge.ts"() {
    init_backup_bridge();
    var log3 = (level, msg, meta = {}) => console.log(
      JSON.stringify({ ts: (/* @__PURE__ */ new Date()).toISOString(), level, msg, ...meta })
    );
    async function main() {
      const appPath = process.env["APP_PATH"];
      const stackName = process.env["STACK_NAME"];
      const domain = process.env["DOMAIN"];
      const skipDns = process.env["SKIP_DNS"] === "1" || process.env["SKIP_DNS"] === "true";
      const skipMail = process.env["SKIP_MAIL"] === "1" || process.env["SKIP_MAIL"] === "true";
      log3("info", "Starting backup bridge", {
        appPath,
        stackName,
        domain,
        skipDns,
        skipMail
      });
      try {
        const result = await backupBridge({
          appPath,
          stackName,
          domain,
          region: process.env["AWS_REGION"],
          profile: process.env["AWS_PROFILE"],
          skipDns,
          skipMail,
          dnsBucket: process.env["DNS_BACKUP_BUCKET"],
          dnsPrefix: process.env["DNS_BACKUP_PREFIX"],
          mailBucket: process.env["MAIL_BACKUP_BUCKET"],
          mailPrefix: process.env["MAIL_BACKUP_PREFIX"],
          mailInclude: process.env["MAIL_INCLUDE"]?.split(",").filter(Boolean),
          mailExclude: process.env["MAIL_EXCLUDE"]?.split(",").filter(Boolean)
        });
        console.log("\n=== Backup Summary ===");
        console.log(`Stack: ${result.stackInfo.stackName} (${result.stackInfo.domain})`);
        console.log(`Timestamp: ${result.timestamp}`);
        console.log(`DNS Backup: ${result.summary.dnsSuccess ? "\u2713 Success" : "\u2717 Failed"}`);
        if (result.dnsBackup) {
          console.log(`  Output: ${result.dnsBackup.outputDir}`);
        }
        console.log(`Mail Backup: ${result.summary.mailSuccess ? "\u2713 Success" : "\u2717 Failed"}`);
        if (result.mailBackup) {
          console.log(`  Output: ${result.mailBackup.outDir}`);
          console.log(`  Archive: ${result.mailBackup.tarPath}`);
          if (result.mailBackup.s3Uri) {
            console.log(`  S3: ${result.mailBackup.s3Uri}`);
          }
        }
        if (result.summary.errors.length > 0) {
          console.log("\nErrors:");
          result.summary.errors.forEach((err) => console.log(`  - ${err}`));
          process.exit(1);
        }
        log3("info", "Backup bridge completed successfully", {
          dnsSuccess: result.summary.dnsSuccess,
          mailSuccess: result.summary.mailSuccess
        });
      } catch (err) {
        log3("error", "Backup bridge failed", { error: String(err) });
        console.error("\nFatal error:", err);
        process.exit(1);
      }
    }
    main();
  }
});
export default require_backup_bridge();
