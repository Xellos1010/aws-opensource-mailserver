#!/usr/bin/env node

// libs/admin/admin-s3-empty/src/lib/empty-buckets.ts
import {
  CloudFormationClient as CloudFormationClient2,
  ListStackResourcesCommand,
  DescribeStackResourcesCommand
} from "@aws-sdk/client-cloudformation";
import {
  S3Client,
  ListObjectVersionsCommand,
  DeleteObjectsCommand
} from "@aws-sdk/client-s3";
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

// libs/admin/admin-s3-empty/src/lib/empty-buckets.ts
async function listStackBuckets(stackName, region, profile) {
  const credentials = fromIni2({ profile });
  const cfClient = new CloudFormationClient2({ region, credentials });
  const buckets = [];
  let nextToken;
  do {
    const command = nextToken ? new ListStackResourcesCommand({
      StackName: stackName,
      NextToken: nextToken
    }) : new ListStackResourcesCommand({ StackName: stackName });
    const response = await cfClient.send(command);
    if (response.StackResourceSummaries) {
      for (const resource of response.StackResourceSummaries) {
        if (resource.ResourceType === "AWS::S3::Bucket") {
          const describeCommand = new DescribeStackResourcesCommand({
            StackName: stackName,
            LogicalResourceId: resource.LogicalResourceId
          });
          const describeResponse = await cfClient.send(describeCommand);
          const physicalId = describeResponse.StackResources?.[0]?.PhysicalResourceId;
          if (physicalId) {
            buckets.push({
              bucketName: physicalId,
              logicalId: resource.LogicalResourceId || "Unknown"
            });
          }
        }
      }
    }
    nextToken = response.NextToken;
  } while (nextToken);
  return buckets;
}
async function emptyBucket(bucketName, region, profile, dryRun = false) {
  const credentials = fromIni2({ profile });
  const s3Client = new S3Client({ region, credentials });
  let versionsDeleted = 0;
  let markersDeleted = 0;
  let nextKeyMarker;
  let nextVersionIdMarker;
  console.log(`  ${dryRun ? "[DRY RUN] " : ""}Emptying bucket: ${bucketName}`);
  do {
    const command = new ListObjectVersionsCommand({
      Bucket: bucketName,
      KeyMarker: nextKeyMarker,
      VersionIdMarker: nextVersionIdMarker
    });
    const response = await s3Client.send(command);
    if (response.Versions && response.Versions.length > 0) {
      const objectsToDelete = response.Versions.map((version) => ({
        Key: version.Key,
        VersionId: version.VersionId
      }));
      if (!dryRun) {
        const deleteCommand = new DeleteObjectsCommand({
          Bucket: bucketName,
          Delete: {
            Objects: objectsToDelete,
            Quiet: true
          }
        });
        await s3Client.send(deleteCommand);
      }
      versionsDeleted += objectsToDelete.length;
      console.log(
        `    ${dryRun ? "[DRY RUN] " : ""}Deleted ${objectsToDelete.length} object version(s)`
      );
    }
    if (response.DeleteMarkers && response.DeleteMarkers.length > 0) {
      const markersToDelete = response.DeleteMarkers.map((marker) => ({
        Key: marker.Key,
        VersionId: marker.VersionId
      }));
      if (!dryRun) {
        const deleteCommand = new DeleteObjectsCommand({
          Bucket: bucketName,
          Delete: {
            Objects: markersToDelete,
            Quiet: true
          }
        });
        await s3Client.send(deleteCommand);
      }
      markersDeleted += markersToDelete.length;
      console.log(
        `    ${dryRun ? "[DRY RUN] " : ""}Deleted ${markersToDelete.length} delete marker(s)`
      );
    }
    nextKeyMarker = response.NextKeyMarker;
    nextVersionIdMarker = response.NextVersionIdMarker;
  } while (nextKeyMarker || nextVersionIdMarker);
  return { versionsDeleted, markersDeleted };
}
async function emptyStackBuckets(config) {
  const region = config.region || process.env["AWS_REGION"] || "us-east-1";
  const profile = config.profile || process.env["AWS_PROFILE"] || "hepe-admin-mfa";
  const dryRun = config.dryRun ?? false;
  const stackInfo = await getStackInfo(config);
  const stackName = stackInfo.stackName;
  console.log(`Finding S3 buckets in stack: ${stackName}`);
  console.log(`Region: ${region}, Profile: ${profile}`);
  if (dryRun) {
    console.log("\u26A0\uFE0F  DRY RUN MODE - No buckets will be emptied");
  }
  console.log("");
  const buckets = await listStackBuckets(stackName, region, profile);
  if (buckets.length === 0) {
    console.log("No S3 buckets found in stack.");
    return { buckets: [], results: [] };
  }
  console.log(`Found ${buckets.length} S3 bucket(s):`);
  for (const bucket of buckets) {
    console.log(`  - ${bucket.bucketName} (${bucket.logicalId})`);
  }
  console.log("");
  const results = [];
  for (const bucket of buckets) {
    try {
      const result = await emptyBucket(bucket.bucketName, region, profile, dryRun);
      results.push({
        bucket: bucket.bucketName,
        versionsDeleted: result.versionsDeleted,
        markersDeleted: result.markersDeleted
      });
      console.log(
        `  \u2705 Completed: ${result.versionsDeleted} versions, ${result.markersDeleted} markers`
      );
    } catch (error) {
      console.error(`  \u274C Failed to empty bucket ${bucket.bucketName}:`, error);
      results.push({
        bucket: bucket.bucketName,
        versionsDeleted: 0,
        markersDeleted: 0
      });
    }
    console.log("");
  }
  return { buckets, results };
}

// libs/admin/admin-s3-empty/bin/empty-buckets.ts
async function main() {
  const appPath = process.env["APP_PATH"];
  const stackName = process.env["STACK_NAME"];
  const domain = process.env["DOMAIN"];
  const region = process.env["AWS_REGION"];
  const profile = process.env["AWS_PROFILE"];
  const dryRun = process.env["DRY_RUN"] === "1" || process.env["DRY_RUN"] === "true";
  try {
    const result = await emptyStackBuckets({
      appPath,
      stackName,
      domain,
      region,
      profile,
      dryRun
    });
    console.log("=".repeat(60));
    console.log("Summary:");
    console.log("=".repeat(60));
    console.log(`Total buckets processed: ${result.buckets.length}`);
    if (result.results.length > 0) {
      let totalVersions = 0;
      let totalMarkers = 0;
      for (const res of result.results) {
        totalVersions += res.versionsDeleted;
        totalMarkers += res.markersDeleted;
        console.log(`  ${res.bucket}: ${res.versionsDeleted} versions, ${res.markersDeleted} markers`);
      }
      console.log("");
      console.log(`Total: ${totalVersions} versions, ${totalMarkers} markers deleted`);
    }
    if (dryRun) {
      console.log("");
      console.log("\u26A0\uFE0F  This was a dry run. No buckets were actually emptied.");
    }
    process.exit(0);
  } catch (error) {
    console.error("Error emptying stack buckets:", error);
    process.exit(1);
  }
}
main();
