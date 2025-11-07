#!/usr/bin/env node
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// libs/support-scripts/aws/authentication/src/lib/mfa-user.ts
async function prompt(promptText) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  const answer = await new Promise(
    (res) => rl.question(promptText, res)
  );
  rl.close();
  return answer.trim();
}
function loadConfig() {
  return {
    mfaArn: process.env.MFA_DEVICE_ARN ?? "arn:aws:iam::413988044972:mfa/Evans-Phone",
    sourceProfile: process.env.SOURCE_PROFILE ?? "hepe-admin",
    targetProfile: process.env.TARGET_PROFILE ?? "hepe-admin-mfa",
    durationSeconds: Number(process.env.DURATION_SECONDS ?? 43200),
    dryRun: process.env.DRY_RUN === "1",
    region: process.env.AWS_REGION ?? "us-east-1"
  };
}
async function getSession(cfg, mfaCode) {
  const credentialsProvider = (0, import_credential_providers.fromIni)({ profile: cfg.sourceProfile });
  const client = new import_client_sts.STSClient({
    region: cfg.region,
    credentials: credentialsProvider
  });
  const cmd = new import_client_sts.GetSessionTokenCommand({
    SerialNumber: cfg.mfaArn,
    TokenCode: mfaCode,
    DurationSeconds: cfg.durationSeconds
  });
  const out = await client.send(cmd);
  if (!out.Credentials) {
    throw new Error("Failed to get session token");
  }
  return {
    accessKeyId: out.Credentials.AccessKeyId,
    secretAccessKey: out.Credentials.SecretAccessKey,
    sessionToken: out.Credentials.SessionToken,
    expiration: out.Credentials.Expiration?.toISOString()
  };
}
function updateCredentialsFile(targetProfile, creds) {
  const credPath = path.join(os.homedir(), ".aws", "credentials");
  const src = fs.existsSync(credPath) ? fs.readFileSync(credPath, "utf-8") : "";
  const ini = src ? (0, import_ini.parse)(src) : {};
  ini[targetProfile] = ini[targetProfile] ?? {};
  ini[targetProfile].aws_access_key_id = creds.accessKeyId;
  ini[targetProfile].aws_secret_access_key = creds.secretAccessKey;
  ini[targetProfile].aws_session_token = creds.sessionToken;
  fs.mkdirSync(path.dirname(credPath), { recursive: true });
  fs.writeFileSync(credPath, (0, import_ini.stringify)(ini), { mode: 384 });
}
async function main() {
  if (process.env.FEATURE_NX_SCRIPTS_ENABLED !== "1" && process.env.FEATURE_NX_SCRIPTS_ENABLED !== "true") {
    log(
      "warn",
      "Nx scripts feature flag not enabled. Set FEATURE_NX_SCRIPTS_ENABLED=1 to use.",
      { featureFlag: "FEATURE_NX_SCRIPTS_ENABLED" }
    );
  }
  const cfg = loadConfig();
  log("info", "Starting MFA auth", {
    sourceProfile: cfg.sourceProfile,
    targetProfile: cfg.targetProfile,
    duration: cfg.durationSeconds,
    dryRun: !!cfg.dryRun
  });
  const code = await prompt(`Enter MFA code for ${cfg.sourceProfile}: `);
  if (!/^\d{6}$/.test(code)) {
    throw new Error("MFA code must be 6 digits");
  }
  const session = await getSession(cfg, code);
  if (cfg.dryRun) {
    log("info", "DRY_RUN: would write temporary credentials", {
      targetProfile: cfg.targetProfile,
      expires: session.expiration
    });
  } else {
    updateCredentialsFile(cfg.targetProfile, session);
    log("info", "Temporary credentials written to credentials file", {
      targetProfile: cfg.targetProfile,
      expires: session.expiration
    });
  }
  process.env.AWS_ACCESS_KEY_ID = session.accessKeyId;
  process.env.AWS_SECRET_ACCESS_KEY = session.secretAccessKey;
  process.env.AWS_SESSION_TOKEN = session.sessionToken;
  log("info", "Temporary credentials ready", {
    targetProfile: cfg.targetProfile,
    note: `Use --profile ${cfg.targetProfile}`,
    expires: session.expiration
  });
  console.log(
    `
Temporary credentials set for profile '${cfg.targetProfile}' (valid for ${Math.floor(cfg.durationSeconds / 3600)} hours)`
  );
  console.log(`Original credentials in '${cfg.sourceProfile}' remain unchanged`);
  console.log(`Use AWS commands with: aws ... --profile ${cfg.targetProfile}`);
  console.log("Environment variables are also set for the current session");
}
var import_client_sts, import_credential_providers, fs, os, path, readline, crypto, import_ini, log;
var init_mfa_user = __esm({
  "libs/support-scripts/aws/authentication/src/lib/mfa-user.ts"() {
    import_client_sts = require("@aws-sdk/client-sts");
    import_credential_providers = require("@aws-sdk/credential-providers");
    fs = __toESM(require("node:fs"));
    os = __toESM(require("node:os"));
    path = __toESM(require("node:path"));
    readline = __toESM(require("node:readline"));
    crypto = __toESM(require("node:crypto"));
    import_ini = require("ini");
    log = (level, msg, meta = {}) => {
      const rec = {
        ts: (/* @__PURE__ */ new Date()).toISOString(),
        level,
        msg,
        ...meta,
        runId: process.env.RUN_ID || crypto.randomUUID()
      };
      console.log(JSON.stringify(rec));
    };
  }
});

