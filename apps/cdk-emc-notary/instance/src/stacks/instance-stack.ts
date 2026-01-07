import {
  Stack,
  StackProps,
  CfnOutput,
  CfnParameter,
  Tags,
  Duration,
  aws_ec2 as ec2,
  aws_ssm as ssm,
  aws_cloudwatch as cw,
  aws_cloudwatch_actions as cwa,
  aws_sns as sns,
  aws_lambda as lambda,
  aws_iam as iam,
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

    // Get SNS topic for alarm notifications
    const alarmsTopic = sns.Topic.fromTopicArn(this, 'AlarmsTopic', alarmsTopicArn);

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

    // Emergency Restart Lambda - automatically restarts instance on critical failures
    const emergencyRestartLambdaRole = new iam.Role(this, 'EmergencyRestartLambdaRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      description: 'Role for emergency instance restart Lambda',
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName(
          'service-role/AWSLambdaBasicExecutionRole'
        ),
      ],
    });

    emergencyRestartLambdaRole.addToPolicy(
      new iam.PolicyStatement({
        actions: [
          'ec2:StopInstances',
          'ec2:StartInstances',
          'ec2:DescribeInstances',
          'ec2:DescribeInstanceStatus',
        ],
        resources: [`arn:aws:ec2:${this.region}:${this.account}:instance/${instance.instanceId}`],
      })
    );

    const emergencyRestartLambda = new lambda.Function(this, 'EmergencyRestartLambda', {
      functionName: `emergency-restart-${domainName.replace(/\./g, '-')}`,
      runtime: lambda.Runtime.NODEJS_20_X,
      code: lambda.Code.fromInline(`
const { EC2Client, StopInstancesCommand, StartInstancesCommand, DescribeInstancesCommand } = require('@aws-sdk/client-ec2');

const ec2Client = new EC2Client({ region: process.env.AWS_REGION });

async function getInstanceState(instanceId) {
  const response = await ec2Client.send(
    new DescribeInstancesCommand({ InstanceIds: [instanceId] })
  );
  const instance = response.Reservations?.[0]?.Instances?.[0];
  if (!instance) {
    throw new Error(\`Instance \${instanceId} not found\`);
  }
  return instance.State?.Name || 'unknown';
}

async function waitForState(instanceId, desiredState, timeoutMs = 600000) {
  const startTime = Date.now();
  const checkInterval = 10000;

  console.log(\`Waiting for instance \${instanceId} to reach state: \${desiredState}\`);

  while (Date.now() - startTime < timeoutMs) {
    const currentState = await getInstanceState(instanceId);
    if (currentState === desiredState) {
      console.log(\`Instance \${instanceId} is now in \${desiredState} state\`);
      return;
    }
    const elapsed = Math.floor((Date.now() - startTime) / 1000 / 60);
    console.log(\`Current state: \${currentState}. Waiting... (\${elapsed} minutes elapsed)\`);
    await new Promise((resolve) => setTimeout(resolve, checkInterval));
  }
  throw new Error(\`Timeout waiting for instance \${instanceId} to reach \${desiredState} state\`);
}

async function stopAndStart(instanceId) {
  console.log(\`Emergency restart: Stopping and restarting instance \${instanceId}...\`);
  let currentState = await getInstanceState(instanceId);
  console.log(\`Current instance state: \${currentState}\`);

  if (currentState === 'pending') {
    console.log(\`Instance \${instanceId} is starting. Waiting for running state...\`);
    await waitForState(instanceId, 'running', 900000);
    currentState = await getInstanceState(instanceId);
  }

  if (currentState === 'running') {
    console.log(\`Stopping instance \${instanceId}...\`);
    await ec2Client.send(new StopInstancesCommand({ InstanceIds: [instanceId] }));
    await waitForState(instanceId, 'stopped');
  } else if (currentState === 'stopping') {
    console.log(\`Instance \${instanceId} is already stopping. Waiting...\`);
    await waitForState(instanceId, 'stopped');
  } else if (currentState === 'stopped') {
    console.log(\`Instance \${instanceId} is already stopped\`);
  } else {
    throw new Error(\`Cannot stop instance \${instanceId} from \${currentState} state\`);
  }

  currentState = await getInstanceState(instanceId);
  if (currentState === 'stopped') {
    console.log(\`Starting instance \${instanceId}...\`);
    await ec2Client.send(new StartInstancesCommand({ InstanceIds: [instanceId] }));
    await waitForState(instanceId, 'running', 900000);
  } else if (currentState === 'pending') {
    console.log(\`Instance \${instanceId} is already starting. Waiting...\`);
    await waitForState(instanceId, 'running', 900000);
  } else if (currentState === 'running') {
    console.log(\`Instance \${instanceId} is already running\`);
  } else {
    throw new Error(\`Cannot start instance \${instanceId} from \${currentState} state\`);
  }
  console.log(\`✅ Emergency restart completed successfully for instance \${instanceId}\`);
}

exports.handler = async (event) => {
  const instanceId = process.env.INSTANCE_ID;
  if (!instanceId) {
    throw new Error('INSTANCE_ID environment variable not set');
  }

  const alarmName = event?.AlarmName || event?.detail?.alarmName || 'Unknown';
  const alarmReason = event?.NewStateReason || event?.detail?.reason || 'No reason provided';
  const triggerTime = new Date().toISOString();

  console.log(\`🚨 Emergency restart triggered by alarm: \${alarmName}\`);
  console.log(\`Reason: \${alarmReason}\`);
  console.log(\`Trigger time: \${triggerTime}\`);
  console.log(\`Instance ID: \${instanceId}\`);

  try {
    await stopAndStart(instanceId);
    return {
      statusCode: 200,
      body: JSON.stringify({
        message: \`Emergency restart completed for instance \${instanceId}\`,
        alarmName,
        triggerTime,
        instanceId,
      }),
    };
  } catch (error) {
    console.error(\`❌ Emergency restart failed:\`, error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        message: \`Emergency restart failed\`,
        error: error.message,
        alarmName,
        triggerTime,
        instanceId,
      }),
    };
  }
};
      `),
      handler: 'index.handler',
      role: emergencyRestartLambdaRole,
      timeout: Duration.minutes(20),
      memorySize: 256,
      environment: {
        INSTANCE_ID: instance.instanceId,
        DOMAIN_NAME: domainName,
      },
      description: 'Emergency restart Lambda - automatically restarts instance on critical failures',
    });

    // CloudWatch Alarms for instance health and resource monitoring
    // Instance Status Check Alarm - detects when instance status check fails
    const instanceStatusAlarm = new cw.Alarm(this, 'InstanceStatusCheckAlarm', {
      alarmName: `InstanceStatusCheck-${instance.instanceId}`,
      metric: new cw.Metric({
        namespace: 'AWS/EC2',
        metricName: 'StatusCheckFailed_Instance',
        dimensionsMap: {
          InstanceId: instance.instanceId,
        },
        period: Duration.minutes(1),
        statistic: 'Maximum',
      }),
      threshold: 1,
      evaluationPeriods: 2,
      comparisonOperator: cw.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: cw.TreatMissingData.BREACHING,
      alarmDescription: 'Alerts when EC2 instance status check fails (instance-level issues)',
    });
    instanceStatusAlarm.addAlarmAction(new cwa.SnsAction(alarmsTopic));
    instanceStatusAlarm.addAlarmAction(new cwa.LambdaAction(emergencyRestartLambda)); // Auto-restart on failure

    // System Status Check Alarm - detects when system status check fails
    const systemStatusAlarm = new cw.Alarm(this, 'SystemStatusCheckAlarm', {
      alarmName: `SystemStatusCheck-${instance.instanceId}`,
      metric: new cw.Metric({
        namespace: 'AWS/EC2',
        metricName: 'StatusCheckFailed_System',
        dimensionsMap: {
          InstanceId: instance.instanceId,
        },
        period: Duration.minutes(1),
        statistic: 'Maximum',
      }),
      threshold: 1,
      evaluationPeriods: 2,
      comparisonOperator: cw.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: cw.TreatMissingData.BREACHING,
      alarmDescription: 'Alerts when EC2 system status check fails (AWS infrastructure issues)',
    });
    systemStatusAlarm.addAlarmAction(new cwa.SnsAction(alarmsTopic));
    systemStatusAlarm.addAlarmAction(new cwa.LambdaAction(emergencyRestartLambda)); // Auto-restart on failure

    // OOM Kill Alarm - detects when OOM killer terminates processes
    const oomKillAlarm = new cw.Alarm(this, 'OOMKillAlarm', {
      alarmName: `OOMKillDetected-${instance.instanceId}`,
      metric: new cw.Metric({
        namespace: 'EC2',
        metricName: 'oom_kills',
        period: Duration.minutes(1),
        statistic: 'Sum',
      }),
      threshold: 0,
      evaluationPeriods: 1,
      comparisonOperator: cw.ComparisonOperator.GREATER_THAN_THRESHOLD,
      treatMissingData: cw.TreatMissingData.NOT_BREACHING,
      alarmDescription: 'Alerts when Out-of-Memory killer terminates processes (indicates memory exhaustion)',
    });
    oomKillAlarm.addAlarmAction(new cwa.SnsAction(alarmsTopic));
    oomKillAlarm.addAlarmAction(new cwa.LambdaAction(emergencyRestartLambda)); // Auto-restart on OOM

    // Memory High Alarm - alerts when memory usage exceeds threshold
    const memoryHighAlarm = new cw.Alarm(this, 'MemoryHighAlarm', {
      alarmName: `MemHigh-${instance.instanceId}`,
      metric: new cw.Metric({
        namespace: 'CWAgent',
        metricName: 'mem_used_percent',
        dimensionsMap: {
          InstanceId: instance.instanceId,
        },
        period: Duration.minutes(1),
        statistic: 'Average',
      }),
      threshold: 85, // Alert when memory usage exceeds 85%
      evaluationPeriods: 5, // Require 5 consecutive periods (5 minutes)
      comparisonOperator: cw.ComparisonOperator.GREATER_THAN_THRESHOLD,
      treatMissingData: cw.TreatMissingData.NOT_BREACHING,
      alarmDescription: 'Alerts when memory usage exceeds 85% for 5 consecutive minutes',
    });
    memoryHighAlarm.addAlarmAction(new cwa.SnsAction(alarmsTopic));

    // Swap High Alarm - alerts when swap usage exceeds threshold
    const swapHighAlarm = new cw.Alarm(this, 'SwapHighAlarm', {
      alarmName: `SwapHigh-${instance.instanceId}`,
      metric: new cw.Metric({
        namespace: 'CWAgent',
        metricName: 'swap_used_percent',
        dimensionsMap: {
          InstanceId: instance.instanceId,
        },
        period: Duration.minutes(1),
        statistic: 'Average',
      }),
      threshold: 50, // Alert when swap usage exceeds 50%
      evaluationPeriods: 5, // Require 5 consecutive periods (5 minutes)
      comparisonOperator: cw.ComparisonOperator.GREATER_THAN_THRESHOLD,
      treatMissingData: cw.TreatMissingData.NOT_BREACHING,
      alarmDescription: 'Alerts when swap usage exceeds 50% for 5 consecutive minutes',
    });
    swapHighAlarm.addAlarmAction(new cwa.SnsAction(alarmsTopic));

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