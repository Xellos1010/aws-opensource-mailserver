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

// libs/admin/admin-users-backup/src/lib/backup.ts
import * as fs from "node:fs";
import * as path from "node:path";
async function makeApiCall(method, path2, baseUrl, email, password) {
  const url = `${baseUrl}${path2}`;
  log2("info", "Making API call", { method, url });
  const headers = {};
  const auth = Buffer.from(`${email}:${password}`).toString("base64");
  headers["Authorization"] = `Basic ${auth}`;
  try {
    const response = await fetch(url, {
      method,
      headers
    });
    const responseBody = await response.text();
    const httpCode = response.status;
    log2("info", "API response", { method, path: path2, httpCode });
    return { httpCode, body: responseBody };
  } catch (err) {
    log2("error", "API call failed", { error: String(err), method, path: path2 });
    throw err;
  }
}
async function backupUsers(config) {
  log2("info", "Retrieving admin credentials");
  const credentials = await getAdminCredentials({
    appPath: config.appPath,
    stackName: config.stackName,
    domain: config.domain,
    region: config.region,
    profile: config.profile
  });
  const baseUrl = `https://box.${credentials.domain}`;
  const apiPath = "/admin/mail/users?format=json";
  log2("info", "Fetching users", { domain: credentials.domain });
  const result = await makeApiCall(
    "GET",
    apiPath,
    baseUrl,
    credentials.email,
    credentials.password
  );
  if (result.httpCode !== 200) {
    throw new Error(
      `Failed to fetch users: HTTP ${result.httpCode} - ${result.body}`
    );
  }
  let users;
  try {
    users = JSON.parse(result.body);
    if (!Array.isArray(users)) {
      throw new Error("API response is not an array");
    }
  } catch (err) {
    throw new Error(`Failed to parse users JSON: ${String(err)}`);
  }
  log2("info", "Retrieved users", { count: users.length });
  const timestamp = (/* @__PURE__ */ new Date()).toISOString().replace(/[:.]/g, "-");
  const domainName = credentials.domain.replace(/\./g, "-");
  const outputDir = config.outputDir || path.resolve("dist/backups", domainName, "users", timestamp);
  fs.mkdirSync(outputDir, { recursive: true });
  const backupFile = path.join(outputDir, `users-backup-${timestamp}.json`);
  const backupData = {
    domain: credentials.domain,
    timestamp: (/* @__PURE__ */ new Date()).toISOString(),
    userCount: users.length,
    users
  };
  fs.writeFileSync(backupFile, JSON.stringify(backupData, null, 2));
  log2("info", "Users backup complete", {
    outputDir,
    backupFile,
    userCount: users.length
  });
  return { outputDir, userCount: users.length };
}
var log2;
var init_backup = __esm({
  "libs/admin/admin-users-backup/src/lib/backup.ts"() {
    "use strict";
    init_src2();
    log2 = (level, msg, meta = {}) => console.log(
      JSON.stringify({ ts: (/* @__PURE__ */ new Date()).toISOString(), level, msg, ...meta })
    );
  }
});

// libs/admin/admin-users-backup/bin/users-backup.ts
var require_users_backup = __commonJS({
  "libs/admin/admin-users-backup/bin/users-backup.ts"() {
    init_backup();
    async function main() {
      const appPath = process.env["APP_PATH"];
      const stackName = process.env["STACK_NAME"];
      const domain = process.env["DOMAIN"];
      try {
        const result = await backupUsers({
          appPath,
          stackName,
          domain,
          region: process.env["AWS_REGION"],
          profile: process.env["AWS_PROFILE"],
          outputDir: process.env["OUTPUT_DIR"]
        });
        console.log(`
\u2713 Users backup complete`);
        console.log(`  Output directory: ${result.outputDir}`);
        console.log(`  Users backed up: ${result.userCount}`);
      } catch (err) {
        console.error(`
\u2717 Users backup failed: ${String(err)}`);
        process.exit(1);
      }
    }
    main();
  }
});
export default require_users_backup();