// libs/support-scripts/aws/authentication/src/index.ts
var src_exports = {};
__export(src_exports, {
  main: () => main
});
var init_src = __esm({
  "libs/support-scripts/aws/authentication/src/index.ts"() {
    init_mfa_user();
  }
});

// libs/admin/admin-dns-backup/src/lib/backup.ts
async function backupDns(cfg = {}) {
  const r53 = new import_client_route_53.Route53Client({});
  const s3 = new import_client_s3.S3Client({});
  const stamp = (/* @__PURE__ */ new Date()).toISOString().replace(/[:.]/g, "-");
  const zonesResp = await r53.send(new import_client_route_53.ListHostedZonesCommand({}));
  const zones = zonesResp.HostedZones?.filter(
    (z) => !cfg.zones || cfg.zones.includes(z.Id.replace("/hostedzone/", ""))
  ) ?? [];
  const domainName = cfg.domain ? cfg.domain.replace(/\./g, "-") : void 0;
  const outDir = cfg.outputDir || (domainName ? path2.resolve("dist/backups", domainName, "dns", stamp) : path2.resolve("dist/backups/dns", stamp));
  fs2.mkdirSync(outDir, { recursive: true });
  for (const z of zones) {
    const zoneId = z.Id.replace("/hostedzone/", "");
    const rr = await r53.send(
      new import_client_route_53.ListResourceRecordSetsCommand({ HostedZoneId: z.Id })
    );
    const data = {
      zoneId,
      name: z.Name,
      rrsets: rr.ResourceRecordSets ?? []
    };
    const file = path2.join(outDir, `${zoneId}.json`);
    fs2.writeFileSync(file, JSON.stringify(data, null, 2));
    if (cfg.bucket) {
      const key = `${cfg.prefix ?? "dns/"}${stamp}/${zoneId}.json`;
      await s3.send(
        new import_client_s3.PutObjectCommand({
          Bucket: cfg.bucket,
          Key: key,
          Body: JSON.stringify(data)
        })
      );
    }
  }
  return outDir;
}
var import_client_route_53, import_client_s3, fs2, path2;
var init_backup = __esm({
  "libs/admin/admin-dns-backup/src/lib/backup.ts"() {
    import_client_route_53 = require("@aws-sdk/client-route-53");
    import_client_s3 = require("@aws-sdk/client-s3");
    fs2 = __toESM(require("node:fs"));
    path2 = __toESM(require("node:path"));
  }
});

// libs/admin/admin-dns-backup/src/index.ts
var src_exports2 = {};
__export(src_exports2, {
  backupDns: () => backupDns
});
var init_src2 = __esm({
  "libs/admin/admin-dns-backup/src/index.ts"() {
    init_backup();
  }
});

