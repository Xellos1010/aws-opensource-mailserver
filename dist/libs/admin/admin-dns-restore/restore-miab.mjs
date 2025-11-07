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
      "emcnotary": "emcnotary.com",
      "askdaokapra": "askdaokapra.com"
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
  if (adminPassword && adminPassword.startsWith("/MailInABoxAdminPassword-")) {
    try {
      const ssmResp = await ssmClient.send(
        new GetParameterCommand({
          Name: adminPassword,
          WithDecryption: true
        })
      );
      adminPassword = ssmResp.Parameter?.Value;
    } catch (err) {
    }
  }
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

// libs/admin/admin-credentials/src/lib/credentials.ts
async function getAdminCredentials(config) {
  let stackInfo;
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
  if (!stackInfo.adminPassword) {
    throw new Error(
      `Admin password not found for stack ${stackInfo.stackName}. Check SSM parameter: /MailInABoxAdminPassword-${stackInfo.stackName}`
    );
  }
  const email = `admin@${stackInfo.domain}`;
  const adminUrl = `https://${stackInfo.domain}/admin`;
  log("info", "Retrieved admin credentials", {
    domain: stackInfo.domain,
    stackName: stackInfo.stackName,
    hasPassword: !!stackInfo.adminPassword
  });
  return {
    email,
    password: stackInfo.adminPassword,
    domain: stackInfo.domain,
    adminUrl
  };
}
var log;
var init_credentials = __esm({
  "libs/admin/admin-credentials/src/lib/credentials.ts"() {
    "use strict";
    init_src();
    log = (level, msg, meta = {}) => console.log(
      JSON.stringify({ ts: (/* @__PURE__ */ new Date()).toISOString(), level, msg, ...meta })
    );
  }
});

// libs/admin/admin-credentials/src/index.ts
var init_src2 = __esm({
  "libs/admin/admin-credentials/src/index.ts"() {
    "use strict";
    init_credentials();
  }
});

// libs/admin/admin-dns-restore/src/lib/restore-miab.ts
import * as fs from "node:fs";
function normalizeValue(value, rtype) {
  if ((rtype === "CNAME" || rtype === "MX" || rtype === "NS") && value.endsWith(".")) {
    return value.slice(0, -1);
  }
  return value;
}
async function makeApiCall(method, path, data, baseUrl, email, password) {
  const url = `${baseUrl}${path}`;
  log2("info", "Making API call", { method, url });
  const headers = {
    "Content-Type": "application/x-www-form-urlencoded"
  };
  const auth = Buffer.from(`${email}:${password}`).toString("base64");
  headers["Authorization"] = `Basic ${auth}`;
  const body = data ? new URLSearchParams({ value: data }).toString() : void 0;
  try {
    const response = await fetch(url, {
      method,
      headers,
      body
    });
    const responseBody = await response.text();
    const httpCode = response.status;
    log2("info", "API response", { method, path, httpCode });
    return { httpCode, body: responseBody };
  } catch (err) {
    log2("error", "API call failed", { error: String(err), method, path });
    throw err;
  }
}
async function restoreDnsFromBackup(config) {
  const dryRun = config.dryRun ?? process.env["DRY_RUN"] === "1";
  log2("info", "Reading backup file", { file: config.backupFile });
  const backupContent = fs.readFileSync(config.backupFile, "utf-8");
  const backupRecords = JSON.parse(backupContent);
  if (!Array.isArray(backupRecords) || backupRecords.length === 0) {
    throw new Error("Backup file must contain an array of DNS records");
  }
  log2("info", "Retrieving admin credentials");
  const credentials = await getAdminCredentials({
    appPath: config.appPath,
    stackName: config.stackName,
    domain: config.domain,
    region: config.region,
    profile: config.profile
  });
  const baseUrl = `https://box.${credentials.domain}`;
  const zone = credentials.domain;
  log2("info", "Preparing to restore DNS records", {
    domain: credentials.domain,
    recordCount: backupRecords.length,
    dryRun
  });
  if (dryRun) {
    console.log("\n\u26A0\uFE0F  DRY RUN MODE - No changes will be applied\n");
  }
  let successCount = 0;
  let errorCount = 0;
  const errors = [];
  for (const record of backupRecords) {
    const { qname, rtype, value } = record;
    if (qname === zone && rtype === "A") {
      log2("warn", "Skipping root domain A record (managed by mail server)", { qname, rtype });
      successCount++;
      continue;
    }
    const normalizedValue = normalizeValue(value, rtype);
    const apiPath = `/admin/dns/custom/${qname}/${rtype}`;
    log2("info", "Restoring DNS record", {
      qname,
      rtype,
      value: normalizedValue
    });
    if (dryRun) {
      console.log(`[DRY RUN] Would set ${rtype} record: ${qname} -> ${normalizedValue}`);
      successCount++;
      continue;
    }
    try {
      const result = await makeApiCall(
        "POST",
        apiPath,
        normalizedValue,
        baseUrl,
        credentials.email,
        credentials.password
      );
      if (result.httpCode === 200) {
        successCount++;
        console.log(`\u2713 Set ${rtype} record: ${qname} -> ${normalizedValue}`);
      } else {
        errorCount++;
        const error = `HTTP ${result.httpCode}: ${result.body}`;
        errors.push({ record, error });
        console.error(`\u2717 Failed to set ${rtype} record: ${qname} (${error})`);
      }
    } catch (err) {
      errorCount++;
      const error = String(err);
      errors.push({ record, error });
      console.error(`\u2717 Failed to set ${rtype} record: ${qname} (${error})`);
    }
  }
  console.log("\n=== Restore Summary ===");
  console.log(`Total records: ${backupRecords.length}`);
  console.log(`Success: ${successCount}`);
  console.log(`Errors: ${errorCount}`);
  if (errors.length > 0) {
    console.log("\n=== Errors ===");
    for (const { record, error } of errors) {
      console.error(`  ${record.qname} ${record.rtype}: ${error}`);
    }
  }
  if (errorCount > 0) {
    throw new Error(`DNS restore completed with ${errorCount} errors`);
  }
  log2("info", "DNS restore complete", { successCount, errorCount });
}
var log2;
var init_restore_miab = __esm({
  "libs/admin/admin-dns-restore/src/lib/restore-miab.ts"() {
    "use strict";
    init_src2();
    log2 = (level, msg, meta = {}) => console.log(
      JSON.stringify({ ts: (/* @__PURE__ */ new Date()).toISOString(), level, msg, ...meta })
    );
  }
});

// libs/admin/admin-dns-restore/bin/restore-miab.ts
var require_restore_miab = __commonJS({
  "libs/admin/admin-dns-restore/bin/restore-miab.ts"() {
    init_restore_miab();
    async function main() {
      const backupFile = process.env["BACKUP_FILE"];
      const appPath = process.env["APP_PATH"];
      const stackName = process.env["STACK_NAME"];
      const domain = process.env["DOMAIN"];
      const dryRun = process.env["DRY_RUN"] === "1";
      if (!backupFile) {
        console.error("\n\u2717 Missing BACKUP_FILE environment variable.");
        process.exit(1);
      }
      try {
        await restoreDnsFromBackup({
          backupFile,
          appPath,
          stackName,
          domain,
          region: process.env["AWS_REGION"],
          profile: process.env["AWS_PROFILE"],
          dryRun
        });
        console.log("\n\u2713 DNS restore complete");
      } catch (err) {
        console.error(`
\u2717 DNS restore failed: ${String(err)}`);
        process.exit(1);
      }
    }
    main();
  }
});
export default require_restore_miab();
