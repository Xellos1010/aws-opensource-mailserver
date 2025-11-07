#!/usr/bin/env ts-node

// libs/support-scripts/aws/instance/src/lib/setup.ts
import { SSMClient, SendCommandCommand } from "@aws-sdk/client-ssm";
import { CloudFormationClient, DescribeStacksCommand } from "@aws-sdk/client-cloudformation";
import * as fs from "fs";
import * as path from "path";
async function runMiaBSetupForDomain(domain2, region2) {
  const stackName = `${domain2.replace(/\./g, "-")}-mailserver-instance`;
  const cf = new CloudFormationClient({ region: region2 });
  const ssm = new SSMClient({ region: region2 });
  const stacks = await cf.send(new DescribeStacksCommand({ StackName: stackName }));
  const outputs = Object.fromEntries((stacks.Stacks?.[0].Outputs || []).map((o) => [o.OutputKey, o.OutputValue]));
  const instanceId = outputs["InstanceId"];
  const instanceDns = outputs["InstanceDns"];
  if (!instanceId)
    throw new Error(`InstanceId output not found on stack ${stackName}`);
  const script = fs.readFileSync(path.join(__dirname, "../../../../apps/cdk-emcnotary-instance/src/assets/userdata/miab-setup.sh"), "utf8");
  const commands = [
    "set -euxo pipefail",
    'cat > /root/miab-setup.sh << "EOF_MIAB"',
    script,
    "EOF_MIAB",
    `export DOMAIN_NAME='${domain2}'`,
    `export INSTANCE_DNS='${instanceDns}'`,
    `export REGION='${region2}'`,
    `export STACK_NAME='${stackName}'`,
    // For EIP: look up AllocationId from SSM param written by core
    `EIP_ALLOC=$(aws ssm get-parameter --region ${region2} --name "/emcnotary/core/eipAllocationId" --query Parameter.Value --output text || true)`,
    `export EIP_ALLOCATION_ID="$EIP_ALLOC"`,
    // permit ad-hoc overrides through env on the runner if desired
    "bash -xe /root/miab-setup.sh"
  ];
  await ssm.send(new SendCommandCommand({
    InstanceIds: [instanceId],
    DocumentName: "AWS-RunShellScript",
    Parameters: { commands },
    CloudWatchOutputConfig: { CloudWatchOutputEnabled: true }
  }));
  console.log(`Triggered MIAB setup on ${instanceId} (${instanceDns}.${domain2})`);
}

// libs/support-scripts/aws/instance/bin/setup-instance.ts
var domain = process.env.DOMAIN || "emcnotary.com";
var region = process.env.CDK_DEFAULT_REGION || "us-east-1";
runMiaBSetupForDomain(domain, region).catch((e) => {
  console.error(e);
  process.exit(1);
});
