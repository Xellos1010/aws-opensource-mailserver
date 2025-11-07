#!/usr/bin/env node
"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// apps/cdk-emcnotary-instance/src/main.ts
var cdk = __toESM(require("aws-cdk-lib"));

// apps/cdk-emcnotary-instance/src/stacks/instance-stack.ts
var import_aws_cdk_lib6 = require("aws-cdk-lib");

// libs/infra/shared-constructs/src/lib/alarms.ts
var import_constructs = require("constructs");
var import_aws_cdk_lib = require("aws-cdk-lib");

// libs/infra/shared-constructs/src/lib/tags.ts
var import_aws_cdk_lib2 = require("aws-cdk-lib");
function tagStack(stack, app2) {
  import_aws_cdk_lib2.Tags.of(stack).add("App", app2);
  import_aws_cdk_lib2.Tags.of(stack).add("ManagedBy", "Nx+CDK");
  import_aws_cdk_lib2.Tags.of(stack).add("Environment", process.env["ENVIRONMENT"] || "dev");
}

// libs/infra/instance-constructs/src/lib/security-group.ts
var import_aws_cdk_lib3 = require("aws-cdk-lib");
function createMailServerSecurityGroup(scope, id, vpc) {
  const sg = new import_aws_cdk_lib3.aws_ec2.SecurityGroup(scope, id, {
    vpc,
    allowAllOutbound: true,
    description: "Security Group for Mail-in-a-box Instance"
  });
  sg.addIngressRule(import_aws_cdk_lib3.aws_ec2.Peer.anyIpv4(), import_aws_cdk_lib3.aws_ec2.Port.tcp(22), "SSH");
  sg.addIngressRule(import_aws_cdk_lib3.aws_ec2.Peer.anyIpv4(), import_aws_cdk_lib3.aws_ec2.Port.tcp(53), "DNS (TCP)");
  sg.addIngressRule(import_aws_cdk_lib3.aws_ec2.Peer.anyIpv4(), import_aws_cdk_lib3.aws_ec2.Port.udp(53), "DNS (UDP)");
  sg.addIngressRule(import_aws_cdk_lib3.aws_ec2.Peer.anyIpv4(), import_aws_cdk_lib3.aws_ec2.Port.tcp(80), "HTTP");
  sg.addIngressRule(import_aws_cdk_lib3.aws_ec2.Peer.anyIpv4(), import_aws_cdk_lib3.aws_ec2.Port.tcp(443), "HTTPS");
  sg.addIngressRule(import_aws_cdk_lib3.aws_ec2.Peer.anyIpv4(), import_aws_cdk_lib3.aws_ec2.Port.tcp(25), "SMTP (STARTTLS)");
  sg.addIngressRule(import_aws_cdk_lib3.aws_ec2.Peer.anyIpv4(), import_aws_cdk_lib3.aws_ec2.Port.tcp(143), "IMAP (STARTTLS)");
  sg.addIngressRule(import_aws_cdk_lib3.aws_ec2.Peer.anyIpv4(), import_aws_cdk_lib3.aws_ec2.Port.tcp(993), "IMAPS");
  sg.addIngressRule(import_aws_cdk_lib3.aws_ec2.Peer.anyIpv4(), import_aws_cdk_lib3.aws_ec2.Port.tcp(465), "SMTPS");
  sg.addIngressRule(import_aws_cdk_lib3.aws_ec2.Peer.anyIpv4(), import_aws_cdk_lib3.aws_ec2.Port.tcp(587), "SMTP Submission");
  sg.addIngressRule(import_aws_cdk_lib3.aws_ec2.Peer.anyIpv4(), import_aws_cdk_lib3.aws_ec2.Port.tcp(4190), "Sieve Mail filtering");
  return sg;
}

