#!/usr/bin/env node
var __getOwnPropNames = Object.getOwnPropertyNames;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __commonJS = (cb, mod) => function __require() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};

// libs/admin/admin-ssh/src/lib/ssh-test.ts
import { spawn } from "node:child_process";
import * as path from "node:path";
import * as os from "node:os";
import * as fs from "node:fs";
async function testSshConnection(config) {
  const startTime = Date.now();
  const user = config.user || "ubuntu";
  const timeout = config.timeout || 10;
  const port = config.port || 22;
  const keyFilePath = path.resolve(config.keyFilePath);
  if (!fs.existsSync(keyFilePath)) {
    return {
      success: false,
      error: `SSH key file not found: ${keyFilePath}`,
      duration: 0
    };
  }
  log("info", "Testing SSH connection", {
    instanceIp: config.instanceIp,
    user,
    timeout,
    keyFilePath
  });
  let lastRemaining = timeout;
  const countdownInterval = setInterval(() => {
    const elapsed = Math.floor((Date.now() - startTime) / 1e3);
    const remaining = Math.max(0, timeout - elapsed);
    if (remaining !== lastRemaining) {
      lastRemaining = remaining;
      if (remaining > 0) {
        process.stdout.write(`\rConnecting... ${remaining}s remaining`);
      } else {
        process.stdout.write(`\rConnecting... timeout`);
      }
    }
  }, 100);
  try {
    const sshCommand = [
      "ssh",
      "-i",
      keyFilePath,
      `-o`,
      `ConnectTimeout=${timeout}`,
      "-o",
      "BatchMode=yes",
      "-o",
      "StrictHostKeyChecking=no",
      "-o",
      "UserKnownHostsFile=/dev/null",
      "-o",
      "LogLevel=ERROR",
      "-p",
      String(port),
      `${user}@${config.instanceIp}`,
      "exit"
    ];
    const result = spawn("ssh", sshCommand.slice(1), {
      stdio: ["ignore", "pipe", "pipe"]
    });
    const connectionPromise = new Promise(
      (resolve2) => {
        let resolved = false;
        const timeoutId = setTimeout(() => {
          if (!resolved) {
            resolved = true;
            result.kill("SIGTERM");
            resolve2({
              success: false,
              error: `Connection timeout after ${timeout} seconds`
            });
          }
        }, timeout * 1e3);
        result.on("close", (code) => {
          if (!resolved) {
            resolved = true;
            clearTimeout(timeoutId);
            if (code === 0) {
              resolve2({ success: true });
            } else {
              resolve2({
                success: false,
                error: `SSH connection failed with exit code ${code}`
              });
            }
          }
        });
        result.on("error", (err) => {
          if (!resolved) {
            resolved = true;
            clearTimeout(timeoutId);
            resolve2({
              success: false,
              error: `SSH command error: ${err.message}`
            });
          }
        });
      }
    );
    const result_data = await connectionPromise;
    clearInterval(countdownInterval);
    const duration = (Date.now() - startTime) / 1e3;
    process.stdout.write("\r" + " ".repeat(50) + "\r");
    if (result_data.success) {
      console.log(`\u2713 SSH connection successful (${duration.toFixed(1)}s)`);
      log("info", "SSH connection test passed", { duration });
      return {
        success: true,
        duration
      };
    } else {
      console.log(`\u2717 SSH connection failed: ${result_data.error || "Unknown error"}`);
      log("error", "SSH connection test failed", {
        error: result_data.error,
        duration
      });
      return {
        success: false,
        error: result_data.error,
        duration
      };
    }
  } catch (err) {
    clearInterval(countdownInterval);
    process.stdout.write("\r" + " ".repeat(50) + "\r");
    const duration = (Date.now() - startTime) / 1e3;
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.log(`\u2717 SSH connection test error: ${errorMsg}`);
    log("error", "SSH connection test error", { error: errorMsg, duration });
    return {
      success: false,
      error: errorMsg,
      duration
    };
  }
}
async function testSshForStack(stackInfo) {
  if (!stackInfo.instancePublicIp) {
    throw new Error("Instance public IP not found in stack info");
  }
  const sshDir = path.join(os.homedir(), ".ssh");
  const instanceKeyName = stackInfo.instanceKeyName || `${stackInfo.domain.replace(/\./g, "-")}-keypair`;
  const keyFilePath = path.join(sshDir, `${instanceKeyName}.pem`);
  return testSshConnection({
    keyFilePath,
    instanceIp: stackInfo.instancePublicIp,
    user: "ubuntu",
    timeout: 10
  });
}
var log;
var init_ssh_test = __esm({
  "libs/admin/admin-ssh/src/lib/ssh-test.ts"() {
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

// libs/admin/admin-ssh/bin/test-ssh.ts
var require_test_ssh = __commonJS({
  "libs/admin/admin-ssh/bin/test-ssh.ts"() {
    init_ssh_test();
    init_src();
    var log2 = (level, msg, meta = {}) => console.log(
      JSON.stringify({ ts: (/* @__PURE__ */ new Date()).toISOString(), level, msg, ...meta })
    );
    async function main() {
      const appPath = process.env["APP_PATH"];
      const stackName = process.env["STACK_NAME"];
      const domain = process.env["DOMAIN"];
      const timeout = process.env["SSH_TEST_TIMEOUT"] ? Number(process.env["SSH_TEST_TIMEOUT"]) : void 0;
      log2("info", "Testing SSH connection", {
        appPath,
        stackName,
        domain,
        timeout
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
          instanceIp: stackInfo.instancePublicIp,
          instanceKeyName: stackInfo.instanceKeyName
        });
        if (!stackInfo.instancePublicIp) {
          throw new Error("Could not get instance IP address");
        }
        console.log(`
Testing SSH connection to ${stackInfo.domain} (${stackInfo.instancePublicIp})...`);
        const result = await testSshForStack({
          instancePublicIp: stackInfo.instancePublicIp,
          domain: stackInfo.domain,
          instanceKeyName: stackInfo.instanceKeyName,
          region: stackInfo.region,
          profile: process.env["AWS_PROFILE"]
        });
        console.log("");
        if (result.success) {
          console.log("\u2713 SSH connection test passed");
          process.exit(0);
        } else {
          console.log(`\u2717 SSH connection test failed: ${result.error}`);
          process.exit(1);
        }
      } catch (err) {
        log2("error", "SSH test failed", { error: String(err) });
        console.error("\nFatal error:", err);
        process.exit(1);
      }
    }
    main();
  }
});
export default require_test_ssh();
