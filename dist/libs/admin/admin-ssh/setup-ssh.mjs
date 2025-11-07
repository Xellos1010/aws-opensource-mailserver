#!/usr/bin/env node
var __getOwnPropNames = Object.getOwnPropertyNames;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __commonJS = (cb, mod) => function __require() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};

// libs/admin/admin-ssh/src/lib/ssh-setup.ts
import { SSMClient, GetParameterCommand } from "@aws-sdk/client-ssm";
import { fromIni } from "@aws-sdk/credential-providers";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { execSync } from "node:child_process";
async function setupSshKey(config) {
  const errors = [];
  const region = config.region || process.env["AWS_REGION"] || "us-east-1";
  const profile = config.profile || process.env["AWS_PROFILE"] || "hepe-admin-mfa";
  const sshDir = config.sshDir || path.join(os.homedir(), ".ssh");
  fs.mkdirSync(sshDir, { recursive: true, mode: 448 });
  const keyFilePath = path.join(sshDir, `${config.instanceKeyName}.pem`);
  if (fs.existsSync(keyFilePath)) {
    log("info", "SSH key file already exists", { keyFilePath });
    try {
      execSync(`ssh-keygen -l -f "${keyFilePath}"`, { stdio: "ignore" });
      log("info", "Existing key file is valid", { keyFilePath });
      fs.chmodSync(keyFilePath, 256);
      return {
        keyFilePath,
        success: true,
        errors: []
      };
    } catch (err) {
      log("warn", "Existing key file is invalid, will re-download", {
        keyFilePath,
        error: String(err)
      });
    }
  }
  log("info", "Retrieving SSH key from SSM", {
    keyPairId: config.keyPairId,
    ssmPath: `/ec2/keypair/${config.keyPairId}`
  });
  try {
    const credentials = fromIni({ profile });
    const ssmClient = new SSMClient({ region, credentials });
    const ssmResp = await ssmClient.send(
      new GetParameterCommand({
        Name: `/ec2/keypair/${config.keyPairId}`,
        WithDecryption: true
      })
    );
    if (!ssmResp.Parameter?.Value) {
      throw new Error("SSM parameter value is empty");
    }
    fs.writeFileSync(keyFilePath, ssmResp.Parameter.Value, { mode: 256 });
    log("info", "SSH key retrieved and saved", { keyFilePath });
    try {
      execSync(`ssh-keygen -l -f "${keyFilePath}"`, { stdio: "ignore" });
      log("info", "SSH key format verified", { keyFilePath });
    } catch (err) {
      const errorMsg = `SSH key format verification failed: ${err}`;
      log("error", errorMsg);
      errors.push(errorMsg);
    }
  } catch (err) {
    const errorMsg = `Failed to retrieve SSH key from SSM: ${err}`;
    log("error", errorMsg);
    errors.push(errorMsg);
    return {
      keyFilePath,
      success: false,
      errors
    };
  }
  try {
    const knownHostsFile = path.join(sshDir, "known_hosts");
    const knownHostsContent = fs.existsSync(knownHostsFile) ? fs.readFileSync(knownHostsFile, "utf-8") : "";
    if (!knownHostsContent.includes(config.instanceIp)) {
      log("info", "Adding host to known_hosts", { instanceIp: config.instanceIp });
      try {
        const keyscanOutput = execSync(
          `ssh-keyscan -H ${config.instanceIp}`,
          { encoding: "utf-8", timeout: 5e3 }
        );
        fs.appendFileSync(knownHostsFile, keyscanOutput);
        log("info", "Host added to known_hosts");
      } catch (err) {
        log("warn", "Could not add host to known_hosts (may be unreachable)", {
          error: String(err)
        });
      }
    }
  } catch (err) {
    log("warn", "Could not update known_hosts", { error: String(err) });
  }
  let sshConfigEntry;
  if (config.domain) {
    sshConfigEntry = `Host ${config.domain}
    HostName ${config.instanceIp}
    User ubuntu
    IdentityFile ${keyFilePath}
    StrictHostKeyChecking no`;
  }
  return {
    keyFilePath,
    sshConfigEntry,
    success: errors.length === 0,
    errors
  };
}
async function setupSshForStack(stackInfo) {
  if (!stackInfo.keyPairId) {
    throw new Error("KeyPairId not found in stack info");
  }
  if (!stackInfo.instancePublicIp) {
    throw new Error("Instance public IP not found in stack info");
  }
  let instanceKeyName = stackInfo.instanceKeyName;
  if (!instanceKeyName) {
    if (stackInfo.stackName) {
      instanceKeyName = `${stackInfo.stackName.replace(/-mailserver$/, "")}-keypair`;
    } else {
      instanceKeyName = `${stackInfo.domain.replace(/\./g, "-")}-keypair`;
    }
    log("warn", "Instance key name not found, using derived name", {
      derivedKeyName: instanceKeyName
    });
  }
  return setupSshKey({
    keyPairId: stackInfo.keyPairId,
    instanceKeyName,
    instanceIp: stackInfo.instancePublicIp,
    domain: stackInfo.domain,
    region: stackInfo.region,
    profile: stackInfo.profile
  });
}
var log;
var init_ssh_setup = __esm({
  "libs/admin/admin-ssh/src/lib/ssh-setup.ts"() {
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
import { SSMClient as SSMClient2, GetParameterCommand as GetParameterCommand2 } from "@aws-sdk/client-ssm";
import { EC2Client, DescribeInstancesCommand } from "@aws-sdk/client-ec2";
import { fromIni as fromIni2 } from "@aws-sdk/credential-providers";
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
  const credentials = fromIni2({ profile });
  const cfClient = new CloudFormationClient({ region, credentials });
  const ssmClient = new SSMClient2({ region, credentials });
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
        new GetParameterCommand2({
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

// libs/admin/admin-ssh/bin/setup-ssh.ts
var require_setup_ssh = __commonJS({
  "libs/admin/admin-ssh/bin/setup-ssh.ts"() {
    init_ssh_setup();
    init_src();
    var log2 = (level, msg, meta = {}) => console.log(
      JSON.stringify({ ts: (/* @__PURE__ */ new Date()).toISOString(), level, msg, ...meta })
    );
    async function main() {
      const appPath = process.env["APP_PATH"];
      const stackName = process.env["STACK_NAME"];
      const domain = process.env["DOMAIN"];
      log2("info", "Setting up SSH access", {
        appPath,
        stackName,
        domain
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
        log2("info", "Stack information retrieved", {
          stackName: stackInfo.stackName,
          domain: stackInfo.domain,
          hasKeyPairId: !!stackInfo.keyPairId,
          hasInstanceKeyName: !!stackInfo.instanceKeyName,
          hasInstanceIp: !!stackInfo.instancePublicIp
        });
        const result = await setupSshForStack({
          keyPairId: stackInfo.keyPairId,
          instanceKeyName: stackInfo.instanceKeyName,
          instancePublicIp: stackInfo.instancePublicIp,
          domain: stackInfo.domain,
          stackName: stackInfo.stackName,
          region: stackInfo.region,
          profile: process.env["AWS_PROFILE"]
        });
        console.log("\n=== SSH Setup Summary ===");
        console.log(`Stack: ${stackInfo.stackName} (${stackInfo.domain})`);
        console.log(`Instance IP: ${stackInfo.instancePublicIp}`);
        console.log(`Key File: ${result.keyFilePath}`);
        console.log(`Status: ${result.success ? "\u2713 Success" : "\u2717 Failed"}`);
        if (result.sshConfigEntry) {
          console.log("\nSSH Config Entry (add to ~/.ssh/config):");
          console.log(result.sshConfigEntry);
          console.log("\nThen connect using:");
          console.log(`ssh ${stackInfo.domain}`);
        } else {
          console.log("\nConnect using:");
          console.log(`ssh -i ${result.keyFilePath} ubuntu@${stackInfo.instancePublicIp}`);
        }
        if (result.errors.length > 0) {
          console.log("\nWarnings/Errors:");
          result.errors.forEach((err) => console.log(`  - ${err}`));
        }
        if (!result.success) {
          process.exit(1);
        }
      } catch (err) {
        log2("error", "SSH setup failed", { error: String(err) });
        console.error("\nFatal error:", err);
        process.exit(1);
      }
    }
    main();
  }
});
export default require_setup_ssh();