// libs/admin/admin-mail-backup/src/lib/backup.ts
async function dumpMailbox(client, mailboxPath, outDir) {
  const safe = mailboxPath.replace(/[\\/]/g, "_");
  const dest = path3.join(outDir, `${safe}.eml.ndjson`);
  const write = fs3.createWriteStream(dest, { flags: "w" });
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
      await new Promise((resolve3) => write.once("drain", () => resolve3()));
    }
    count++;
  }
  write.end();
  await new Promise((resolve3) => write.on("close", () => resolve3()));
  log2("info", "mailbox dumped", {
    mailbox: mailboxPath,
    messages: count,
    file: dest
  });
  return dest;
}
async function tarGzipDirectory(srcDir, outFile) {
  const gz = (0, import_node_zlib.createGzip)({ level: 9 });
  const tarStream = tar.create(
    { gzip: false, cwd: srcDir },
    fs3.readdirSync(srcDir)
  );
  const out = fs3.createWriteStream(outFile, { mode: 384 });
  await (0, import_promises.pipeline)(tarStream, gz, out);
  return outFile;
}
async function uploadTarToS3(tarPath, bucket, key, region) {
  const s3 = new import_client_s32.S3Client({ region });
  const uploader = new import_lib_storage.Upload({
    client: s3,
    params: { Bucket: bucket, Key: key, Body: fs3.createReadStream(tarPath) },
    partSize: 10 * 1024 * 1024,
    // 10MB
    leavePartsOnError: false
  });
  await uploader.done();
  return `s3://${bucket}/${key}`;
}
async function backupMailbox(cfg) {
  const stamp = (/* @__PURE__ */ new Date()).toISOString().replace(/[:.]/g, "-");
  const runId = crypto2.randomUUID();
  const domainName = cfg.domain ? cfg.domain.replace(/\./g, "-") : void 0;
  const workDir = cfg.outputDir || (domainName ? path3.resolve("dist/backups", domainName, "mail", `${stamp}-${runId}`) : path3.resolve("dist/backups/mail", `${stamp}-${runId}`));
  fs3.mkdirSync(workDir, { recursive: true });
  const client = new import_imapflow.ImapFlow({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    auth: { user: cfg.user, pass: cfg.pass },
    logger: false
  });
  log2("info", "connecting to IMAP", {
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
  const tarPath = path3.join(path3.dirname(workDir), tarName);
  await tarGzipDirectory(workDir, tarPath);
  log2("info", "tarball created", { tarPath });
  if (cfg.s3Bucket) {
    const key = `${cfg.s3Prefix ?? "mail/"}${tarName}`;
    const s3Uri = await uploadTarToS3(
      tarPath,
      cfg.s3Bucket,
      key,
      process.env["AWS_REGION"]
    );
    log2("info", "uploaded to s3", { s3Uri });
    return { outDir: workDir, tarPath, s3Uri };
  }
  return { outDir: workDir, tarPath };
}
var import_imapflow, fs3, path3, crypto2, tar, import_promises, import_node_zlib, import_client_s32, import_lib_storage, log2;
var init_backup2 = __esm({
  "libs/admin/admin-mail-backup/src/lib/backup.ts"() {
    import_imapflow = require("imapflow");
    fs3 = __toESM(require("node:fs"));
    path3 = __toESM(require("node:path"));
    crypto2 = __toESM(require("node:crypto"));
    tar = __toESM(require("tar"));
    import_promises = require("node:stream/promises");
    import_node_zlib = require("node:zlib");
    import_client_s32 = require("@aws-sdk/client-s3");
    import_lib_storage = require("@aws-sdk/lib-storage");
    log2 = (level, msg, meta = {}) => console.log(
      JSON.stringify({ ts: (/* @__PURE__ */ new Date()).toISOString(), level, msg, ...meta })
    );
  }
});

// libs/admin/admin-mail-backup/src/index.ts
var src_exports3 = {};
__export(src_exports3, {
  backupMailbox: () => backupMailbox
});
var init_src3 = __esm({
  "libs/admin/admin-mail-backup/src/index.ts"() {
    init_backup2();
  }
});

// libs/admin/admin-ec2/src/lib/ec2.ts
var import_client_ec2, ec2, restart, stop, start, changeType;
var init_ec2 = __esm({
  "libs/admin/admin-ec2/src/lib/ec2.ts"() {
    import_client_ec2 = require("@aws-sdk/client-ec2");
    ec2 = new import_client_ec2.EC2Client({});
    restart = async (id) => ec2.send(new import_client_ec2.RebootInstancesCommand({ InstanceIds: [id] }));
    stop = async (id) => ec2.send(new import_client_ec2.StopInstancesCommand({ InstanceIds: [id] }));
    start = async (id) => ec2.send(new import_client_ec2.StartInstancesCommand({ InstanceIds: [id] }));
    changeType = async (id, instanceType) => ec2.send(
      new import_client_ec2.ModifyInstanceAttributeCommand({
        InstanceId: id,
        InstanceType: { Value: instanceType }
      })
    );
    if (require.main === module) {
      const [, , cmd, id, arg] = process.argv;
      if (!cmd || !id) {
        console.error(
          "usage: ec2 <restart|stop|start|type> <instanceId> [t3.medium]"
        );
        process.exit(2);
      }
      (async () => {
        if (cmd === "restart")
          await restart(id);
        else if (cmd === "stop")
          await stop(id);
        else if (cmd === "start")
          await start(id);
        else if (cmd === "type")
          await changeType(id, arg);
        else
          throw new Error("unknown command");
        console.log(`ok: ${cmd} ${id} ${arg ?? ""}`.trim());
      })().catch((e) => {
        console.error(e);
        process.exit(1);
      });
    }
  }
});

// libs/admin/admin-ec2/src/index.ts
var src_exports4 = {};
__export(src_exports4, {
  changeType: () => changeType,
  restart: () => restart,
  start: () => start,
  stop: () => stop
});
var init_src4 = __esm({
  "libs/admin/admin-ec2/src/index.ts"() {
    init_ec2();
  }
});

// libs/admin/admin-kms/src/lib/kms.ts
var import_client_kms, kms, enableRotation, disableRotation, rotationStatus;
var init_kms = __esm({
  "libs/admin/admin-kms/src/lib/kms.ts"() {
    import_client_kms = require("@aws-sdk/client-kms");
    kms = new import_client_kms.KMSClient({});
    enableRotation = async (keyId) => kms.send(new import_client_kms.EnableKeyRotationCommand({ KeyId: keyId }));
    disableRotation = async (keyId) => kms.send(new import_client_kms.DisableKeyRotationCommand({ KeyId: keyId }));
    rotationStatus = async (keyId) => kms.send(new import_client_kms.GetKeyRotationStatusCommand({ KeyId: keyId }));
    if (require.main === module) {
      const [, , cmd, keyId] = process.argv;
      if (!cmd || !keyId) {
        console.error("usage: kms <enable|disable|status> <keyId>");
        process.exit(2);
      }
      (async () => {
        if (cmd === "enable")
          await enableRotation(keyId);
        else if (cmd === "disable")
          await disableRotation(keyId);
        else if (cmd === "status")
          console.log(await rotationStatus(keyId));
        else
          throw new Error("unknown cmd");
        console.log("ok");
      })().catch((e) => {
        console.error(e);
        process.exit(1);
      });
    }
  }
});

// libs/admin/admin-kms/src/index.ts
var src_exports5 = {};
__export(src_exports5, {
  disableRotation: () => disableRotation,
  enableRotation: () => enableRotation,
  rotationStatus: () => rotationStatus
});
var init_src5 = __esm({
  "libs/admin/admin-kms/src/index.ts"() {
    init_kms();
  }
});

// libs/admin/admin-ssl-check/src/lib/check.ts
async function getCertInfo(hostname, options = {}) {
  const port = options.port ?? 443;
  const timeout = options.timeout ?? 1e4;
  const servername = options.servername ?? hostname;
  return new Promise((resolve3, reject) => {
    const socket = tls.connect(
      { host: hostname, port, servername },
      () => {
        const cert = socket.getPeerCertificate(true);
        if (!cert || Object.keys(cert).length === 0) {
          socket.destroy();
          reject(new Error("No certificate returned"));
          return;
        }
        const validFrom = new Date(cert.valid_from);
        const validTo = new Date(cert.valid_to);
        const issuer = cert.issuer?.CN || JSON.stringify(cert.issuer);
        const subject = cert.subject?.CN || JSON.stringify(cert.subject);
        const sanRaw = cert.subjectaltname || "";
        const subjectAltNames = sanRaw.split(", ").map((s) => s.replace(/^DNS:/, "")).filter(Boolean);
        socket.destroy();
        resolve3({
          validFrom,
          validTo,
          issuer,
          subject,
          subjectAltNames
        });
      }
    );
    socket.on("error", (err) => {
      socket.destroy();
      reject(err);
    });
    socket.setTimeout(timeout, () => {
      socket.destroy();
      reject(new Error(`Connection timeout after ${timeout}ms`));
    });
  });
}
async function checkCertificate(hostname, options = {}) {
  const port = options.port ?? 443;
  const warnings = [];
  const errors = [];
  try {
    const info = await getCertInfo(hostname, options);
    const now = /* @__PURE__ */ new Date();
    const daysLeft = Math.floor(
      (info.validTo.getTime() - now.getTime()) / (1e3 * 60 * 60 * 24)
    );
    if (info.validTo < now) {
      errors.push(`Certificate expired on ${info.validTo.toISOString()}`);
    }
    if (daysLeft < 14 && daysLeft >= 0) {
      warnings.push(
        `Certificate expires in ${daysLeft} days \u2014 consider renewal`
      );
    }
    const hostnameLower = hostname.toLowerCase();
    const sanLower = info.subjectAltNames.map((s) => s.toLowerCase());
    if (!sanLower.includes(hostnameLower)) {
      warnings.push(
        `Hostname ${hostname} not in SAN list: ${info.subjectAltNames.join(", ")}`
      );
    }
    if (info.validFrom > now) {
      warnings.push(
        `Certificate not yet valid (valid from ${info.validFrom.toISOString()})`
      );
    }
    return {
      hostname,
      port,
      isValid: errors.length === 0 && info.validTo >= now,
      daysUntilExpiry: daysLeft,
      expiresSoon: daysLeft < 14 && daysLeft >= 0,
      info,
      warnings,
      errors
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    errors.push(`Failed to retrieve certificate: ${errorMessage}`);
    return {
      hostname,
      port,
      isValid: false,
      daysUntilExpiry: -1,
      expiresSoon: false,
      info: {
        validFrom: /* @__PURE__ */ new Date(),
        validTo: /* @__PURE__ */ new Date(),
        issuer: "unknown",
        subject: "unknown",
        subjectAltNames: []
      },
      warnings,
      errors
    };
  }
}
function formatCertCheckResult(result) {
  const lines = [];
  lines.push(`
Certificate Status for ${result.hostname}:${result.port}`);
  lines.push("\u2500".repeat(50));
  if (result.errors.length > 0) {
    lines.push("\u274C ERRORS:");
    result.errors.forEach((err) => lines.push(`   ${err}`));
  }
  if (result.warnings.length > 0) {
    lines.push("\u26A0\uFE0F  WARNINGS:");
    result.warnings.forEach((warn) => lines.push(`   ${warn}`));
  }
  if (result.isValid && result.errors.length === 0) {
    lines.push("\u2714 Certificate is valid");
  }
  lines.push(`
Issuer: ${result.info.issuer}`);
  lines.push(`Subject: ${result.info.subject}`);
  lines.push(`Valid from: ${result.info.validFrom.toISOString()}`);
  lines.push(`Valid to:   ${result.info.validTo.toISOString()}`);
  if (result.daysUntilExpiry >= 0) {
    lines.push(`Days until expiry: ${result.daysUntilExpiry}`);
  } else if (result.daysUntilExpiry < 0 && result.info.validTo < /* @__PURE__ */ new Date()) {
    lines.push(`Certificate expired ${Math.abs(result.daysUntilExpiry)} days ago`);
  }
  if (result.info.subjectAltNames.length > 0) {
    lines.push(`Subject Alternative Names: ${result.info.subjectAltNames.join(", ")}`);
  }
  return lines.join("\n");
}
var tls;
var init_check = __esm({
  "libs/admin/admin-ssl-check/src/lib/check.ts"() {
    tls = __toESM(require("node:tls"));
    if (require.main === module) {
      const hostname = process.argv[2];
      const portArg = process.argv[3];
      if (!hostname) {
        console.error("Usage: ssl-check <hostname> [port]");
        process.exit(1);
      }
      const options = {};
      if (portArg) {
        const port = parseInt(portArg, 10);
        if (isNaN(port)) {
          console.error(`Invalid port: ${portArg}`);
          process.exit(1);
        }
        options.port = port;
      }
      checkCertificate(hostname, options).then((result) => {
        console.log(formatCertCheckResult(result));
        process.exit(result.isValid ? 0 : 1);
      }).catch((err) => {
        console.error("Error:", err instanceof Error ? err.message : String(err));
        process.exit(2);
      });
    }
  }
});

// libs/admin/admin-ssl-check/src/index.ts
var src_exports6 = {};
__export(src_exports6, {
  checkCertificate: () => checkCertificate,
  formatCertCheckResult: () => formatCertCheckResult,
  getCertInfo: () => getCertInfo
});
var init_src6 = __esm({
  "libs/admin/admin-ssl-check/src/index.ts"() {
    init_check();
  }
});

// libs/admin/admin-ssl-provision/src/lib/provision.ts
async function provisionCertificate(options) {
  console.log("SSL Certificate Provisioning (Scaffolded)");
  console.log("Domains:", options.domains.join(", "));
  console.log("Email:", options.email || "not specified");
  console.log("Challenge Type:", options.challengeType || "http-01");
  console.log("\n\u26A0\uFE0F  This is a scaffolded implementation.");
  console.log("   Full implementation will be added when EMC-Notary server is ready.\n");
  return {
    success: false,
    domains: options.domains,
    certificates: options.domains.map((domain) => ({
      domain,
      status: "skipped",
      error: "Not yet implemented"
    }))
  };
}
async function checkDomainsNeedingCertificates(domains) {
  console.log("Checking domains for certificate provisioning...");
  console.log("Domains:", domains.join(", "));
  console.log("\n\u26A0\uFE0F  This is a scaffolded implementation.\n");
  return [];
}
async function deployCertificate(domain, certPath, targetPath) {
  console.log(`Deploying certificate for ${domain}`);
  console.log(`From: ${certPath}`);
  console.log(`To: ${targetPath}`);
  console.log("\n\u26A0\uFE0F  This is a scaffolded implementation.\n");
}
var init_provision = __esm({
  "libs/admin/admin-ssl-provision/src/lib/provision.ts"() {
    if (require.main === module) {
      const domains = process.argv.slice(2);
      if (domains.length === 0) {
        console.error("Usage: ssl-provision <domain1> [domain2 ...]");
        process.exit(1);
      }
      provisionCertificate({
        domains,
        email: process.env["ACME_EMAIL"],
        challengeType: process.env["ACME_CHALLENGE_TYPE"] || "http-01"
      }).then((result) => {
        console.log("Provision result:", JSON.stringify(result, null, 2));
        process.exit(0);
      }).catch((err) => {
        console.error("Error:", err instanceof Error ? err.message : String(err));
        process.exit(2);
      });
    }
  }
});

// libs/admin/admin-ssl-provision/src/index.ts
var src_exports7 = {};
__export(src_exports7, {
  checkDomainsNeedingCertificates: () => checkDomainsNeedingCertificates,
  deployCertificate: () => deployCertificate,
  provisionCertificate: () => provisionCertificate
});
var init_src7 = __esm({
  "libs/admin/admin-ssl-provision/src/index.ts"() {
    init_provision();
  }
});

// apps/ops-runner/src/main.ts
function need(k) {
  const v = process.env[k];
  if (!v)
    throw new Error(`Missing ${k}`);
  return v;
}
async function run() {
  const [, , cmd, ...args] = process.argv;
  if (!cmd || ["-h", "--help", "help"].includes(cmd)) {
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
    case "auth:mfa": {
      const mfaModule = await Promise.resolve().then(() => (init_src(), src_exports));
      await mfaModule.main();
      break;
    }
    case "dns:backup": {
      const dnsModule = await Promise.resolve().then(() => (init_src2(), src_exports2));
      const outDir = await dnsModule.backupDns({
        bucket: process.env.DNS_BACKUP_BUCKET,
        prefix: process.env.DNS_BACKUP_PREFIX
      });
      console.log("DNS backup \u2192", outDir);
      break;
    }
    case "mail:backup": {
      const mailModule = await Promise.resolve().then(() => (init_src3(), src_exports3));
      const r = await mailModule.backupMailbox({
        host: need("MAIL_HOST"),
        port: Number(process.env.MAIL_PORT ?? 993),
        secure: process.env.MAIL_SECURE ? process.env.MAIL_SECURE === "1" : true,
        user: need("MAIL_USER"),
        pass: need("MAIL_PASS"),
        s3Bucket: process.env.MAIL_BACKUP_BUCKET,
        s3Prefix: process.env.MAIL_BACKUP_PREFIX,
        includeMailboxes: process.env.MAIL_INCLUDE?.split(",").filter(Boolean),
        excludeMailboxes: process.env.MAIL_EXCLUDE?.split(",").filter(Boolean)
      });
      console.log("Mail backup complete:", r);
      break;
    }
    case "ec2:restart":
    case "ec2:stop":
    case "ec2:start":
    case "ec2:type": {
      const ec2Module = await Promise.resolve().then(() => (init_src4(), src_exports4));
      const id = process.env.INSTANCE_ID;
      if (!id)
        throw new Error("INSTANCE_ID is required");
      if (cmd === "ec2:restart")
        await ec2Module.restart(id);
      if (cmd === "ec2:stop")
        await ec2Module.stop(id);
      if (cmd === "ec2:start")
        await ec2Module.start(id);
      if (cmd === "ec2:type") {
        const itype = args[0] || process.env.INSTANCE_TYPE;
        if (!itype)
          throw new Error("INSTANCE_TYPE (or arg) required");
        await ec2Module.changeType(id, itype);
      }
      console.log("OK:", cmd, id, args.join(" "));
      break;
    }
    case "kms:enable":
    case "kms:disable":
    case "kms:status": {
      const kmsModule = await Promise.resolve().then(() => (init_src5(), src_exports5));
      const keyId = need("KMS_KEY_ID");
      if (cmd === "kms:enable")
        await kmsModule.enableRotation(keyId);
      if (cmd === "kms:disable")
        await kmsModule.disableRotation(keyId);
      if (cmd === "kms:status")
        console.log(await kmsModule.rotationStatus(keyId));
      console.log("OK:", cmd, keyId);
      break;
    }
    case "ssl:check": {
      const sslCheckModule = await Promise.resolve().then(() => (init_src6(), src_exports6));
      const hostname = args[0];
      if (!hostname) {
        throw new Error("ssl:check requires a hostname");
      }
      const portArg = args[1];
      const options = portArg ? { port: parseInt(portArg, 10) } : {};
      const result = await sslCheckModule.checkCertificate(hostname, options);
      console.log(sslCheckModule.formatCertCheckResult(result));
      process.exit(result.isValid ? 0 : 1);
      break;
    }
    case "ssl:provision": {
      const sslProvisionModule = await Promise.resolve().then(() => (init_src7(), src_exports7));
      const domains = args.length > 0 ? args : process.env.SSL_DOMAINS?.split(",").filter(Boolean) || [];
      if (domains.length === 0) {
        throw new Error(
          "ssl:provision requires domains as arguments or SSL_DOMAINS env var"
        );
      }
      const result = await sslProvisionModule.provisionCertificate({
        domains,
        email: process.env.ACME_EMAIL,
        challengeType: process.env.ACME_CHALLENGE_TYPE || "http-01"
      });
      console.log("Provisioning requested for:", domains.join(", "));
      console.log("Result:", JSON.stringify(result, null, 2));
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
//# sourceMappingURL=ops.cjs.map
