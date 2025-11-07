#!/usr/bin/env node

// libs/admin/admin-stack-events/src/lib/stack-events.ts
import {
  CloudFormationClient as CloudFormationClient2,
  DescribeStackEventsCommand,
  DescribeStacksCommand as DescribeStacksCommand2
} from "@aws-sdk/client-cloudformation";
import { fromIni as fromIni2 } from "@aws-sdk/credential-providers";

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

// libs/admin/admin-stack-events/src/lib/stack-events.ts
async function getStackEvents(config) {
  const region = config.region || process.env["AWS_REGION"] || "us-east-1";
  const profile = config.profile || process.env["AWS_PROFILE"] || "hepe-admin-mfa";
  const maxResults = config.maxResults || 100;
  const stackInfo = await getStackInfo(config);
  const stackName = stackInfo.stackName;
  const credentials = fromIni2({ profile });
  const cfClient = new CloudFormationClient2({ region, credentials });
  let stackStatus;
  try {
    const stackResp = await cfClient.send(
      new DescribeStacksCommand2({ StackName: stackName })
    );
    stackStatus = stackResp.Stacks?.[0]?.StackStatus;
  } catch (error) {
    throw new Error(`Stack ${stackName} not found or inaccessible: ${error}`);
  }
  const events = [];
  let nextToken;
  do {
    const command = nextToken ? new DescribeStackEventsCommand({
      StackName: stackName,
      NextToken: nextToken
    }) : new DescribeStackEventsCommand({ StackName: stackName });
    const response = await cfClient.send(command);
    if (response.StackEvents) {
      for (const event of response.StackEvents) {
        const stackEvent = {
          timestamp: event.Timestamp || /* @__PURE__ */ new Date(),
          resourceStatus: event.ResourceStatus,
          resourceType: event.ResourceType,
          logicalResourceId: event.LogicalResourceId,
          physicalResourceId: event.PhysicalResourceId,
          resourceStatusReason: event.ResourceStatusReason,
          stackName: event.StackName || stackName,
          eventId: event.EventId || ""
        };
        if (!config.filterByResourceStatus || config.filterByResourceStatus.length === 0 || stackEvent.resourceStatus && config.filterByResourceStatus.includes(stackEvent.resourceStatus)) {
          events.push(stackEvent);
        }
      }
    }
    nextToken = response.NextToken;
  } while (nextToken && events.length < maxResults);
  events.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  return events.slice(0, maxResults);
}
async function getFailedStackEvents(config) {
  return getStackEvents({
    ...config,
    filterByResourceStatus: [
      "CREATE_FAILED",
      "UPDATE_FAILED",
      "DELETE_FAILED",
      "ROLLBACK_IN_PROGRESS",
      "ROLLBACK_COMPLETE",
      "ROLLBACK_FAILED"
    ]
  });
}
function formatStackEvents(events) {
  if (events.length === 0) {
    return "No events found.";
  }
  const lines = [];
  lines.push("=".repeat(100));
  lines.push(`Stack Events (${events.length} total)`);
  lines.push("=".repeat(100));
  lines.push("");
  for (const event of events) {
    const timestamp = event.timestamp.toISOString();
    const status = event.resourceStatus || "N/A";
    const resourceType = event.resourceType || "N/A";
    const logicalId = event.logicalResourceId || "N/A";
    const reason = event.resourceStatusReason || "";
    lines.push(`[${timestamp}] ${status}`);
    lines.push(`  Resource: ${resourceType} (${logicalId})`);
    if (event.physicalResourceId) {
      lines.push(`  Physical ID: ${event.physicalResourceId}`);
    }
    if (reason) {
      lines.push(`  Reason: ${reason}`);
    }
    lines.push("");
  }
  return lines.join("\n");
}

// libs/admin/admin-stack-events/bin/get-stack-events.ts
async function main() {
  const appPath = process.env["APP_PATH"];
  const stackName = process.env["STACK_NAME"];
  const domain = process.env["DOMAIN"];
  const region = process.env["AWS_REGION"];
  const profile = process.env["AWS_PROFILE"];
  const maxResults = process.env["MAX_RESULTS"] ? parseInt(process.env["MAX_RESULTS"], 10) : void 0;
  const failedOnly = process.env["FAILED_ONLY"] === "1" || process.env["FAILED_ONLY"] === "true";
  try {
    const events = failedOnly ? await getFailedStackEvents({
      appPath,
      stackName,
      domain,
      region,
      profile,
      maxResults
    }) : await getStackEvents({
      appPath,
      stackName,
      domain,
      region,
      profile,
      maxResults
    });
    console.log(formatStackEvents(events));
    if (failedOnly && events.length > 0) {
      console.log("\n\u26A0\uFE0F  Failed events detected. Review the reasons above.");
      process.exit(1);
    }
    process.exit(0);
  } catch (error) {
    console.error("Error getting stack events:", error);
    process.exit(1);
  }
}
main();
