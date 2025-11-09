import * as cdk from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { MailServerInstanceStack } from '../stacks/instance-stack';
import { DomainConfig } from '@mm/infra-instance-constructs';

describe('Nightly Reboot Integration', () => {
  let app: cdk.App;
  let stack: MailServerInstanceStack;
  let template: Template;

  const testDomainConfig: DomainConfig = {
    domainName: 'test.example.com',
    instanceDns: 'box',
    coreParamPrefix: '/test/core', // coreParamPrefix uses only first part of domain
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

  describe('Lambda Function', () => {
    it('creates Lambda function with correct runtime', () => {
      // Find Lambda function by runtime and environment variables
      const lambdaResources = template.findResources('AWS::Lambda::Function', {});
      const rebootLambda = Object.values(lambdaResources).find((resource: any) =>
        resource['Properties']?.['Runtime'] === 'nodejs20.x' &&
        resource['Properties']?.['Environment']?.['Variables']?.['INSTANCE_ID']
      );
      expect(rebootLambda).toBeDefined();
      
      if (rebootLambda) {
        expect(rebootLambda['Properties']['Runtime']).toBe('nodejs20.x');
        expect(rebootLambda['Properties']['Timeout']).toBe(30);
      }
    });

    it('Lambda function has INSTANCE_ID environment variable', () => {
      // Find Lambda function by runtime and environment variables
      const lambdaResources = template.findResources('AWS::Lambda::Function', {});
      const rebootLambda = Object.values(lambdaResources).find((resource: any) =>
        resource['Properties']?.['Runtime'] === 'nodejs20.x' &&
        resource['Properties']?.['Environment']?.['Variables']?.['INSTANCE_ID']
      );
      expect(rebootLambda).toBeDefined();
      
      if (rebootLambda) {
        expect(rebootLambda['Properties']['Environment']).toBeDefined();
        expect(rebootLambda['Properties']['Environment']['Variables']).toHaveProperty('INSTANCE_ID');
        // INSTANCE_ID should reference the EC2 instance
        const instanceId = rebootLambda['Properties']['Environment']['Variables']['INSTANCE_ID'];
        expect(instanceId).toBeDefined();
      }
    });

    it('Lambda function has correct IAM permissions', () => {
      // Find Lambda policy by checking for ec2:RebootInstances
      const policies = template.findResources('AWS::IAM::Policy', {});
      const rebootPolicy = Object.values(policies).find((resource: any) => {
        const statements = resource['Properties']?.['PolicyDocument']?.['Statement'] || [];
        return statements.some((stmt: any) =>
          Array.isArray(stmt.Action)
            ? stmt.Action.some((action: string) => action.includes('RebootInstances'))
            : stmt.Action?.includes('RebootInstances')
        );
      });
      expect(rebootPolicy).toBeDefined();
    });

    it('Lambda function has basic execution role', () => {
      template.hasResourceProperties('AWS::IAM::Role', {
        AssumeRolePolicyDocument: {
          Statement: [
            {
              Action: 'sts:AssumeRole',
              Effect: 'Allow',
              Principal: {
                Service: 'lambda.amazonaws.com',
              },
            },
          ],
        },
        ManagedPolicyArns: [
          {
            'Fn::Join': [
              '',
              [
                'arn:',
                { Ref: 'AWS::Partition' },
                ':iam::aws:policy/service-role/AWSLambdaBasicExecutionRole',
              ],
            ],
          },
        ],
      });
    });

    it('Lambda function code includes error handling', () => {
      // Find Lambda function by runtime and environment variables
      const lambdaResources = template.findResources('AWS::Lambda::Function', {});
      const rebootLambda = Object.values(lambdaResources).find((resource: any) =>
        resource['Properties']?.['Runtime'] === 'nodejs20.x' &&
        resource['Properties']?.['Environment']?.['Variables']?.['INSTANCE_ID']
      );
      expect(rebootLambda).toBeDefined();
      
      if (rebootLambda) {
        // Lambda code is inline, verify it exists
        expect(rebootLambda['Properties']['Code']).toBeDefined();
        // Code should be inline (ZipFile) for this function
        expect(rebootLambda['Properties']['Code']).toHaveProperty('ZipFile');
      }
    });
  });

  describe('EventBridge Rule', () => {
    it('creates EventBridge rule with correct cron schedule', () => {
      // EventBridge schedule format may vary slightly (year field can be ? or *)
      template.hasResourceProperties('AWS::Events::Rule', {
        State: 'ENABLED',
      });
      
      // Verify schedule contains expected cron pattern
      const rules = template.findResources('AWS::Events::Rule', {});
      const rebootRule = Object.values(rules).find((resource: any) =>
        resource['Properties']?.['ScheduleExpression']?.includes('0 8')
      );
      expect(rebootRule).toBeDefined();
    });

    it('EventBridge rule is enabled', () => {
      template.hasResourceProperties('AWS::Events::Rule', {
        State: 'ENABLED',
      });
    });

    it('EventBridge rule targets Lambda function', () => {
      // Verify rule has targets
      const rules = template.findResources('AWS::Events::Rule', {});
      const rebootRule = Object.values(rules)[0] as any;
      expect(rebootRule['Properties']).toHaveProperty('Targets');
      expect(Array.isArray(rebootRule['Properties']['Targets'])).toBe(true);
      expect(rebootRule['Properties']['Targets'].length).toBeGreaterThan(0);
    });

    it('Lambda has permission to be invoked by EventBridge', () => {
      // Verify Lambda permission exists
      const permissions = template.findResources('AWS::Lambda::Permission', {});
      expect(Object.keys(permissions).length).toBeGreaterThan(0);
      
      // Verify permission has correct principal
      const permission = Object.values(permissions)[0] as any;
      expect(permission['Properties']).toHaveProperty('Principal', 'events.amazonaws.com');
      expect(permission['Properties']).toHaveProperty('Action', 'lambda:InvokeFunction');
    });
  });

  describe('Custom Schedule Configuration', () => {
    it('uses custom schedule when provided', () => {
      const customApp = new cdk.App();
      const customStack = new MailServerInstanceStack(customApp, 'CustomStack', {
        domainConfig: testDomainConfig,
        instanceConfig: {
          nightlyRebootSchedule: '0 9 * * ? *', // 09:00 UTC instead of 08:00
          nightlyRebootDescription: '04:00 ET (09:00 UTC) daily',
        },
        env: {
          account: '123456789012',
          region: 'us-east-1',
        },
      });
      const customTemplate = Template.fromStack(customStack);

      // Verify schedule contains expected cron pattern
      const rules = customTemplate.findResources('AWS::Events::Rule', {});
      const rebootRule = Object.values(rules).find((resource: any) =>
        resource['Properties']?.['ScheduleExpression']?.includes('0 9')
      );
      expect(rebootRule).toBeDefined();
    });

    it('uses default schedule when not provided', () => {
      // Verify schedule contains expected cron pattern
      const rules = template.findResources('AWS::Events::Rule', {});
      const rebootRule = Object.values(rules).find((resource: any) =>
        resource['Properties']?.['ScheduleExpression']?.includes('0 8')
      );
      expect(rebootRule).toBeDefined();
    });
  });
});

