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
var import_aws_cdk_lib3 = require("aws-cdk-lib");

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

// libs/infra/core-params/src/lib/core-params.ts
var CORE_PARAM_PREFIX = "/emcnotary/core";
var P_DOMAIN_NAME = `${CORE_PARAM_PREFIX}/domainName`;
var P_BACKUP_BUCKET = `${CORE_PARAM_PREFIX}/backupBucket`;
var P_NEXTCLOUD_BUCKET = `${CORE_PARAM_PREFIX}/nextcloudBucket`;
var P_ALARMS_TOPIC = `${CORE_PARAM_PREFIX}/alarmsTopicArn`;
var P_SES_IDENTITY_ARN = `${CORE_PARAM_PREFIX}/sesIdentityArn`;

// apps/cdk-emcnotary-instance/src/stacks/instance-stack.ts
var EmcNotaryInstanceStack = class extends import_aws_cdk_lib3.Stack {
  constructor(scope, id, props) {
    super(scope, id, props);
    tagStack(this, "emcnotary-mailserver");
    const domainName = import_aws_cdk_lib3.aws_ssm.StringParameter.fromStringParameterAttributes(
      this,
      "CoreDomainName",
      { parameterName: P_DOMAIN_NAME }
    ).stringValue;
    const backupBucket = import_aws_cdk_lib3.aws_ssm.StringParameter.fromStringParameterAttributes(
      this,
      "CoreBackupBucket",
      { parameterName: P_BACKUP_BUCKET }
    ).stringValue;
    const nextcloudBucket = import_aws_cdk_lib3.aws_ssm.StringParameter.fromStringParameterAttributes(
      this,
      "CoreNextcloudBucket",
      { parameterName: P_NEXTCLOUD_BUCKET }
    ).stringValue;
    const alarmsTopicArn = import_aws_cdk_lib3.aws_ssm.StringParameter.fromStringParameterAttributes(
      this,
      "CoreAlarmsTopic",
      { parameterName: P_ALARMS_TOPIC }
    ).stringValue;
    const instanceType = new import_aws_cdk_lib3.CfnParameter(this, "InstanceType", {
      type: "String",
      default: "t2.micro",
      description: "EC2 instance type"
    });
    const instanceDns = new import_aws_cdk_lib3.CfnParameter(this, "InstanceDns", {
      type: "String",
      default: "box",
      description: "DNS name of Instance (within the 'DomainName')"
    });
    const vpc = import_aws_cdk_lib3.aws_ec2.Vpc.fromLookup(this, "DefaultVpc", { isDefault: true });
    const sg = new import_aws_cdk_lib3.aws_ec2.SecurityGroup(this, "InstanceSecurityGroup", {
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
    const keyPair = new import_aws_cdk_lib3.aws_ec2.CfnKeyPair(this, "NewKeyPair", {
      keyName: `${domainName}-keypair`,
      tags: [
        {
          key: "MAILSERVER",
          value: domainName
        }
      ]
    });
    const role = new import_aws_cdk_lib3.aws_iam.Role(this, "InstanceRole", {
      roleName: `MailInABoxInstanceRole-${this.stackName}`,
      assumedBy: new import_aws_cdk_lib3.aws_iam.ServicePrincipal("ec2.amazonaws.com"),
      description: "IAM role for Mail-in-a-Box instance"
    });
    role.addToPolicy(
      new import_aws_cdk_lib3.aws_iam.PolicyStatement({
        sid: "BackupS3BucketAccessMIAB",
        actions: ["s3:*"],
        resources: [
          `arn:aws:s3:::${backupBucket}/*`,
          `arn:aws:s3:::${backupBucket}`
        ]
      })
    );
    role.addToPolicy(
      new import_aws_cdk_lib3.aws_iam.PolicyStatement({
        sid: "NextCloudS3Policy",
        actions: ["s3:*"],
        resources: [
          `arn:aws:s3:::${nextcloudBucket}/*`,
          `arn:aws:s3:::${nextcloudBucket}`
        ]
      })
    );
    role.addToPolicy(
      new import_aws_cdk_lib3.aws_iam.PolicyStatement({
        sid: "SsmParameterAccessSmtpCredentials",
        actions: ["ssm:GetParameter"],
        resources: [
          `arn:aws:ssm:${this.region}:${this.account}:parameter/smtp-username-${this.stackName}`,
          `arn:aws:ssm:${this.region}:${this.account}:parameter/smtp-password-${this.stackName}`
        ]
      })
    );
    role.addToPolicy(
      new import_aws_cdk_lib3.aws_iam.PolicyStatement({
        actions: ["ssm:GetParameter", "ssm:GetParameters"],
        resources: [
          `arn:aws:ssm:${this.region}:${this.account}:parameter/emcnotary/core/*`
        ]
      })
    );
    const profile = new import_aws_cdk_lib3.aws_iam.CfnInstanceProfile(this, "InstanceProfile", {
      instanceProfileName: `MailInABoxInstanceProfile-${this.stackName}`,
      roles: [role.roleName]
    });
    const eip = new import_aws_cdk_lib3.aws_ec2.CfnEIP(this, "ElasticIP", {
      domain: "vpc",
      tags: [
        {
          key: "MAILSERVER",
          value: domainName
        }
      ]
    });
    const ami = import_aws_cdk_lib3.aws_ec2.MachineImage.fromSsmParameter(
      "/aws/service/canonical/ubuntu/server/jammy/stable/current/amd64/hvm/ebs-gp2/ami-id"
    );
    const instance = new import_aws_cdk_lib3.aws_ec2.Instance(this, "EC2Instance", {
      vpc,
      vpcSubnets: { subnetType: import_aws_cdk_lib3.aws_ec2.SubnetType.PUBLIC },
      securityGroup: sg,
      instanceType: new import_aws_cdk_lib3.aws_ec2.InstanceType(instanceType.valueAsString),
      machineImage: ami,
      role,
      keyName: keyPair.keyName,
      blockDevices: [
        {
          deviceName: "/dev/sda1",
          volume: import_aws_cdk_lib3.aws_ec2.BlockDeviceVolume.ebs(8, {
            volumeType: import_aws_cdk_lib3.aws_ec2.EbsDeviceVolumeType.GP2,
            deleteOnTermination: true,
            encrypted: true
          })
        }
      ]
    });
    import_aws_cdk_lib3.Tags.of(instance).add("Name", `MailInABoxInstance-${this.stackName}`);
    import_aws_cdk_lib3.Tags.of(instance).add("MAILSERVER", domainName);
    new import_aws_cdk_lib3.aws_ec2.CfnEIPAssociation(this, "InstanceEIPAssociation", {
      eip: eip.ref,
      instanceId: instance.instanceId
    });
    instance.addUserData(
      "#!/bin/bash",
      "set -euxo pipefail",
      `echo "Domain: ${domainName}"`,
      `echo "Instance DNS: ${instanceDns.valueAsString}.${domainName}"`,
      `echo "Backup bucket: ${backupBucket}"`,
      `echo "Nextcloud bucket: ${nextcloudBucket}"`,
      `echo "Elastic IP: ${eip.ref}"`,
      'echo "TODO: install & configure Mail-in-a-Box here"'
    );
    const adminPasswordParamName = `/MailInABoxAdminPassword-${this.stackName}`;
    new import_aws_cdk_lib3.CfnOutput(this, "ElasticIPAddress", {
      value: eip.ref,
      description: "The allocated Elastic IP address"
    });
    new import_aws_cdk_lib3.CfnOutput(this, "KeyPairId", {
      value: keyPair.attrKeyPairId,
      description: "The ID of the EC2 Key Pair"
    });
    new import_aws_cdk_lib3.CfnOutput(this, "InstancePublicIp", {
      value: instance.instancePublicIp,
      description: "The Public IP of the Mail-in-a-box instance"
    });
    new import_aws_cdk_lib3.CfnOutput(this, "AdminPassword", {
      value: adminPasswordParamName,
      description: "Name of the SSM Parameter containing the Admin Password to Mail-in-a-box Web-UI"
    });
    new import_aws_cdk_lib3.CfnOutput(this, "RestorePrefix", {
      value: instance.instanceId,
      description: "The S3 prefix where backups are stored is set to the ID of the EC2 instance of your current deployment"
    });
  }
};

// apps/cdk-emcnotary-instance/src/main.ts
var app = new cdk.App();
new EmcNotaryInstanceStack(app, "emcnotary-mailserver-instance", {
  env: {
    account: process.env["CDK_DEFAULT_ACCOUNT"],
    region: process.env["CDK_DEFAULT_REGION"] || "us-east-1"
  },
  description: "EMC Notary Mailserver \u2013 Instance stack (EC2/SG/EIP/InstanceProfile/userData)"
});
app.synth();
//# sourceMappingURL=main.cjs.map
