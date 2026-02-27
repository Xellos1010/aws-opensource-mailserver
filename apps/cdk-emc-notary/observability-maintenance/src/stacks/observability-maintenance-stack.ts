import {
  Stack,
  StackProps,
  CfnOutput,
  aws_ssm as ssm,
} from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { tagStack } from '@mm/infra-shared-constructs';
import { MailserverObservabilityMaintenance } from '@mm/infra-mailserver-recovery';

export interface MailServerObservabilityMaintenanceStackProps extends StackProps {
  domain: string;
  coreParamPrefix: string;
  instanceParamPrefix: string;
}

export class MailServerObservabilityMaintenanceStack extends Stack {
  constructor(scope: Construct, id: string, props: MailServerObservabilityMaintenanceStackProps) {
    super(scope, id, props);
    const { domain, coreParamPrefix, instanceParamPrefix } = props;

    tagStack(this, `${domain}-mailserver-observability-maintenance`);

    const domainName = ssm.StringParameter.fromStringParameterAttributes(
      this,
      'CoreDomainName',
      { parameterName: `${coreParamPrefix}/domainName` }
    ).stringValue;

    const alarmsTopicArn = ssm.StringParameter.fromStringParameterAttributes(
      this,
      'CoreAlarmsTopic',
      { parameterName: `${coreParamPrefix}/alarmsTopicArn` }
    ).stringValue;

    const instanceId = ssm.StringParameter.fromStringParameterAttributes(
      this,
      'InstanceMetadataId',
      { parameterName: `${instanceParamPrefix}/instanceId` }
    ).stringValue;

    const instanceDns = ssm.StringParameter.fromStringParameterAttributes(
      this,
      'InstanceMetadataDns',
      { parameterName: `${instanceParamPrefix}/instanceDns` }
    ).stringValue;

    const instanceStackName = ssm.StringParameter.fromStringParameterAttributes(
      this,
      'InstanceMetadataStackName',
      { parameterName: `${instanceParamPrefix}/stackName` }
    ).stringValue;

    const observability = new MailserverObservabilityMaintenance(
      this,
      'MailserverObservabilityMaintenance',
      {
        domainName,
        instanceId,
        instanceDns,
        instanceStackName,
        alarmsTopicArn,
        alarmNamePrefix: this.stackName,
      }
    );

    new CfnOutput(this, 'DomainName', {
      value: domainName,
      description: 'The domain name',
    });

    new CfnOutput(this, 'InstanceId', {
      value: instanceId,
      description: 'The EC2 instance ID being monitored',
    });

    new CfnOutput(this, 'InstanceDnsName', {
      value: instanceDns,
      description: 'The instance DNS label being monitored',
    });

    new CfnOutput(this, 'InstanceStackName', {
      value: instanceStackName,
      description: 'The instance stack name used by recovery lambdas',
    });

    new CfnOutput(this, 'MailHealthCheckLambdaArn', {
      value: observability.mailHealthCheck.lambda.functionArn,
      description: 'ARN of the mail health check Lambda function',
    });

    new CfnOutput(this, 'RecoveryOrchestratorLambdaArn', {
      value: observability.recoveryOrchestrator.lambda.functionArn,
      description: 'ARN of the recovery orchestrator Lambda function',
    });

    new CfnOutput(this, 'RecoverySystemEnabled', {
      value: 'true',
      description: 'Recovery system is enabled with progressive recovery flow',
    });

    new CfnOutput(this, 'SystemStatsLambdaArn', {
      value: observability.systemStats.lambda.functionArn,
      description: 'ARN of the system statistics Lambda function',
    });

    new CfnOutput(this, 'ExternalMonitoringEnabled', {
      value: observability.externalMonitoring ? 'true' : 'false',
      description: 'External monitoring enabled state',
    });

    new CfnOutput(this, 'NightlyRebootSchedule', {
      value: '03:00 ET (08:00 UTC) daily',
      description: 'Schedule for automatic nightly reboot of Mail-in-a-Box instance',
    });
  }
}

// Export for backward compatibility
export class EmcNotaryObservabilityMaintenanceStack extends MailServerObservabilityMaintenanceStack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, {
      ...props,
      domain: 'emcnotary.com',
      coreParamPrefix: '/emcnotary/core',
      instanceParamPrefix: '/emcnotary/instance',
    });
  }
}
