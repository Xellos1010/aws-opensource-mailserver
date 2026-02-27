import * as cdk from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { MailServerObservabilityMaintenanceStack } from '../../stacks/observability-maintenance-stack';

describe('MailServerObservabilityMaintenanceStack', () => {
  let app: cdk.App;
  let stack: MailServerObservabilityMaintenanceStack;
  let template: Template;

  beforeEach(() => {
    app = new cdk.App();
    stack = new MailServerObservabilityMaintenanceStack(app, 'TestObservabilityStack', {
      domain: 'test.example.com',
      coreParamPrefix: '/test/core',
      instanceParamPrefix: '/test/instance',
      env: {
        account: '123456789012',
        region: 'us-east-1',
      },
    });
    template = Template.fromStack(stack);
  });

  it('creates observability resources without provisioning EC2 infrastructure', () => {
    const ec2Instances = template.findResources('AWS::EC2::Instance', {});
    const lambdas = template.findResources('AWS::Lambda::Function', {});
    const eventRules = template.findResources('AWS::Events::Rule', {});

    expect(Object.keys(ec2Instances)).toHaveLength(0);
    expect(Object.keys(lambdas).length).toBeGreaterThan(0);
    expect(Object.keys(eventRules).length).toBeGreaterThan(0);
  });

  it('creates memory and swap alarms in CloudWatch', () => {
    const alarms = Object.values(template.findResources('AWS::CloudWatch::Alarm', {})) as any[];

    expect(alarms.length).toBeGreaterThan(1);
    expect(alarms.some((a) => JSON.stringify(a.Properties?.AlarmName).includes('MemHigh-'))).toBe(true);
    expect(alarms.some((a) => JSON.stringify(a.Properties?.AlarmName).includes('SwapHigh-'))).toBe(true);
  });

  it('creates a nightly reboot EventBridge schedule in observability stack', () => {
    const rules = Object.values(template.findResources('AWS::Events::Rule', {})) as any[];

    const rebootRule = rules.find((rule) =>
      String(rule.Properties?.Description || '').includes('Daily reboot')
    );

    expect(rebootRule).toBeDefined();
    expect(String(rebootRule?.Properties?.ScheduleExpression || '')).toContain('cron(');
  });

  it('exports observability outputs required by admin tooling', () => {
    const outputs = template.findOutputs('*');

    const requiredOutputs = [
      'DomainName',
      'InstanceId',
      'InstanceDnsName',
      'InstanceStackName',
      'MailHealthCheckLambdaArn',
      'RecoveryOrchestratorLambdaArn',
      'RecoverySystemEnabled',
      'SystemStatsLambdaArn',
      'ExternalMonitoringEnabled',
      'NightlyRebootSchedule',
    ];

    requiredOutputs.forEach((name) => {
      expect(outputs).toHaveProperty(name);
      expect(outputs[name]).toHaveProperty('Value');
    });
  });

  it('references core and instance metadata through expected SSM prefixes', () => {
    const templateText = JSON.stringify(template.toJSON());

    expect(templateText).toContain('/test/core/domainName');
    expect(templateText).toContain('/test/core/alarmsTopicArn');
    expect(templateText).toContain('/test/instance/instanceId');
    expect(templateText).toContain('/test/instance/instanceDns');
    expect(templateText).toContain('/test/instance/stackName');
  });
});
