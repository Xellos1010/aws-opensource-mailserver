import {
  Stack,
  StackProps,
  CfnOutput,
  CfnParameter,
  Tags,
  aws_ec2 as ec2,
  aws_iam as iam,
  aws_ssm as ssm,
  RemovalPolicy,
} from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { tagStack } from '@mm/infra-shared-constructs';
import {
  P_DOMAIN_NAME,
  P_BACKUP_BUCKET,
  P_NEXTCLOUD_BUCKET,
  P_ALARMS_TOPIC,
} from '@mm/infra-core-params';

export class EmcNotaryInstanceStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);
    tagStack(this, 'emcnotary-mailserver');

    // Read core info from SSM (decoupled)
    const domainName = ssm.StringParameter.fromStringParameterAttributes(
      this,
      'CoreDomainName',
      { parameterName: P_DOMAIN_NAME }
    ).stringValue;

    const backupBucket = ssm.StringParameter.fromStringParameterAttributes(
      this,
      'CoreBackupBucket',
      { parameterName: P_BACKUP_BUCKET }
    ).stringValue;

    const nextcloudBucket = ssm.StringParameter.fromStringParameterAttributes(
      this,
      'CoreNextcloudBucket',
      { parameterName: P_NEXTCLOUD_BUCKET }
    ).stringValue;

    const alarmsTopicArn = ssm.StringParameter.fromStringParameterAttributes(
      this,
      'CoreAlarmsTopic',
      { parameterName: P_ALARMS_TOPIC }
    ).stringValue;

    // Instance parameters (matching CloudFormation template)
    const instanceType = new CfnParameter(this, 'InstanceType', {
      type: 'String',
      default: 't2.micro',
      description: 'EC2 instance type',
    });

    const instanceDns = new CfnParameter(this, 'InstanceDns', {
      type: 'String',
      default: 'box',
      description: "DNS name of Instance (within the 'DomainName')",
    });

    // Network + Security Group (matching CloudFormation InstanceSecurityGroup)
    const vpc = ec2.Vpc.fromLookup(this, 'DefaultVpc', { isDefault: true });

    const sg = new ec2.SecurityGroup(this, 'InstanceSecurityGroup', {
      vpc,
      allowAllOutbound: true,
      description: 'Security Group for Mail-in-a-box Instance',
    });

    // Security group rules matching CloudFormation template
    sg.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(22), 'SSH');
    sg.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(53), 'DNS (TCP)');
    sg.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.udp(53), 'DNS (UDP)');
    sg.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(80), 'HTTP');
    sg.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(443), 'HTTPS');
    sg.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(25), 'SMTP (STARTTLS)');
    sg.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(143), 'IMAP (STARTTLS)');
    sg.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(993), 'IMAPS');
    sg.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(465), 'SMTPS');
    sg.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(587), 'SMTP Submission');
    sg.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(4190), 'Sieve Mail filtering');

    // Key Pair (matching CloudFormation NewKeyPair)
    const keyPair = new ec2.CfnKeyPair(this, 'NewKeyPair', {
      keyName: `${domainName}-keypair`,
      tags: [
        {
          key: 'MAILSERVER',
          value: domainName,
        },
      ],
    });

    // IAM role/profile (matching CloudFormation InstanceRole and InstanceProfile)
    const role = new iam.Role(this, 'InstanceRole', {
      roleName: `MailInABoxInstanceRole-${this.stackName}`,
      assumedBy: new iam.ServicePrincipal('ec2.amazonaws.com'),
      description: 'IAM role for Mail-in-a-Box instance',
    });

    // S3 bucket access policies (matching CloudFormation)
    role.addToPolicy(
      new iam.PolicyStatement({
        sid: 'BackupS3BucketAccessMIAB',
        actions: ['s3:*'],
        resources: [
          `arn:aws:s3:::${backupBucket}/*`,
          `arn:aws:s3:::${backupBucket}`,
        ],
      })
    );

    role.addToPolicy(
      new iam.PolicyStatement({
        sid: 'NextCloudS3Policy',
        actions: ['s3:*'],
        resources: [
          `arn:aws:s3:::${nextcloudBucket}/*`,
          `arn:aws:s3:::${nextcloudBucket}`,
        ],
      })
    );

    // SSM parameter access for SMTP credentials (if SES relay is enabled)
    role.addToPolicy(
      new iam.PolicyStatement({
        sid: 'SsmParameterAccessSmtpCredentials',
        actions: ['ssm:GetParameter'],
        resources: [
          `arn:aws:ssm:${this.region}:${this.account}:parameter/smtp-username-${this.stackName}`,
          `arn:aws:ssm:${this.region}:${this.account}:parameter/smtp-password-${this.stackName}`,
        ],
      })
    );

    // SSM parameter access for core parameters
    role.addToPolicy(
      new iam.PolicyStatement({
        actions: ['ssm:GetParameter', 'ssm:GetParameters'],
        resources: [
          `arn:aws:ssm:${this.region}:${this.account}:parameter/emcnotary/core/*`,
        ],
      })
    );

    const profile = new iam.CfnInstanceProfile(this, 'InstanceProfile', {
      instanceProfileName: `MailInABoxInstanceProfile-${this.stackName}`,
      roles: [role.roleName],
    });

    // Elastic IP (matching CloudFormation ElasticIP)
    const eip = new ec2.CfnEIP(this, 'ElasticIP', {
      domain: 'vpc',
      tags: [
        {
          key: 'MAILSERVER',
          value: domainName,
        },
      ],
    });

    // EC2 Instance (matching CloudFormation EC2Instance)
    // Note: Using Ubuntu AMI from SSM parameter (matching CloudFormation InstanceAMI)
    const ami = ec2.MachineImage.fromSsmParameter(
      '/aws/service/canonical/ubuntu/server/jammy/stable/current/amd64/hvm/ebs-gp2/ami-id'
    );

    const instance = new ec2.Instance(this, 'EC2Instance', {
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC },
      securityGroup: sg,
      instanceType: new ec2.InstanceType(instanceType.valueAsString),
      machineImage: ami,
      role,
      keyName: keyPair.keyName,
      blockDevices: [
        {
          deviceName: '/dev/sda1',
          volume: ec2.BlockDeviceVolume.ebs(8, {
            volumeType: ec2.EbsDeviceVolumeType.GP2,
            deleteOnTermination: true,
            encrypted: true,
          }),
        },
      ],
    });

    // Add tags matching CloudFormation template
    Tags.of(instance).add('Name', `MailInABoxInstance-${this.stackName}`);
    Tags.of(instance).add('MAILSERVER', domainName);

    // EIP Association (matching CloudFormation InstanceEIPAssociation)
    new ec2.CfnEIPAssociation(this, 'InstanceEIPAssociation', {
      eip: eip.ref,
      instanceId: instance.instanceId,
    });

    // User data placeholder - will be populated with Mail-in-a-Box setup script
    // This matches the CloudFormation UserData but simplified for now
    instance.addUserData(
      '#!/bin/bash',
      'set -euxo pipefail',
      `echo "Domain: ${domainName}"`,
      `echo "Instance DNS: ${instanceDns.valueAsString}.${domainName}"`,
      `echo "Backup bucket: ${backupBucket}"`,
      `echo "Nextcloud bucket: ${nextcloudBucket}"`,
      `echo "Elastic IP: ${eip.ref}"`,
      'echo "TODO: install & configure Mail-in-a-Box here"'
    );

    // Outputs (matching CloudFormation template)
    new CfnOutput(this, 'ElasticIPAddress', {
      value: eip.ref,
      description: 'The allocated Elastic IP address',
    });

    new CfnOutput(this, 'KeyPairId', {
      value: keyPair.attrKeyPairId,
      description: 'The ID of the EC2 Key Pair',
    });

    new CfnOutput(this, 'InstancePublicIp', {
      value: instance.instancePublicIp,
      description: 'The Public IP of the Mail-in-a-box instance',
    });
  }
}
