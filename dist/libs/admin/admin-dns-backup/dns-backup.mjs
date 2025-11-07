#!/usr/bin/env node
var __getOwnPropNames = Object.getOwnPropertyNames;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __commonJS = (cb, mod) => function __require() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};

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

// libs/admin/admin-dns-backup/bin/dns-backup.ts
var require_dns_backup = __commonJS({
  "libs/admin/admin-dns-backup/bin/dns-backup.ts"() {
    init_backup();
    init_src();
    async function main() {
      const appPath = process.env.APP_PATH;
      const stackName = process.env.STACK_NAME;
      const domain = process.env.DOMAIN;
      let hostedZoneId;
      if (appPath) {
        try {
          const stackInfo = await getStackInfoFromApp(appPath, {
            region: process.env.AWS_REGION,
            profile: process.env.AWS_PROFILE
          });
          hostedZoneId = stackInfo.hostedZoneId;
          console.log(`Using stack: ${stackInfo.stackName} (${stackInfo.domain})`);
          if (hostedZoneId) {
            console.log(`Found hosted zone: ${hostedZoneId}`);
          }
        } catch (err) {
          console.warn(`Could not get stack info from app path: ${err}`);
        }
      } else if (stackName || domain) {
        try {
          const stackInfo = await getStackInfo({
            stackName,
            domain,
            region: process.env.AWS_REGION,
            profile: process.env.AWS_PROFILE
          });
          hostedZoneId = stackInfo.hostedZoneId;
          console.log(`Using stack: ${stackInfo.stackName} (${stackInfo.domain})`);
          if (hostedZoneId) {
            console.log(`Found hosted zone: ${hostedZoneId}`);
          }
        } catch (err) {
          console.warn(`Could not get stack info: ${err}`);
        }
      }
      const zoneIds = process.env.DNS_ZONE_IDS?.split(",").filter(Boolean) || (hostedZoneId ? [hostedZoneId] : void 0);
      await backupDns({
        bucket: process.env.DNS_BACKUP_BUCKET,
        prefix: process.env.DNS_BACKUP_PREFIX,
        zones: zoneIds
      }).then((dir) => console.log(`DNS backup written to ${dir}`)).catch((e) => {
        console.error(e);
        process.exit(1);
      });
    }
    main();
  }
});
export default require_dns_backup();
