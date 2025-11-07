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
    let appName = parts[parts.length - 1];
    if (appName === "core" || appName === "instance") {
      appName = parts[parts.length - 2] || appName;
    }
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
    const pathParts = appPath?.split("/") || [];
    const lastPart = pathParts[pathParts.length - 1] || "";
    let suffix = "-mailserver";
    if (lastPart === "core" || lastPart.includes("-core")) {
      suffix = "-mailserver-core";
    } else if (lastPart === "instance" || lastPart.includes("-instance")) {
      suffix = "-mailserver-instance";
    }
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
  let stackName = resolveStackName(
    config.domain,
    config.appPath,
    config.stackName
  );
  const credentials = fromIni({ profile });
  const cfClient = new CloudFormationClient({ region, credentials });
  const ssmClient = new SSMClient({ region, credentials });
  const ec2Client = new EC2Client({ region, credentials });
  let stackResp;
  try {
    stackResp = await cfClient.send(
      new DescribeStacksCommand({ StackName: stackName })
    );
  } catch (err) {
    const error = err;
    if (error?.name === "ValidationError" && stackName.includes("-com-mailserver-instance")) {
      const fallbackStackName = stackName.replace("-com-mailserver-instance", "-mailserver-instance");
      try {
        stackResp = await cfClient.send(
          new DescribeStacksCommand({ StackName: fallbackStackName })
        );
        stackName = fallbackStackName;
      } catch (fallbackErr) {
        throw new Error(`Stack ${stackName} or ${fallbackStackName} not found`);
      }
    } else {
      throw err;
    }
  }
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

// libs/admin/admin-stack-info/bin/get-stack-info.ts
var require_get_stack_info = __commonJS({
  "libs/admin/admin-stack-info/bin/get-stack-info.ts"() {
    init_stack_info();
    var log = (level, msg, meta = {}) => console.log(
      JSON.stringify({ ts: (/* @__PURE__ */ new Date()).toISOString(), level, msg, ...meta })
    );
    async function main() {
      const appPath = process.env["APP_PATH"];
      const stackName = process.env["STACK_NAME"];
      const domain = process.env["DOMAIN"];
      const outputFormat = process.env["OUTPUT_FORMAT"] || "json";
      log("info", "Retrieving stack information", {
        appPath,
        stackName,
        domain,
        outputFormat
      });
      try {
        let stackInfo;
        if (appPath) {
          stackInfo = await getStackInfoFromApp(appPath, {
            region: process.env["AWS_REGION"],
            profile: process.env["AWS_PROFILE"]
          });
        } else {
          stackInfo = await getStackInfo({
            stackName,
            domain,
            region: process.env["AWS_REGION"],
            profile: process.env["AWS_PROFILE"]
          });
        }
        if (outputFormat === "json") {
          console.log(JSON.stringify(stackInfo, null, 2));
        } else {
          console.log("\n=== Stack Information ===");
          console.log(`Stack Name: ${stackInfo.stackName}`);
          console.log(`Domain: ${stackInfo.domain}`);
          console.log(`Region: ${stackInfo.region}`);
          if (stackInfo.instanceId) {
            console.log(`Instance ID: ${stackInfo.instanceId}`);
          }
          if (stackInfo.instancePublicIp) {
            console.log(`Instance IP: ${stackInfo.instancePublicIp}`);
          }
          if (stackInfo.instanceKeyName) {
            console.log(`Instance Key Name: ${stackInfo.instanceKeyName}`);
          }
          if (stackInfo.keyPairId) {
            console.log(`Key Pair ID: ${stackInfo.keyPairId}`);
          }
          if (stackInfo.hostedZoneId) {
            console.log(`Hosted Zone ID: ${stackInfo.hostedZoneId}`);
          }
          if (stackInfo.adminPassword) {
            console.log(`Admin Password: ${stackInfo.adminPassword.substring(0, 8)}...`);
          }
          console.log("\n=== Stack Outputs ===");
          Object.entries(stackInfo.outputs).forEach(([key, value]) => {
            console.log(`${key}: ${value}`);
          });
        }
      } catch (err) {
        log("error", "Failed to get stack info", { error: String(err) });
        console.error("\nError:", err);
        process.exit(1);
      }
    }
    main();
  }
});
export default require_get_stack_info();