// libs/infra/instance-constructs/src/lib/iam-role.ts
var import_aws_cdk_lib4 = require("aws-cdk-lib");
function createInstanceRole(scope, id, props) {
  const { domainConfig: domainConfig2, backupBucket, nextcloudBucket, stackName: stackName2, region, account } = props;
  const role = new import_aws_cdk_lib4.aws_iam.Role(scope, id, {
    roleName: `MailInABoxInstanceRole-${stackName2}`,
    assumedBy: new import_aws_cdk_lib4.aws_iam.ServicePrincipal("ec2.amazonaws.com"),
    description: "IAM role for Mail-in-a-Box instance"
  });
  role.addToPolicy(
    new import_aws_cdk_lib4.aws_iam.PolicyStatement({
      sid: "BackupS3BucketAccessMIAB",
      actions: ["s3:*"],
      resources: [
        `arn:aws:s3:::${backupBucket}/*`,
        `arn:aws:s3:::${backupBucket}`
      ]
    })
  );
  role.addToPolicy(
    new import_aws_cdk_lib4.aws_iam.PolicyStatement({
      sid: "NextCloudS3Policy",
      actions: ["s3:*"],
      resources: [
        `arn:aws:s3:::${nextcloudBucket}/*`,
        `arn:aws:s3:::${nextcloudBucket}`
      ]
    })
  );
  role.addToPolicy(
    new import_aws_cdk_lib4.aws_iam.PolicyStatement({
      sid: "SsmParameterAccessSmtpCredentials",
      actions: ["ssm:GetParameter"],
      resources: [
        `arn:aws:ssm:${region}:${account}:parameter/smtp-username-${stackName2}`,
        `arn:aws:ssm:${region}:${account}:parameter/smtp-password-${stackName2}`
      ]
    })
  );
  role.addToPolicy(
    new import_aws_cdk_lib4.aws_iam.PolicyStatement({
      actions: ["ssm:GetParameter", "ssm:GetParameters"],
      resources: [
        `arn:aws:ssm:${region}:${account}:parameter${domainConfig2.coreParamPrefix}/*`
      ]
    })
  );
  role.addToPrincipalPolicy(
    new import_aws_cdk_lib4.aws_iam.PolicyStatement({
      actions: ["ssm:GetParameter", "ssm:GetParameters", "ssm:PutParameter"],
      resources: [
        `arn:aws:ssm:${region}:${account}:parameter/smtp-username-*`,
        `arn:aws:ssm:${region}:${account}:parameter/smtp-password-*`,
        `arn:aws:ssm:${region}:${account}:parameter/MailInABoxAdminPassword-*`
      ]
    })
  );
  const profile = new import_aws_cdk_lib4.aws_iam.CfnInstanceProfile(scope, `${id}Profile`, {
    instanceProfileName: `MailInABoxInstanceProfile-${stackName2}`,
    roles: [role.roleName]
  });
  return { role, profile };
}

// libs/infra/instance-constructs/src/lib/nightly-reboot.ts
var import_aws_cdk_lib5 = require("aws-cdk-lib");
function createNightlyReboot(scope, id, props) {
  const {
    instanceId,
    schedule = "0 8 * * ? *",
    description = "Daily reboot of Mail-in-a-Box instance at 03:00 ET (08:00 UTC)",
    region,
    account
  } = props;
  const rebootLambdaRole = new import_aws_cdk_lib5.aws_iam.Role(scope, `${id}Role`, {
    assumedBy: new import_aws_cdk_lib5.aws_iam.ServicePrincipal("lambda.amazonaws.com"),
    managedPolicies: [
      import_aws_cdk_lib5.aws_iam.ManagedPolicy.fromAwsManagedPolicyName("service-role/AWSLambdaBasicExecutionRole")
    ]
  });
  rebootLambdaRole.addToPolicy(
    new import_aws_cdk_lib5.aws_iam.PolicyStatement({
      actions: ["ec2:RebootInstances"],
      resources: [`arn:aws:ec2:${region}:${account}:instance/${instanceId}`]
    })
  );
  const rebootLambda = new import_aws_cdk_lib5.aws_lambda.Function(scope, `${id}Function`, {
    runtime: import_aws_cdk_lib5.aws_lambda.Runtime.NODEJS_20_X,
    code: import_aws_cdk_lib5.aws_lambda.Code.fromInline(`
import { EC2Client, RebootInstancesCommand } from '@aws-sdk/client-ec2';

const ec2Client = new EC2Client({ region: process.env.AWS_REGION });

export const handler = async (event: any) => {
  const instanceId = process.env.INSTANCE_ID;

  if (!instanceId) {
    console.error('INSTANCE_ID environment variable not set');
    throw new Error('INSTANCE_ID environment variable not set');
  }

  console.log(\`Rebooting Mail-in-a-Box instance: \${instanceId}\`);

  try {
    await ec2Client.send(
      new RebootInstancesCommand({
        InstanceIds: [instanceId],
      })
    );

    console.log(\`Successfully initiated reboot for instance: \${instanceId}\`);
    return {
      statusCode: 200,
      body: \`Reboot initiated for instance \${instanceId}\`,
    };
  } catch (error) {
    console.error(\`Failed to reboot instance \${instanceId}:\`, error);
    throw error;
  }
};
    `),
    handler: "index.handler",
    role: rebootLambdaRole,
    timeout: import_aws_cdk_lib5.Duration.seconds(30),
    environment: {
      INSTANCE_ID: instanceId
    }
  });
  const [minute, hour, day, month, year] = schedule.split(" ");
  const rebootRule = new import_aws_cdk_lib5.aws_events.Rule(scope, `${id}Rule`, {
    schedule: import_aws_cdk_lib5.aws_events.Schedule.cron({
      minute,
      hour,
      day,
      month,
      year
    }),
    description,
    enabled: true
  });
  rebootRule.addTarget(new import_aws_cdk_lib5.aws_events_targets.LambdaFunction(rebootLambda));
  return { lambda: rebootLambda, rule: rebootRule };
}

