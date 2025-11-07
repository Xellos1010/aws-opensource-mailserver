#!/usr/bin/env node
var __getOwnPropNames = Object.getOwnPropertyNames;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __commonJS = (cb, mod) => function __require() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};

// libs/admin/admin-dns-restore/src/lib/restore.ts
import {
  Route53Client,
  ChangeResourceRecordSetsCommand,
  ListResourceRecordSetsCommand,
  ListHostedZonesCommand
} from "@aws-sdk/client-route-53";
import { fromIni } from "@aws-sdk/credential-providers";
import * as fs from "node:fs";
import * as path from "node:path";
function convertOldFormatToRRSets(oldRecords, hostedZoneId) {
  const rrsets = [];
  for (const record of oldRecords) {
    if (record.rtype === "NS" || record.rtype === "SOA") {
      continue;
    }
    const name = record.qname.endsWith(".") ? record.qname : `${record.qname}.`;
    rrsets.push({
      Name: name,
      Type: record.rtype,
      TTL: 300,
      // Default TTL
      ResourceRecords: [
        {
          Value: record.value
        }
      ]
    });
  }
  return rrsets;
}
function readBackupFile(filePath) {
  const fullPath = path.resolve(filePath);
  if (!fs.existsSync(fullPath)) {
    throw new Error(`Backup file not found: ${fullPath}`);
  }
  const content = fs.readFileSync(fullPath, "utf-8");
  const data = JSON.parse(content);
  if (Array.isArray(data)) {
    return data;
  } else if (data.zoneId && data.rrsets) {
    return data;
  } else {
    throw new Error(
      "Unknown backup format. Expected array of records or object with zoneId and rrsets."
    );
  }
}
async function findHostedZoneByDomain(client, domain) {
  const normalizedDomain = domain.endsWith(".") ? domain : `${domain}.`;
  try {
    const response = await client.send(new ListHostedZonesCommand({}));
    const zones = response.HostedZones || [];
    for (const zone of zones) {
      if (zone.Name === normalizedDomain) {
        return zone.Id?.replace("/hostedzone/", "") || null;
      }
    }
  } catch (err) {
    log("warn", "Could not list hosted zones", { error: String(err) });
  }
  return null;
}
async function getCurrentRecords(client, hostedZoneId) {
  const current = /* @__PURE__ */ new Map();
  try {
    const response = await client.send(
      new ListResourceRecordSetsCommand({ HostedZoneId: hostedZoneId })
    );
    if (response.ResourceRecordSets) {
      for (const rrset of response.ResourceRecordSets) {
        if (rrset.Type === "NS" || rrset.Type === "SOA") {
          continue;
        }
        const key = `${rrset.Name}:${rrset.Type}`;
        current.set(key, rrset);
      }
    }
  } catch (err) {
    log("warn", "Could not fetch current records", { error: String(err) });
  }
  return current;
}
async function restoreDns(config) {
  const region = config.region || process.env["AWS_REGION"] || "us-east-1";
  const profile = config.profile || process.env["AWS_PROFILE"] || "hepe-admin-mfa";
  const dryRun = config.dryRun ?? false;
  const credentials = fromIni({ profile });
  const client = new Route53Client({ region, credentials });
  log("info", "Reading backup file", { file: config.backupFile });
  const backupData = readBackupFile(config.backupFile);
  let hostedZoneId = config.hostedZoneId;
  let rrsets;
  if (Array.isArray(backupData)) {
    if (!hostedZoneId && !config.domain) {
      throw new Error(
        "hostedZoneId or domain required for old backup format"
      );
    }
    if (!hostedZoneId && config.domain) {
      log("info", "Looking up hosted zone by domain", { domain: config.domain });
      const foundZoneId = await findHostedZoneByDomain(client, config.domain);
      if (foundZoneId) {
        hostedZoneId = foundZoneId;
        log("info", "Found hosted zone", { hostedZoneId, domain: config.domain });
      } else {
        throw new Error(
          `Could not find hosted zone for domain: ${config.domain}. Please provide HOSTED_ZONE_ID.`
        );
      }
    }
    rrsets = convertOldFormatToRRSets(backupData, hostedZoneId);
  } else {
    hostedZoneId = backupData.zoneId;
    rrsets = backupData.rrsets.filter(
      (rr) => rr.Type !== "NS" && rr.Type !== "SOA"
    );
  }
  if (!hostedZoneId) {
    throw new Error("Could not determine hosted zone ID");
  }
  log("info", "Preparing to restore DNS records", {
    hostedZoneId,
    recordCount: rrsets.length,
    dryRun
  });
  const currentRecords = await getCurrentRecords(client, hostedZoneId);
  const changes = [];
  let created = 0;
  let updated = 0;
  let skipped = 0;
  for (const rrset of rrsets) {
    const key = `${rrset.Name}:${rrset.Type}`;
    const existing = currentRecords.get(key);
    if (existing) {
      changes.push({
        Action: "UPSERT",
        ResourceRecordSet: rrset
      });
      updated++;
      log("info", "Will update record", {
        name: rrset.Name,
        type: rrset.Type
      });
    } else {
      changes.push({
        Action: "CREATE",
        ResourceRecordSet: rrset
      });
      created++;
      log("info", "Will create record", {
        name: rrset.Name,
        type: rrset.Type
      });
    }
  }
  if (changes.length === 0) {
    log("info", "No changes to apply", { skipped });
    return { changes: 0, created: 0, updated: 0, skipped };
  }
  if (dryRun) {
    log("info", "Dry run - would apply changes", {
      total: changes.length,
      created,
      updated
    });
    return { changes: changes.length, created, updated, skipped };
  }
  const batchSize = 1e3;
  let totalApplied = 0;
  for (let i = 0; i < changes.length; i += batchSize) {
    const batch = changes.slice(i, i + batchSize);
    log("info", "Applying batch", {
      batch: Math.floor(i / batchSize) + 1,
      size: batch.length
    });
    try {
      const response = await client.send(
        new ChangeResourceRecordSetsCommand({
          HostedZoneId: hostedZoneId,
          ChangeBatch: {
            Changes: batch,
            Comment: `DNS restore from backup: ${path.basename(config.backupFile)}`
          }
        })
      );
      totalApplied += batch.length;
      log("info", "Batch applied", {
        changeId: response.ChangeInfo?.Id,
        status: response.ChangeInfo?.Status
      });
    } catch (err) {
      log("error", "Failed to apply batch", {
        error: String(err),
        batchStart: i,
        batchSize: batch.length
      });
      throw err;
    }
  }
  log("info", "DNS restore complete", {
    totalApplied,
    created,
    updated,
    skipped
  });
  return { changes: totalApplied, created, updated, skipped };
}
var log;
var init_restore = __esm({
  "libs/admin/admin-dns-restore/src/lib/restore.ts"() {
    "use strict";
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
import { fromIni as fromIni2 } from "@aws-sdk/credential-providers";
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
  const credentials = fromIni2({ profile });
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

// libs/admin/admin-dns-restore/bin/dns-restore.ts
var require_dns_restore = __commonJS({
  "libs/admin/admin-dns-restore/bin/dns-restore.ts"() {
    init_restore();
    init_src();
    var log2 = (level, msg, meta = {}) => console.log(
      JSON.stringify({ ts: (/* @__PURE__ */ new Date()).toISOString(), level, msg, ...meta })
    );
    async function main() {
      const backupFile = process.env["BACKUP_FILE"];
      const hostedZoneId = process.env["HOSTED_ZONE_ID"];
      const domain = process.env["DOMAIN"];
      const appPath = process.env["APP_PATH"];
      const stackName = process.env["STACK_NAME"];
      const dryRun = process.env["DRY_RUN"] === "1" || process.env["DRY_RUN"] === "true";
      if (!backupFile) {
        console.error("Error: BACKUP_FILE environment variable is required");
        console.error("\nUsage:");
        console.error("  BACKUP_FILE=/path/to/backup.json [HOSTED_ZONE_ID=...] [DOMAIN=...] [APP_PATH=...] [DRY_RUN=1] node dns-restore.mjs");
        console.error("\nExamples:");
        console.error("  BACKUP_FILE=Archive/backups/askdaokapra.com/dns/dns-backup-20250915-120236.json HOSTED_ZONE_ID=Z123456789 node dns-restore.mjs");
        console.error("  BACKUP_FILE=backup.json APP_PATH=apps/cdk-askdaokapra node dns-restore.mjs");
        console.error("  BACKUP_FILE=backup.json APP_PATH=apps/cdk-askdaokapra DRY_RUN=1 node dns-restore.mjs");
        process.exit(1);
      }
      let resolvedHostedZoneId = hostedZoneId;
      let resolvedDomain = domain;
      if (appPath && !resolvedHostedZoneId) {
        try {
          log2("info", "Getting stack info from app path", { appPath });
          const stackInfo = await getStackInfoFromApp(appPath, {
            region: process.env["AWS_REGION"],
            profile: process.env["AWS_PROFILE"]
          });
          resolvedHostedZoneId = stackInfo.hostedZoneId;
          resolvedDomain = stackInfo.domain;
          log2("info", "Retrieved stack info", {
            stackName: stackInfo.stackName,
            domain: resolvedDomain,
            hostedZoneId: resolvedHostedZoneId
          });
        } catch (err) {
          log2("warn", "Could not get stack info from app path", {
            error: String(err)
          });
        }
      } else if ((stackName || domain) && !resolvedHostedZoneId) {
        try {
          log2("info", "Getting stack info", { stackName, domain });
          const stackInfo = await getStackInfo({
            stackName,
            domain,
            region: process.env["AWS_REGION"],
            profile: process.env["AWS_PROFILE"]
          });
          resolvedHostedZoneId = stackInfo.hostedZoneId;
          resolvedDomain = stackInfo.domain;
          log2("info", "Retrieved stack info", {
            stackName: stackInfo.stackName,
            domain: resolvedDomain,
            hostedZoneId: resolvedHostedZoneId
          });
        } catch (err) {
          log2("warn", "Could not get stack info", { error: String(err) });
        }
      }
      if (dryRun) {
        console.log("\n\u26A0\uFE0F  DRY RUN MODE - No changes will be applied\n");
      }
      try {
        const result = await restoreDns({
          backupFile,
          hostedZoneId: resolvedHostedZoneId,
          domain: resolvedDomain,
          region: process.env["AWS_REGION"],
          profile: process.env["AWS_PROFILE"],
          dryRun
        });
        console.log("\n\u2713 DNS restore completed");
        console.log(`  Changes: ${result.changes}`);
        console.log(`  Created: ${result.created}`);
        console.log(`  Updated: ${result.updated}`);
        console.log(`  Skipped: ${result.skipped}`);
        if (dryRun) {
          console.log("\n\u26A0\uFE0F  This was a dry run. Set DRY_RUN=0 to apply changes.");
        }
      } catch (err) {
        log2("error", "DNS restore failed", { error: String(err) });
        console.error("\n\u2717 DNS restore failed:", err);
        process.exit(1);
      }
    }
    main();
  }
});
export default require_dns_restore();
