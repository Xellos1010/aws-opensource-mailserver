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
      // CustomResource Properties are at top level, not nested under Properties
      template.hasResourceProperties('AWS::CloudFormation::CustomResource', {
        AllocationId: {
          'Fn::GetAtt': ['ElasticIP', 'AllocationId'],
        },
        PtrRecord: {
          'Fn::Join': ['', ['box.', { Ref: 'DomainName' }]],
        },
      });
    });

    it('SMTP lambda has correct environment variables', () => {
      // Find SMTP lambda by searching all Lambda functions
      const lambdaResources = template.findResources('AWS::Lambda::Function', {});
      const smtpLambda = Object.values(lambdaResources).find((resource: any) =>
        resource['Properties']?.['FunctionName']?.includes('SMTPCredentialsLambdaFunction')
      );
      expect(smtpLambda).toBeDefined();
      
      // Verify environment variables
      if (smtpLambda) {
        expect(smtpLambda['Properties']['Environment']).toBeDefined();
        expect(smtpLambda['Properties']['Environment']['Variables']).toHaveProperty('STACK_NAME');
        expect(smtpLambda['Properties']['Environment']['Variables']).toHaveProperty('AWS_ACCOUNT_ID');
      }
    });

    it('SSM parameters reference correct resource values', () => {
      // Domain name parameter should reference the domain parameter
      const ssmParams = template.findResources('AWS::SSM::Parameter', {});
      
      // Find domain name parameter
      const domainParam = Object.values(ssmParams).find((resource: any) =>
        resource['Properties']?.['Name'] === '/emcnotary/core/domainName'
      );
      expect(domainParam).toBeDefined();
      if (domainParam) {
        expect(domainParam['Properties']['Value']).toEqual({ Ref: 'DomainName' });
      }

      // Find backup bucket parameter
      const backupBucketParam = Object.values(ssmParams).find((resource: any) =>
        resource['Properties']?.['Name'] === '/emcnotary/core/backupBucket'
      );
      expect(backupBucketParam).toBeDefined();
      if (backupBucketParam) {
        expect(backupBucketParam['Properties']['Value']).toEqual({ Ref: 'BackupBucket26B8E51C' });
      }

      // Find alarms topic parameter
      const alarmsTopicParam = Object.values(ssmParams).find((resource: any) =>
        resource['Properties']?.['Name'] === '/emcnotary/core/alarmsTopicArn'
      );
      expect(alarmsTopicParam).toBeDefined();
      if (alarmsTopicParam) {
        expect(alarmsTopicParam['Properties']['Value']).toEqual({ Ref: 'AlertTopic2720D535' });
      }
    });

    it('outputs reference correct resource attributes', () => {
      // SES Identity ARN output should reference the identity
      // Just verify the output exists and references the SES identity
      const outputs = template.findOutputs('*');
      expect(outputs).toHaveProperty('SesIdentityArn');
      const sesOutput = outputs['SesIdentityArn'];
      expect(sesOutput['Value']).toBeDefined();
      // The value should be a Join that includes the identity reference
      const value = sesOutput['Value'];
      if (value && typeof value === 'object' && 'Fn::Join' in value) {
        const joinParts = value['Fn::Join'][1];
        const hasIdentityRef = joinParts.some((part: any) =>
          typeof part === 'object' && part['Ref'] === 'SesIdentity3ED17C37'
        );
        expect(hasIdentityRef).toBe(true);
      }

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
      // RoleName is a string, not a CloudFormation intrinsic function
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
      });
      
      // Verify role name contains expected pattern
      const roles = template.findResources('AWS::IAM::Role', {});
      const reverseDnsRole = Object.values(roles).find((resource: any) =>
        resource['Properties']?.['RoleName']?.includes('ReverseDnsLambdaExecutionRole')
      );
      expect(reverseDnsRole).toBeDefined();
    });

    it('reverse DNS provider framework references lambda function', () => {
      // Find provider framework lambda
      const lambdaResources = template.findResources('AWS::Lambda::Function', {});
      const providerLambda = Object.values(lambdaResources).find((resource: any) =>
        resource['Properties']?.['Description']?.includes('ReverseDnsProvider')
      );
      expect(providerLambda).toBeDefined();
      
      // Verify it references the user lambda function
      if (providerLambda) {
        expect(providerLambda['Properties']['Environment']).toBeDefined();
        expect(providerLambda['Properties']['Environment']['Variables']).toHaveProperty('USER_ON_EVENT_FUNCTION_ARN');
      }
    });
  });

  describe('S3 Bucket Integration', () => {
    it('bucket policies allow auto-delete lambda access', () => {
      // The bucket policy allows the auto-delete lambda to delete objects
      // Check that there's a bucket policy with delete permissions
      const bucketPolicies = template.findResources('AWS::S3::BucketPolicy', {});
      const hasDeletePolicy = Object.values(bucketPolicies).some((policy: any) => {
        const statements = policy['Properties']?.['PolicyDocument']?.['Statement'] || [];
        return statements.some((stmt: any) =>
          Array.isArray(stmt['Action']) 
            ? stmt['Action'].some((action: string) => action.includes('DeleteObject'))
            : stmt['Action']?.includes('DeleteObject')
        );
      });
      expect(hasDeletePolicy).toBe(true);
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
      // Find CW agent config parameter by searching all SSM parameters
      const ssmParams = template.findResources('AWS::SSM::Parameter', {});
      const cwAgentParam = Object.values(ssmParams).find((resource: any) =>
        resource['Properties']?.['Name']?.includes('/cwagent-linux-')
      );

      expect(cwAgentParam).toBeDefined();
      if (cwAgentParam) {
        const paramValue = cwAgentParam['Properties']['Value'];

        // The JSON string should contain the log group name
        expect(paramValue).toContain('/ec2/syslog-');
      }
    });
  });
});