// libs/infra/instance-constructs/src/lib/user-data.ts
function createBootstrapPlaceholderUserData(domainName, instanceDns2, stackName2, region) {
  return [
    "#!/bin/bash",
    "set -euxo pipefail",
    `echo "=========================================="`,
    `echo "Mail Server Instance Bootstrap Placeholder"`,
    `echo "Domain: ${domainName}"`,
    `echo "Instance DNS: ${instanceDns2}.${domainName}"`,
    `echo "Stack: ${stackName2}"`,
    `echo "Region: ${region}"`,
    `echo "=========================================="`,
    `echo ""`,
    `echo "This instance is ready for SSM-based bootstrap."`,
    `echo "Run the bootstrap command to configure Mail-in-a-Box:"`,
    `echo "  pnpm nx run ops-runner:instance:bootstrap -- --domain ${domainName}"`,
    `echo ""`,
    `echo "Preparing instance for bootstrap..."`,
    `# Install AWS CLI if not present (needed for SSM and bootstrap script)`,
    `if ! command -v aws >/dev/null 2>&1; then`,
    `  echo "Installing AWS CLI..."`,
    `  apt-get update -qq`,
    `  apt-get install -y curl unzip jq`,
    `  curl -sSL "https://awscli.amazonaws.com/awscli-exe-linux-$(uname -m).zip" -o /tmp/awscliv2.zip`,
    `  unzip -q /tmp/awscliv2.zip -d /tmp`,
    `  /tmp/aws/install`,
    `  rm -rf /tmp/awscliv2.zip /tmp/aws`,
    `fi`,
    `# Install SSM agent (should be pre-installed on Ubuntu, but ensure it's running)`,
    `systemctl enable amazon-ssm-agent || true`,
    `systemctl start amazon-ssm-agent || true`,
    `echo "Instance ready for bootstrap at: $(date)"`,
    `echo "=========================================="`
  ];
}

