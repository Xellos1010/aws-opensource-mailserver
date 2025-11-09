import {
  Stack,
  StackProps,
  CfnOutput,
  CfnParameter,
  Tags,
  aws_ec2 as ec2,
  aws_ssm as ssm,
} from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { tagStack } from '@mm/infra-shared-constructs';
import {
  DomainConfig,
  InstanceConfig,
  createMailServerSecurityGroup,
  createInstanceRole,
  createNightlyReboot,
  createBootstrapPlaceholderUserData,
} from '@mm/infra-instance-constructs';

export interface MailServerInstanceStackProps extends StackProps {
  /** Domain configuration */
  domainConfig: DomainConfig;
  /** Instance configuration options */
  instanceConfig?: InstanceConfig;
}

export class MailServerInstanceStack extends Stack {
  constructor(scope: Construct, id: string, props: MailServerInstanceStackProps) {
    super(scope, id, props);
    const { domainConfig, instanceConfig = {} } = props;

    tagStack(this, `${domainConfig.domainName}-mailserver`);

    // Read core info from SSM (decoupled)
    const domainName = ssm.StringParameter.fromStringParameterAttributes(
      this,
      'CoreDomainName',
      { parameterName: `${domainConfig.coreParamPrefix}/domainName` }
    ).stringValue;

    const backupBucket = ssm.StringParameter.fromStringParameterAttributes(
      this,
      'CoreBackupBucket',
      { parameterName: `${domainConfig.coreParamPrefix}/backupBucket` }
    ).stringValue;

    const nextcloudBucket = ssm.StringParameter.fromStringParameterAttributes(
      this,
      'CoreNextcloudBucket',
      { parameterName: `${domainConfig.coreParamPrefix}/nextcloudBucket` }
    ).stringValue;

    const alarmsTopicArn = ssm.StringParameter.fromStringParameterAttributes(
      this,
      'CoreAlarmsTopic',
      { parameterName: `${domainConfig.coreParamPrefix}/alarmsTopicArn` }
    ).stringValue;

    const eipAllocationId = ssm.StringParameter.fromStringParameterAttributes(
      this,
      'CoreEipAllocationId',
      { parameterName: `${domainConfig.coreParamPrefix}/eipAllocationId` }
    ).stringValue;

    // Instance parameters
    const instanceType = new CfnParameter(this, 'InstanceType', {
      type: 'String',
      default: instanceConfig.instanceType || 't2.micro',
      description: 'EC2 instance type',
    });

    const instanceDns = new CfnParameter(this, 'InstanceDns', {
      type: 'String',
      default: instanceConfig.instanceDns || domainConfig.instanceDns || 'box',
      description: "DNS name of Instance (within the 'DomainName')",
    });

    // Network + Security Group (using shared construct)
    const vpc = ec2.Vpc.fromLookup(this, 'DefaultVpc', { isDefault: true });
    const sg = createMailServerSecurityGroup(this, 'InstanceSecurityGroup', vpc);

    // Key Pair
    const keyPair = new ec2.CfnKeyPair(this, 'NewKeyPair', {
      keyName: `${domainName}-keypair`,
      tags: [
        {
          key: 'MAILSERVER',
          value: domainName,
        },
      ],
    });

    // IAM role/profile (using shared construct)
    const { role, profile } = createInstanceRole(this, 'InstanceRole', {
      domainConfig,
      backupBucket,
      nextcloudBucket,
      stackName: this.stackName,
      region: this.region,
      account: this.account,
    });

    // EC2 Instance
    const ami = ec2.MachineImage.fromSsmParameter(
      '/aws/service/canonical/ubuntu/server/jammy/stable/current/amd64/hvm/ebs-gp2/ami-id'
    );

    // Create IKeyPair from key name for use with Instance construct
    // Using fromKeyPairName to avoid deprecated keyName property
    // Note: keyName is a literal string value, so we can use it directly
    const keyPairName = `${domainName}-keypair`;
    const keyPairRef = ec2.KeyPair.fromKeyPairName(this, 'KeyPairRef', keyPairName);

    const instance = new ec2.Instance(this, 'EC2Instance', {
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC },
      securityGroup: sg,
      instanceType: new ec2.InstanceType(instanceType.valueAsString),
      machineImage: ami,
      role,
      keyPair: keyPairRef,
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

    // Add tags
    Tags.of(instance).add('Name', `MailInABoxInstance-${this.stackName}`);
    Tags.of(instance).add('MAILSERVER', domainName);

    // EIP Association - uses existing EIP from core stack for hot-swapping capability
    new ec2.CfnEIPAssociation(this, 'InstanceEIPAssociation', {
      allocationId: eipAllocationId,
      instanceId: instance.instanceId,
    });

    // UserData: Minimal placeholder for SSM bootstrap
    // The actual MIAB setup will be done via SSM RunCommand after instance launch
    const userData = createBootstrapPlaceholderUserData(
      domainName,
      instanceDns.valueAsString,
      this.stackName,
      this.region
    );
    instance.addUserData(...userData);

    // Nightly Reboot (using shared construct)
    const { rule: rebootRule } = createNightlyReboot(this, 'NightlyReboot', {
      instanceId: instance.instanceId,
      schedule: instanceConfig.nightlyRebootSchedule,
      description: instanceConfig.nightlyRebootDescription,
      region: this.region,
      account: this.account,
    });

    // Outputs for admin tooling and bootstrap discovery
    new CfnOutput(this, 'InstanceId', {
      value: instance.instanceId,
      description: 'The EC2 instance ID',
    });

    new CfnOutput(this, 'KeyPairId', {
      value: keyPair.attrKeyPairId,
      description: 'The ID of the EC2 Key Pair',
    });

    new CfnOutput(this, 'DomainName', {
      value: domainName,
      description: 'The domain name',
    });

    new CfnOutput(this, 'InstanceDnsName', {
      value: instanceDns.valueAsString,
      description: 'The instance DNS name',
    });

    new CfnOutput(this, 'ElasticIPAllocationId', {
      value: eipAllocationId,
      description: 'The Elastic IP allocation ID (from core stack)',
    });

    new CfnOutput(this, 'InstancePublicIp', {
      value: instance.instancePublicIp,
      description: 'The Public IP of the Mail-in-a-box instance',
    });

    new CfnOutput(this, 'AdminPassword', {
      value: `/MailInABoxAdminPassword-${this.stackName}`,
      description: 'Name of the SSM Parameter containing the Admin Password to Mail-in-a-box Web-UI',
    });

    new CfnOutput(this, 'RestorePrefixValue', {
      value: instance.instanceId,
      description: 'The S3 prefix where backups are stored is set to the ID of the EC2 instance of your current deployment',
    });

    new CfnOutput(this, 'NightlyRebootSchedule', {
      value: instanceConfig.nightlyRebootDescription || '03:00 ET (08:00 UTC) daily',
      description: 'Schedule for automatic nightly reboot of Mail-in-a-Box instance',
    });

    new CfnOutput(this, 'BootstrapCommand', {
      value: `pnpm nx run ops-runner:instance:bootstrap -- --domain ${domainName}`,
      description: 'Command to bootstrap this instance via SSM',
    });
  }
}

// Export for backward compatibility
export class EmcNotaryInstanceStack extends MailServerInstanceStack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, {
      ...props,
      domainConfig: {
        domainName: 'emcnotary.com',
        instanceDns: 'box',
        coreParamPrefix: '/emcnotary/core',
        stackName: id,
      },
    });
  }
}