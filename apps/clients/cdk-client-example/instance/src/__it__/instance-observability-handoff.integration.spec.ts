import * as cdk from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { MailServerInstanceStack } from '../stacks/instance-stack';
import { DomainConfig } from '@mm/infra-instance-constructs';

describe('Instance Observability Handoff Integration', () => {
  let app: cdk.App;
  let stack: MailServerInstanceStack;
  let template: Template;

  const testDomainConfig: DomainConfig = {
    domainName: 'test.example.com',
    instanceDns: 'box',
    coreParamPrefix: '/test/core',
    stackName: 'test-example-com-mailserver-instance',
  };

  beforeEach(() => {
    app = new cdk.App();
    stack = new MailServerInstanceStack(app, 'TestStack', {
      domainConfig: testDomainConfig,
      env: {
        account: '123456789012',
        region: 'us-east-1',
      },
    });
    template = Template.fromStack(stack);
  });

  it('keeps launch-time infra in the instance stack', () => {
    const ec2Instances = template.findResources('AWS::EC2::Instance', {});
    const securityGroups = template.findResources('AWS::EC2::SecurityGroup', {});
    const profiles = template.findResources('AWS::IAM::InstanceProfile', {});

    expect(Object.keys(ec2Instances).length).toBeGreaterThan(0);
    expect(Object.keys(securityGroups).length).toBeGreaterThan(0);
    expect(Object.keys(profiles).length).toBeGreaterThan(0);
  });

  it('does not keep reboot/maintenance automation resources in instance stack', () => {
    const lambdaFunctions = template.findResources('AWS::Lambda::Function', {});
    const eventRules = template.findResources('AWS::Events::Rule', {});

    expect(Object.keys(lambdaFunctions)).toHaveLength(0);
    expect(Object.keys(eventRules)).toHaveLength(0);
  });

  it('publishes SSM metadata parameters used by observability-maintenance stack', () => {
    const params = template.findResources('AWS::SSM::Parameter', {});
    const paramNames = Object.values(params).map(
      (resource: any) => resource['Properties']?.['Name']
    );

    expect(paramNames).toContain('/test/instance/instanceId');
    expect(paramNames).toContain('/test/instance/instanceDns');
    expect(paramNames).toContain('/test/instance/stackName');
  });

  it('exports parameter paths for admin and downstream stack consumers', () => {
    const outputs = template.findOutputs('*');

    expect(outputs).toHaveProperty('InstanceParamInstanceId');
    expect(outputs).toHaveProperty('InstanceParamInstanceDns');
    expect(outputs).toHaveProperty('InstanceParamStackName');
  });
});
