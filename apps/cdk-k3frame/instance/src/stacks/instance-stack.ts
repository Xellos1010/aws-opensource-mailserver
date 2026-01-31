import {
  Stack,
  StackProps,
  CfnOutput,
  CfnParameter,
  Tags,
  Duration,
  RemovalPolicy,
  aws_ec2 as ec2,
  aws_ssm as ssm,
  aws_cloudwatch as cw,
  aws_cloudwatch_actions as cwa,
  aws_sns as sns,
  aws_lambda as lambda,
  aws_iam as iam,
  aws_logs as logs,
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
import {
  MailHealthCheckLambda,
  ServiceRestartLambda,
  SystemResetLambda,
  StopStartHelperLambda,
  RecoveryOrchestratorLambda,
  EmergencyAlarms,
  SystemStatsLambda,
  ExternalMonitoring,
} from '@mm/infra-mailserver-recovery';

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

    // ============================================================================
    // Mailserver Recovery System (ported from k3frame)
    // Provides progressive recovery: Health Check → System Reset → Service Restart → Instance Restart
    // Recovery time: 30-90 seconds for most failures (vs 5-10 minutes)
    // ============================================================================

    // Mail Health Check Lambda - Scheduled health checks via EventBridge
    const mailHealthCheck = new MailHealthCheckLambda(this, 'MailHealthCheck', {
      instanceId: instance.instanceId,
      domainName,
      scheduleExpression: 'rate(5 minutes)',
      notificationTopic: alarmsTopic,
    });

    // Service Restart Lambda - Restarts mail services without instance reboot
    const serviceRestart = new ServiceRestartLambda(this, 'ServiceRestart', {
      instanceId: instance.instanceId,
      domainName,
    });

    // System Reset Lambda - Comprehensive recovery without instance reboot
    const systemReset = new SystemResetLambda(this, 'SystemReset', {
      instanceId: instance.instanceId,
      domainName,
    });

    // Stop/Start Helper Lambda - Smart instance restart (last resort)
    const stopStartHelper = new StopStartHelperLambda(this, 'StopStartHelper', {
      mailServerStackName: this.stackName,
      domainName,
      mailHealthCheckLambdaName: mailHealthCheck.lambda.functionName,
      serviceRestartLambdaName: serviceRestart.lambda.functionName,
      scheduleExpression: 'cron(0 8 * * ? *)', // Daily at 3am EST (8am UTC)
      maintenanceWindowStartHour: 8,
      maintenanceWindowEndHour: 8.25,
    });

    // Recovery Orchestrator Lambda - Orchestrates progressive recovery flow
    const recoveryOrchestrator = new RecoveryOrchestratorLambda(this, 'RecoveryOrchestrator', {
      mailHealthCheckLambdaArn: mailHealthCheck.lambda.functionArn,
      systemResetLambdaArn: systemReset.lambda.functionArn,
      serviceRestartLambdaArn: serviceRestart.lambda.functionArn,
      stopStartLambdaArn: stopStartHelper.lambda.functionArn,
      domainName,
    });

    // Emergency Alarms - CloudWatch alarms wired to recovery orchestrator
    const emergencyAlarms = new EmergencyAlarms(this, 'EmergencyAlarms', {
      instanceId: instance.instanceId,
      recoveryOrchestratorLambda: recoveryOrchestrator.lambda,
      notificationTopic: alarmsTopic,
      domainName,
    });

    // System Stats Lambda - Comprehensive system statistics for operational monitoring
    const systemStats = new SystemStatsLambda(this, 'SystemStats', {
      instanceId: instance.instanceId,
      domainName,
      scheduleExpression: 'rate(1 hour)', // Collect stats hourly
    });

    // External Monitoring - Route 53 health checks + proactive health check
    // Use instanceDns parameter value (which handles tokens properly)
    const externalMonitoring = new ExternalMonitoring(this, 'ExternalMonitoring', {
      instanceId: instance.instanceId,
      domainName,
      boxHostname: `${instanceDns.valueAsString}.${domainName}`,
      emergencyRestartLambdaArn: recoveryOrchestrator.lambda.functionArn,
      notificationTopic: alarmsTopic,
      healthCheckIntervalSeconds: 30,
    });

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

    // Recovery System Outputs
    new CfnOutput(this, 'MailHealthCheckLambdaArn', {
      value: mailHealthCheck.lambda.functionArn,
      description: 'ARN of the mail health check Lambda function',
    });

    new CfnOutput(this, 'RecoveryOrchestratorLambdaArn', {
      value: recoveryOrchestrator.lambda.functionArn,
      description: 'ARN of the recovery orchestrator Lambda function',
    });

    new CfnOutput(this, 'RecoverySystemEnabled', {
      value: 'true',
      description: 'Recovery system is enabled with progressive recovery flow',
    });

    new CfnOutput(this, 'SystemStatsLambdaArn', {
      value: systemStats.lambda.functionArn,
      description: 'ARN of the system statistics Lambda function',
    });

    new CfnOutput(this, 'ExternalMonitoringEnabled', {
      value: 'true',
      description: 'External monitoring enabled with Route 53 health checks and proactive checks',
    });
  }
}

// Export for backward compatibility
export class k3frameInstanceStack extends MailServerInstanceStack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, {
      ...props,
      domainConfig: {
        domainName: 'k3frame.com',
        instanceDns: 'box',
        coreParamPrefix: '/k3frame/core',
        stackName: id,
      },
    });
  }
}