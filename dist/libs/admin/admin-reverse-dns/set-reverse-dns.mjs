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
    let domainPart = appName.replace(/^cdk-/, "");
    domainPart = domainPart.replace(/-core$/, "");
    const domainMap = {
      "emc-notary": "emcnotary.com",
      "emcnotary": "emcnotary.com",
      "askdaokapra": "askdaokapra.com"
    };
    return domainMap[domainPart] || `${domainPart.replace(/-/g, "")}.com`;
  }
  if (stackName) {
    const withoutSuffix = stackName.replace(/-mailserver(-core)?$/, "");
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
    const appName = appPath?.split("/").pop() || "";
    const isCoreStack = appName.includes("-core");
    const suffix = isCoreStack ? "-mailserver-core" : "-mailserver";
    return `${resolvedDomain.replace(/\./g, "-")}${suffix}`;
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

// libs/admin/admin-reverse-dns/src/lib/reverse-dns.ts
import { EC2Client as EC2Client2, DescribeAddressesCommand, ModifyAddressAttributeCommand } from "@aws-sdk/client-ec2";
import { fromIni as fromIni2 } from "@aws-sdk/credential-providers";
async function setReverseDns(config) {
  const region = config.region || process.env["AWS_REGION"] || "us-east-1";
  const profile = config.profile || process.env["AWS_PROFILE"] || "hepe-admin-mfa";
  const credentials = fromIni2({ profile });
  const ec2Client = new EC2Client2({ region, credentials });
  let stackInfo;
  if (config.appPath) {
    stackInfo = await getStackInfoFromApp(config.appPath, {
      region,
      profile
    });
  } else {
    stackInfo = await getStackInfo({
      stackName: config.stackName,
      domain: config.domain,
      region,
      profile
    });
  }
  const domain = stackInfo.domain;
  const ptrRecord = config.ptrRecord || `box.${domain}`;
  log("info", "Setting reverse DNS", {
    domain,
    ptrRecord,
    stackName: stackInfo.stackName
  });
  try {
    const addressesResp = await ec2Client.send(
      new DescribeAddressesCommand({
        Filters: [
          {
            Name: "tag:MAILSERVER",
            Values: [domain]
          }
        ]
      })
    );
    const addresses = addressesResp.Addresses || [];
    if (addresses.length === 0) {
      const error = `Could not find Elastic IP address for domain ${domain}`;
      log("error", error);
      return { success: false, error };
    }
    const address = addresses[0];
    const elasticIp = address.PublicIp;
    const allocationId = address.AllocationId;
    if (!elasticIp || !allocationId) {
      const error = "Elastic IP found but missing PublicIp or AllocationId";
      log("error", error);
      return { success: false, error };
    }
    log("info", "Found Elastic IP", {
      elasticIp,
      allocationId
    });
    try {
      await ec2Client.send(
        new ModifyAddressAttributeCommand({
          AllocationId: allocationId,
          DomainName: ptrRecord
        })
      );
      log("info", "Reverse DNS set successfully", {
        elasticIp,
        ptrRecord
      });
      return {
        success: true,
        elasticIp,
        allocationId,
        ptrRecord
      };
    } catch (err) {
      const error = `Failed to set reverse DNS: ${String(err)}`;
      log("error", error, { error: err });
      return { success: false, error, elasticIp, allocationId, ptrRecord };
    }
  } catch (err) {
    const error = `Failed to find Elastic IP: ${String(err)}`;
    log("error", error, { error: err });
    return { success: false, error };
  }
}
var log;
var init_reverse_dns = __esm({
  "libs/admin/admin-reverse-dns/src/lib/reverse-dns.ts"() {
    "use strict";
    init_src();
    log = (level, msg, meta = {}) => console.log(
      JSON.stringify({ ts: (/* @__PURE__ */ new Date()).toISOString(), level, msg, ...meta })
    );
  }
});

// libs/admin/admin-reverse-dns/bin/set-reverse-dns.ts
var require_set_reverse_dns = __commonJS({
  "libs/admin/admin-reverse-dns/bin/set-reverse-dns.ts"() {
    init_reverse_dns();
    async function main() {
      const appPath = process.env["APP_PATH"];
      const stackName = process.env["STACK_NAME"];
      const domain = process.env["DOMAIN"];
      const ptrRecord = process.env["PTR_RECORD"];
      try {
        const result = await setReverseDns({
          appPath,
          stackName,
          domain,
          ptrRecord,
          region: process.env["AWS_REGION"],
          profile: process.env["AWS_PROFILE"]
        });
        if (result.success) {
          console.log("\n\u2713 Reverse DNS set successfully");
          console.log(`  Elastic IP: ${result.elasticIp}`);
          console.log(`  PTR Record: ${result.ptrRecord}`);
          console.log(`  Allocation ID: ${result.allocationId}`);
        } else {
          console.error(`
\u2717 Failed to set reverse DNS: ${result.error}`);
          process.exit(1);
        }
      } catch (err) {
        console.error("\n\u2717 Error:", err instanceof Error ? err.message : String(err));
        process.exit(1);
      }
    }
    main();
  }
});
export default require_set_reverse_dns();
