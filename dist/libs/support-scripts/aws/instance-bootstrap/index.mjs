// libs/support-scripts/aws/instance-bootstrap/src/lib/bootstrap.ts
import {
  CloudFormationClient,
  DescribeStacksCommand,
  StackStatus
} from "@aws-sdk/client-cloudformation";
import {
  SSMClient,
  SendCommandCommand,
  GetCommandInvocationCommand,
  CommandStatus,
  GetParametersCommand
} from "@aws-sdk/client-ssm";
import { EC2Client, DescribeInstancesCommand } from "@aws-sdk/client-ec2";
import { fromIni } from "@aws-sdk/credential-providers";
import * as fs from "fs";
import * as path from "path";
var RETRY_CONFIG = {
  maxAttempts: 3,
  delay: 1e3
  // 1 second base delay
};
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
async function retryWithBackoff(fn, maxAttempts = RETRY_CONFIG.maxAttempts, baseDelay = RETRY_CONFIG.delay) {
  let lastError;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt < maxAttempts) {
        const delay = baseDelay * Math.pow(2, attempt - 1);
        console.warn(
          `Attempt ${attempt}/${maxAttempts} failed, retrying in ${delay}ms...`
        );
        await sleep(delay);
      }
    }
  }
  throw lastError || new Error("Retry failed");
}
function deriveStackName(domain) {
  return `${domain.replace(/\./g, "-")}-mailserver-instance`;
}
function createClients(region, profile) {
  const config = {
    region,
    ...profile && { credentials: fromIni({ profile }) }
  };
  return {
    cf: new CloudFormationClient(config),
    ssm: new SSMClient(config),
    ec2: new EC2Client(config)
  };
}
function resolveStackName(options) {
  if (options.stackName) {
    return options.stackName;
  }
  if (!options.domain) {
    throw new Error(
      "Either stackName or domain must be provided in BootstrapOptions"
    );
  }
  return deriveStackName(options.domain);
}
async function describeInstanceStack(cf, stackName) {
  const command = new DescribeStacksCommand({ StackName: stackName });
  const response = await retryWithBackoff(() => cf.send(command));
  const stack = response.Stacks?.[0];
  if (!stack) {
    throw new Error(`Stack ${stackName} not found`);
  }
  if (stack.StackStatus === StackStatus.DELETE_IN_PROGRESS || stack.StackStatus === StackStatus.DELETE_COMPLETE) {
    throw new Error(
      `Stack ${stackName} is in ${stack.StackStatus} state and cannot be bootstrapped`
    );
  }
  const outputs = Object.fromEntries(
    (stack.Outputs || []).map((o) => [o.OutputKey, o.OutputValue])
  );
  const instanceId = outputs["InstanceId"];
  const instanceDns = outputs["InstanceDnsName"] || outputs["InstanceDns"];
  const domainName = outputs["DomainName"];
  const keyPairId = outputs["KeyPairId"];
  const eipAllocationId = outputs["ElasticIPAllocationId"];
  if (!instanceId) {
    throw new Error(
      `InstanceId output not found on stack ${stackName}. Available outputs: ${Object.keys(outputs).join(", ")}`
    );
  }
  if (!instanceDns) {
    throw new Error(
      `InstanceDnsName or InstanceDns output not found on stack ${stackName}`
    );
  }
  if (!domainName) {
    throw new Error(
      `DomainName output not found on stack ${stackName}`
    );
  }
  return {
    instanceId,
    instanceDns,
    domainName,
    keyPairId: keyPairId || "",
    stackName,
    eipAllocationId
  };
}
async function readCoreParams(ssm, domain) {
  const corePrefix = `/emcnotary/core`;
  const paramNames = [
    `${corePrefix}/domainName`,
    `${corePrefix}/backupBucket`,
    `${corePrefix}/nextcloudBucket`,
    `${corePrefix}/alarmsTopicArn`,
    `${corePrefix}/sesIdentityArn`,
    `${corePrefix}/eipAllocationId`
  ];
  const command = new GetParametersCommand({
    Names: paramNames,
    WithDecryption: false
  });
  const response = await retryWithBackoff(() => ssm.send(command));
  const params = Object.fromEntries(
    (response.Parameters || []).map((p) => [p.Name, p.Value])
  );
  const domainName = params[`${corePrefix}/domainName`];
  const backupBucket = params[`${corePrefix}/backupBucket`];
  const nextcloudBucket = params[`${corePrefix}/nextcloudBucket`];
  const alarmsTopicArn = params[`${corePrefix}/alarmsTopicArn`];
  const sesIdentityArn = params[`${corePrefix}/sesIdentityArn`];
  const eipAllocationId = params[`${corePrefix}/eipAllocationId`];
  if (!domainName || !backupBucket || !nextcloudBucket || !alarmsTopicArn) {
    throw new Error(
      `Required core SSM parameters not found under ${corePrefix}. Found: ${Object.keys(params).join(", ")}`
    );
  }
  return {
    domainName,
    backupBucket,
    nextcloudBucket,
    alarmsTopicArn,
    sesIdentityArn,
    eipAllocationId
  };
}
async function verifyInstance(ec2, ssm, instanceId) {
  const describeCommand = new DescribeInstancesCommand({
    InstanceIds: [instanceId]
  });
  const response = await retryWithBackoff(() => ec2.send(describeCommand));
  const instance = response.Reservations?.[0]?.Instances?.[0];
  if (!instance) {
    throw new Error(`Instance ${instanceId} not found`);
  }
  const state = instance.State?.Name;
  if (state !== "running") {
    throw new Error(
      `Instance ${instanceId} is in ${state} state. Must be running for SSM commands.`
    );
  }
}
function loadMiabScript() {
  const scriptPath = path.join(
    __dirname,
    "../../../assets/miab-setup.sh"
  );
  if (!fs.existsSync(scriptPath)) {
    throw new Error(
      `MIAB setup script not found at ${scriptPath}. Ensure assets are included in build.`
    );
  }
  return fs.readFileSync(scriptPath, "utf8");
}
function buildEnvironmentMap(stackInfo, coreParams, options) {
  const env = {
    DOMAIN_NAME: stackInfo.domainName,
    INSTANCE_DNS: stackInfo.instanceDns,
    REGION: options.region || "us-east-1",
    STACK_NAME: stackInfo.stackName,
    BACKUP_BUCKET: coreParams.backupBucket,
    NEXTCLOUD_BUCKET: coreParams.nextcloudBucket,
    ALARMS_TOPIC_ARN: coreParams.alarmsTopicArn
  };
  if (stackInfo.eipAllocationId || coreParams.eipAllocationId) {
    env.EIP_ALLOCATION_ID = stackInfo.eipAllocationId || coreParams.eipAllocationId || "";
  }
  if (coreParams.sesIdentityArn) {
    env.SES_IDENTITY_ARN = coreParams.sesIdentityArn;
  }
  if (options.restorePrefix) {
    env.RESTORE_PREFIX = options.restorePrefix;
  }
  env.SES_RELAY = "true";
  env.SWAP_SIZE_GIB = "2";
  env.MAILINABOX_VERSION = "v64.0";
  env.MAILINABOX_CLONE_URL = "https://github.com/mail-in-a-box/mailinabox.git";
  env.REBOOT_AFTER_SETUP = options.rebootAfterSetup ? "true" : "false";
  env.ADMIN_PASSWORD_PARAM = `/MailInABoxAdminPassword-${stackInfo.stackName}`;
  return env;
}
async function pollCommandStatus(ssm, commandId, instanceId, maxWaitSeconds = 3600) {
  const startTime = Date.now();
  const maxWaitMs = maxWaitSeconds * 1e3;
  while (true) {
    const command = new GetCommandInvocationCommand({
      CommandId: commandId,
      InstanceId: instanceId
    });
    const response = await retryWithBackoff(() => ssm.send(command));
    const status = response.Status;
    if (status === CommandStatus.SUCCESS) {
      console.log("\u2705 Bootstrap command completed successfully");
      return;
    }
    if (status === CommandStatus.FAILED || status === CommandStatus.CANCELLED) {
      const error = response.StandardErrorContent || "Unknown error";
      throw new Error(
        `Bootstrap command failed with status ${status}: ${error}`
      );
    }
    if (status === CommandStatus.IN_PROGRESS || status === CommandStatus.PENDING) {
      const elapsed = Date.now() - startTime;
      if (elapsed > maxWaitMs) {
        throw new Error(
          `Bootstrap command timed out after ${maxWaitSeconds} seconds`
        );
      }
      await sleep(5e3);
      continue;
    }
    throw new Error(`Unexpected command status: ${status}`);
  }
}
async function bootstrapInstance(options) {
  const region = options.region || "us-east-1";
  const featureFlagEnv = options.featureFlagEnv || "FEATURE_INSTANCE_BOOTSTRAP_ENABLED";
  if (process.env[featureFlagEnv] === "0") {
    throw new Error(
      `${featureFlagEnv}=0 is set. Bootstrap is disabled. Set ${featureFlagEnv}=1 to enable.`
    );
  }
  const { cf, ssm, ec2 } = createClients(region, options.profile);
  const stackName = resolveStackName(options);
  console.log(`\u{1F4CB} Resolving stack: ${stackName}`);
  const stackInfo = await describeInstanceStack(cf, stackName);
  console.log(`\u2705 Found instance: ${stackInfo.instanceId}`);
  console.log(`   Domain: ${stackInfo.domainName}`);
  console.log(`   DNS: ${stackInfo.instanceDns}.${stackInfo.domainName}`);
  const coreParams = await readCoreParams(
    ssm,
    stackInfo.domainName
  );
  console.log(`\u2705 Loaded core parameters from SSM`);
  await verifyInstance(ec2, ssm, stackInfo.instanceId);
  console.log(`\u2705 Instance ${stackInfo.instanceId} is running and accessible`);
  const envMap = buildEnvironmentMap(stackInfo, coreParams, options);
  const miabScript = loadMiabScript();
  const commands = [
    "set -euxo pipefail",
    'cat > /root/miab-setup.sh << "EOF_MIAB"',
    miabScript,
    "EOF_MIAB",
    // Export environment variables
    ...Object.entries(envMap).map(
      ([key, value]) => `export ${key}='${value.replace(/'/g, "'\\''")}'`
    ),
    // Execute script
    "bash -xe /root/miab-setup.sh"
  ];
  if (options.dryRun) {
    console.log("\n\u{1F50D} DRY RUN MODE - Would execute:\n");
    console.log("Environment variables:");
    Object.entries(envMap).forEach(([key, value]) => {
      const displayValue = key.includes("PASSWORD") || key.includes("SECRET") ? "***REDACTED***" : value;
      console.log(`  ${key}=${displayValue}`);
    });
    console.log("\nSSM Command:");
    console.log(`  Document: AWS-RunShellScript`);
    console.log(`  Instance: ${stackInfo.instanceId}`);
    console.log(`  Commands: ${commands.length} lines`);
    console.log("\n\u2705 Dry run complete - no changes made");
    return;
  }
  console.log(`\u{1F680} Sending bootstrap command to instance ${stackInfo.instanceId}...`);
  const sendCommand = new SendCommandCommand({
    InstanceIds: [stackInfo.instanceId],
    DocumentName: "AWS-RunShellScript",
    Parameters: {
      commands
    },
    CloudWatchOutputConfig: {
      CloudWatchOutputEnabled: true,
      CloudWatchLogGroupName: `/aws/ssm/miab-bootstrap`
    },
    TimeoutSeconds: 3600
    // 1 hour
  });
  const commandResponse = await retryWithBackoff(() => ssm.send(sendCommand));
  const commandId = commandResponse.Command?.CommandId;
  if (!commandId) {
    throw new Error("Failed to get command ID from SSM response");
  }
  console.log(`\u{1F4DD} Command ID: ${commandId}`);
  console.log(`\u{1F4CA} CloudWatch Logs: /aws/ssm/miab-bootstrap`);
  console.log(`\u23F3 Waiting for command to complete...`);
  await pollCommandStatus(ssm, commandId, stackInfo.instanceId);
  console.log(`
\u2705 Bootstrap completed successfully for ${stackInfo.instanceDns}.${stackInfo.domainName}`);
  console.log(`   Instance: ${stackInfo.instanceId}`);
  console.log(`   View logs: aws logs tail /aws/ssm/miab-bootstrap --follow`);
}
export {
  bootstrapInstance
};