// apps/cdk-emcnotary-instance/src/stacks/instance-stack.ts
var MailServerInstanceStack = class extends import_aws_cdk_lib6.Stack {
  constructor(scope, id, props) {
    super(scope, id, props);
    const { domainConfig: domainConfig2, instanceConfig: instanceConfig2 = {} } = props;
    tagStack(this, `${domainConfig2.domainName}-mailserver`);
    const domainName = import_aws_cdk_lib6.aws_ssm.StringParameter.fromStringParameterAttributes(
      this,
      "CoreDomainName",
      { parameterName: `${domainConfig2.coreParamPrefix}/domainName` }
    ).stringValue;
    const backupBucket = import_aws_cdk_lib6.aws_ssm.StringParameter.fromStringParameterAttributes(
      this,
      "CoreBackupBucket",
      { parameterName: `${domainConfig2.coreParamPrefix}/backupBucket` }
    ).stringValue;
    const nextcloudBucket = import_aws_cdk_lib6.aws_ssm.StringParameter.fromStringParameterAttributes(
      this,
      "CoreNextcloudBucket",
      { parameterName: `${domainConfig2.coreParamPrefix}/nextcloudBucket` }
    ).stringValue;
    const alarmsTopicArn = import_aws_cdk_lib6.aws_ssm.StringParameter.fromStringParameterAttributes(
      this,
      "CoreAlarmsTopic",
      { parameterName: `${domainConfig2.coreParamPrefix}/alarmsTopicArn` }
    ).stringValue;
    const eipAllocationId = import_aws_cdk_lib6.aws_ssm.StringParameter.fromStringParameterAttributes(
      this,
      "CoreEipAllocationId",
      { parameterName: `${domainConfig2.coreParamPrefix}/eipAllocationId` }
    ).stringValue;
    const instanceType = new import_aws_cdk_lib6.CfnParameter(this, "InstanceType", {
      type: "String",
      default: instanceConfig2.instanceType || "t2.micro",
      description: "EC2 instance type"
    });
    const instanceDns2 = new import_aws_cdk_lib6.CfnParameter(this, "InstanceDns", {
      type: "String",
      default: instanceConfig2.instanceDns || domainConfig2.instanceDns || "box",
      description: "DNS name of Instance (within the 'DomainName')"
    });
    const vpc = import_aws_cdk_lib6.aws_ec2.Vpc.fromLookup(this, "DefaultVpc", { isDefault: true });
    const sg = createMailServerSecurityGroup(this, "InstanceSecurityGroup", vpc);
    const keyPair = new import_aws_cdk_lib6.aws_ec2.CfnKeyPair(this, "NewKeyPair", {
      keyName: `${domainName}-keypair`,
      tags: [
        {
          key: "MAILSERVER",
          value: domainName
        }
      ]
    });
    const { role, profile } = createInstanceRole(this, "InstanceRole", {
      domainConfig: domainConfig2,
      backupBucket,
      nextcloudBucket,
      stackName: this.stackName,
      region: this.region,
      account: this.account
    });
    const ami = import_aws_cdk_lib6.aws_ec2.MachineImage.fromSsmParameter(
      "/aws/service/canonical/ubuntu/server/jammy/stable/current/amd64/hvm/ebs-gp2/ami-id"
    );
    const instance = new import_aws_cdk_lib6.aws_ec2.Instance(this, "EC2Instance", {
      vpc,
      vpcSubnets: { subnetType: import_aws_cdk_lib6.aws_ec2.SubnetType.PUBLIC },
      securityGroup: sg,
      instanceType: new import_aws_cdk_lib6.aws_ec2.InstanceType(instanceType.valueAsString),
      machineImage: ami,
      role,
      keyName: keyPair.keyName,
      blockDevices: [
        {
          deviceName: "/dev/sda1",
          volume: import_aws_cdk_lib6.aws_ec2.BlockDeviceVolume.ebs(8, {
            volumeType: import_aws_cdk_lib6.aws_ec2.EbsDeviceVolumeType.GP2,
            deleteOnTermination: true,
            encrypted: true
          })
        }
      ]
    });
    import_aws_cdk_lib6.Tags.of(instance).add("Name", `MailInABoxInstance-${this.stackName}`);
    import_aws_cdk_lib6.Tags.of(instance).add("MAILSERVER", domainName);
    new import_aws_cdk_lib6.aws_ec2.CfnEIPAssociation(this, "InstanceEIPAssociation", {
      allocationId: eipAllocationId,
      instanceId: instance.instanceId
    });
    const userData = createBootstrapPlaceholderUserData(
      domainName,
      instanceDns2.valueAsString,
      this.stackName,
      this.region
    );
    instance.addUserData(...userData);
    const { rule: rebootRule } = createNightlyReboot(this, "NightlyReboot", {
      instanceId: instance.instanceId,
      schedule: instanceConfig2.nightlyRebootSchedule,
      description: instanceConfig2.nightlyRebootDescription,
      region: this.region,
      account: this.account
    });
    new import_aws_cdk_lib6.CfnOutput(this, "InstanceId", {
      value: instance.instanceId,
      description: "The EC2 instance ID"
    });
    new import_aws_cdk_lib6.CfnOutput(this, "KeyPairId", {
      value: keyPair.attrKeyPairId,
      description: "The ID of the EC2 Key Pair"
    });
    new import_aws_cdk_lib6.CfnOutput(this, "DomainName", {
      value: domainName,
      description: "The domain name"
    });
    new import_aws_cdk_lib6.CfnOutput(this, "InstanceDnsName", {
      value: instanceDns2.valueAsString,
      description: "The instance DNS name"
    });
    new import_aws_cdk_lib6.CfnOutput(this, "ElasticIPAllocationId", {
      value: eipAllocationId,
      description: "The Elastic IP allocation ID (from core stack)"
    });
    new import_aws_cdk_lib6.CfnOutput(this, "InstancePublicIp", {
      value: instance.instancePublicIp,
      description: "The Public IP of the Mail-in-a-box instance"
    });
    new import_aws_cdk_lib6.CfnOutput(this, "AdminPassword", {
      value: `/MailInABoxAdminPassword-${this.stackName}`,
      description: "Name of the SSM Parameter containing the Admin Password to Mail-in-a-box Web-UI"
    });
    new import_aws_cdk_lib6.CfnOutput(this, "RestorePrefixValue", {
      value: instance.instanceId,
      description: "The S3 prefix where backups are stored is set to the ID of the EC2 instance of your current deployment"
    });
    new import_aws_cdk_lib6.CfnOutput(this, "NightlyRebootSchedule", {
      value: instanceConfig2.nightlyRebootDescription || "03:00 ET (08:00 UTC) daily",
      description: "Schedule for automatic nightly reboot of Mail-in-a-Box instance"
    });
    new import_aws_cdk_lib6.CfnOutput(this, "BootstrapCommand", {
      value: `pnpm nx run ops-runner:instance:bootstrap -- --domain ${domainName}`,
      description: "Command to bootstrap this instance via SSM"
    });
  }
};
var EmcNotaryInstanceStack = class extends MailServerInstanceStack {
  constructor(scope, id, props) {
    super(scope, id, {
      ...props,
      domainConfig: {
        domainName: "emcnotary.com",
        instanceDns: "box",
        coreParamPrefix: "/emcnotary/core",
        stackName: id
      }
    });
  }
};

