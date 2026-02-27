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

  it('creates memory, swap, and proactive health alarms in CloudWatch', () => {
    const alarms = Object.values(template.findResources('AWS::CloudWatch::Alarm', {})) as any[];

    expect(alarms.length).toBeGreaterThan(3);
    expect(alarms.some((a) => JSON.stringify(a.Properties?.AlarmName).includes('MemHigh-'))).toBe(true);
    expect(alarms.some((a) => JSON.stringify(a.Properties?.AlarmName).includes('SwapHigh-'))).toBe(true);
    expect(alarms.some((a) => JSON.stringify(a.Properties?.AlarmName).includes('AdminEndpointUnhealthy-'))).toBe(true);
    expect(alarms.some((a) => JSON.stringify(a.Properties?.AlarmName).includes('DiskUsageCritical-'))).toBe(true);
    expect(alarms.some((a) => JSON.stringify(a.Properties?.AlarmName).includes('MailPrimaryUnhealthy-'))).toBe(true);
  });

  it('creates a daily non-critical cleanup schedule and disables scheduled stop-start', () => {
    const rules = Object.values(template.findResources('AWS::Events::Rule', {})) as any[];

    const cleanupRule = rules.find((rule) =>
      String(rule.Properties?.Description || '').includes('non-critical cleanup')
    );
    const stopStartRule = rules.find((rule) =>
      String(rule.Properties?.Description || '').includes('stop-and-start')
    );

    expect(cleanupRule).toBeDefined();
    expect(String(cleanupRule?.Properties?.ScheduleExpression || '')).toContain('cron(');
    expect(stopStartRule).toBeUndefined();
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
      'DailyCleanupSchedule',
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
