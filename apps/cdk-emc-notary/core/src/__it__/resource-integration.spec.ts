import * as cdk from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { EmcNotaryCoreStack } from '../stacks/core-stack';

describe('Core Stack Resource Integration', () => {
  let app: cdk.App;
  let stack: EmcNotaryCoreStack;
  let template: Template;

  beforeEach(() => {
    app = new cdk.App();
    stack = new EmcNotaryCoreStack(app, 'TestStack', {
      env: {
        account: '123456789012',
        region: 'us-east-1',
      },
    });
    template = Template.fromStack(stack);
  });

  describe('Cross-Resource Dependencies', () => {
    it('reverse DNS custom resource uses EIP allocation ID', () => {
      template.hasResourceProperties('AWS::CloudFormation::CustomResource', {
        Properties: {
          AllocationId: {
            'Fn::GetAtt': ['ElasticIP', 'AllocationId'],
          },
          PtrRecord: {
            'Fn::Join': ['', ['box.', { Ref: 'DomainName' }]],
          },
        },
      });
    });

    it('SMTP lambda has correct environment variables', () => {
      template.hasResourceProperties('AWS::Lambda::Function', {
        FunctionName: {
          'Fn::Join': [
            '',
            ['SMTPCredentialsLambdaFunction-', { Ref: 'AWS::StackName' }],
          ],
        },
        Environment: {
          Variables: {
            STACK_NAME: { Ref: 'AWS::StackName' },
            AWS_ACCOUNT_ID: { Ref: 'AWS::AccountId' },
          },
        },
      });
    });

    it('SSM parameters reference correct resource values', () => {
      // Domain name parameter should reference the domain parameter
      template.hasResourceProperties('AWS::SSM::Parameter', {
        Name: '/emcnotary/core/domainName',
        StringValue: { Ref: 'DomainName' },
      });

      // Backup bucket parameter should reference the bucket
      template.hasResourceProperties('AWS::SSM::Parameter', {
        Name: '/emcnotary/core/backupBucket',
        StringValue: { Ref: 'BackupBucket26B8E51C' },
      });

      // Alarms topic parameter should reference the topic ARN
      template.hasResourceProperties('AWS::SSM::Parameter', {
        Name: '/emcnotary/core/alarmsTopicArn',
        StringValue: { Ref: 'AlertTopic2720D535' },
      });
    });

    it('outputs reference correct resource attributes', () => {
      // SES Identity ARN output should reference the identity
      template.hasOutput('SesIdentityArn', {
        Value: {
          'Fn::Join': [
            '',
            [
              'arn:aws:ses:us-east-1:',
              { Ref: 'AWS::AccountId' },
              ':identity/',
              { Ref: 'SesIdentity3ED17C37' },
            ],
          ],
        },
      });

      // Elastic IP allocation ID output should reference the EIP
      template.hasOutput('ElasticIPAllocationId', {
        Value: {
          'Fn::GetAtt': ['ElasticIP', 'AllocationId'],
        },
      });
    });
  });

  describe('Lambda Function Integration', () => {
    it('reverse DNS lambda role has correct trust policy', () => {
      template.hasResourceProperties('AWS::IAM::Role', {
        RoleName: {
          'Fn::Join': [
            '',
            ['ReverseDnsLambdaExecutionRole-', { Ref: 'AWS::StackName' }],
          ],
        },
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
      });
    });

    it('reverse DNS provider framework references lambda function', () => {
      template.hasResourceProperties('AWS::Lambda::Function', {
        Description: {
          'Fn::Join': [
            '',
            [
              'AWS CDK resource provider framework - onEvent (',
              { Ref: 'AWS::StackName' },
              '/ReverseDnsProvider)',
            ],
          ],
        },
        Environment: {
          Variables: {
            USER_ON_EVENT_FUNCTION_ARN: {
              'Fn::GetAtt': ['ReverseDnsLambdaFunction42EDFB93', 'Arn'],
            },
          },
        },
      });
    });
  });

  describe('S3 Bucket Integration', () => {
    it('bucket policies allow auto-delete lambda access', () => {
      template.hasResourceProperties('AWS::S3::BucketPolicy', {
        PolicyDocument: {
          Statement: [
            {
              Action: [
                's3:DeleteObject*',
                's3:GetBucket*',
                's3:List*',
                's3:PutBucketPolicy',
              ],
              Effect: 'Allow',
              Principal: {
                AWS: {
                  'Fn::GetAtt': [
                    'CustomS3AutoDeleteObjectsCustomResourceProviderRole3B1BD092',
                    'Arn',
                  ],
                },
              },
            },
          ],
        },
      });
    });

    it('auto-delete custom resources reference buckets', () => {
      template.hasResourceProperties('Custom::S3AutoDeleteObjects', {
        BucketName: { Ref: 'BackupBucket26B8E51C' },
      });
      template.hasResourceProperties('Custom::S3AutoDeleteObjects', {
        BucketName: { Ref: 'NextcloudBucket8B0187A4' },
      });
    });
  });

  describe('CloudWatch Agent Config Integration', () => {
    it('CW agent config references log group name', () => {
      const cwAgentParam = template.findResources('AWS::SSM::Parameter', {
        ParameterName: {
          'Fn::Join': ['', ['/cwagent-linux-', { Ref: 'AWS::StackName' }]],
        },
      });

      expect(Object.keys(cwAgentParam).length).toBeGreaterThan(0);
      const paramKey = Object.keys(cwAgentParam)[0];
      const paramValue = cwAgentParam[paramKey].Properties.StringValue;

      // The JSON string should contain the log group name
      expect(paramValue).toContain('/ec2/syslog-');
      expect(paramValue).toContain('{Ref::AWS::StackName}');
    });
  });
});