// apps/cdk-emcnotary-instance/src/main.ts
var app = new cdk.App();
var domain = app.node.tryGetContext("domain") || process.env["DOMAIN"] || "emcnotary.com";
var instanceDns = app.node.tryGetContext("instanceDns") || process.env["INSTANCE_DNS"] || "box";
var coreParamPrefix = app.node.tryGetContext("coreParamPrefix") || `/emcnotary/core`;
var instanceConfig = {
  instanceType: app.node.tryGetContext("instanceType"),
  instanceDns: app.node.tryGetContext("instanceDns"),
  sesRelay: app.node.tryGetContext("sesRelay") !== "false",
  swapSizeGiB: app.node.tryGetContext("swapSizeGiB"),
  mailInABoxVersion: app.node.tryGetContext("mailInABoxVersion"),
  mailInABoxCloneUrl: app.node.tryGetContext("mailInABoxCloneUrl"),
  nightlyRebootSchedule: app.node.tryGetContext("nightlyRebootSchedule"),
  nightlyRebootDescription: app.node.tryGetContext("nightlyRebootDescription")
};
var stackName = app.node.tryGetContext("stackName") || `${domain.replace(/\./g, "-")}-mailserver-instance`;
var domainConfig = {
  domainName: domain,
  instanceDns,
  coreParamPrefix,
  stackName
};
if (domain === "emcnotary.com") {
  new EmcNotaryInstanceStack(app, stackName, {
    env: {
      account: process.env["CDK_DEFAULT_ACCOUNT"],
      region: process.env["CDK_DEFAULT_REGION"] || "us-east-1"
    },
    description: `${domain} Mailserver \u2013 Instance stack (EC2/SG/EIP/InstanceProfile/SSM Bootstrap Ready)`
  });
} else {
  new MailServerInstanceStack(app, stackName, {
    domainConfig,
    instanceConfig,
    env: {
      account: process.env["CDK_DEFAULT_ACCOUNT"],
      region: process.env["CDK_DEFAULT_REGION"] || "us-east-1"
    },
    description: `${domain} Mailserver \u2013 Instance stack (EC2/SG/EIP/InstanceProfile/SSM Bootstrap Ready)`
  });
}
app.synth();
//# sourceMappingURL=main.cjs.map
