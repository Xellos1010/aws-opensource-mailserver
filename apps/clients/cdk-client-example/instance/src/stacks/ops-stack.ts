import {
  Stack,
  StackProps,
  aws_ssm as ssm,
} from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { MailserverObservabilityMaintenance } from '@mm/infra-mailserver-recovery';
import { DomainConfig } from '@mm/infra-instance-constructs';
import { instanceParamPrefix } from '@mm/infra-naming';
import { tagStack } from '@mm/infra-shared-constructs';

export interface MailServerOpsStackProps extends StackProps {
  /** Domain configuration — must match the deployed instance stack */
  domainConfig: DomainConfig;
}

/**
 * Mailserver Ops Stack — Lambdas, alarms, and maintenance constructs.
 *
 * Deliberately separated from the instance stack so that operational changes
 * (hardening, scheduling, alarm tuning) can be deployed without replacing the
 * EC2 instance or its data.
 *
 * Reads instance metadata from SSM parameters published by the instance stack:
 *   /{domain}/instance/instanceId
 *   /{domain}/instance/instanceDns
 *   /{domain}/instance/stackName
 *
 * Reads shared core params:
 *   /{domain}/core/domainName
 *   /{domain}/core/alarmsTopicArn
 */
export class MailServerOpsStack extends Stack {
  constructor(scope: Construct, id: string, props: MailServerOpsStackProps) {
    super(scope, id, props);
    const { domainConfig } = props;

    tagStack(this, `${domainConfig.domainName}-mailserver-ops`);

    const instPrefix = instanceParamPrefix(domainConfig.domainName);

    // Instance metadata written by the instance stack
    const instanceId = ssm.StringParameter.fromStringParameterAttributes(
      this,
      'InstanceId',
      { parameterName: `${instPrefix}/instanceId` }
    ).stringValue;

    const instanceDns = ssm.StringParameter.fromStringParameterAttributes(
      this,
      'InstanceDns',
      { parameterName: `${instPrefix}/instanceDns` }
    ).stringValue;

    const instanceStackName = ssm.StringParameter.fromStringParameterAttributes(
      this,
      'InstanceStackName',
      { parameterName: `${instPrefix}/stackName` }
    ).stringValue;

    // Core params (written by the core stack)
    const domainName = ssm.StringParameter.fromStringParameterAttributes(
      this,
      'CoreDomainName',
      { parameterName: `${domainConfig.coreParamPrefix}/domainName` }
    ).stringValue;

    const alarmsTopicArn = ssm.StringParameter.fromStringParameterAttributes(
      this,
      'CoreAlarmsTopic',
      { parameterName: `${domainConfig.coreParamPrefix}/alarmsTopicArn` }
    ).stringValue;

    new MailserverObservabilityMaintenance(this, 'ObsMaintenance', {
      domainName,
      instanceId,
      instanceDns,
      instanceStackName,
      alarmsTopicArn,
    });
  }
}
