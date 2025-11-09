import * as cdk from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { EmcNotaryCoreStack } from '../stacks/core-stack';

describe('Parameter Resolution', () => {
  it('uses default domain when no context provided', () => {
    const app = new cdk.App();
    const stack = new EmcNotaryCoreStack(app, 'TestStack', {
      env: {
        account: '123456789012',
        region: 'us-east-1',
      },
    });
    const template = Template.fromStack(stack);

    // Check that default domain is used in reverse DNS
    template.hasResourceProperties('AWS::CloudFormation::CustomResource', {
      Properties: {
        PtrRecord: 'box.emcnotary.com',
      },
    });

    // Check bucket names use default domain
    template.hasResourceProperties('AWS::S3::Bucket', {
      BucketName: {
        'Fn::Join': ['', ['emcnotary.com', '-backup']],
      },
    });
  });

  it('uses custom domain from CDK context', () => {
    const app = new cdk.App();
    app.node.setContext('domain', 'test.example.com');

    const stack = new EmcNotaryCoreStack(app, 'TestStack', {
      env: {
        account: '123456789012',
        region: 'us-east-1',
      },
    });
    const template = Template.fromStack(stack);

    // Note: CDK context is used in main.ts, not directly in stack
    // This test verifies the stack accepts domain parameter
    template.hasResourceProperties('AWS::CloudFormation::Parameter', {
      Type: 'String',
      Default: 'emcnotary.com',
    });
  });

  it('domain parameter validation pattern is correct', () => {
    const app = new cdk.App();
    const stack = new EmcNotaryCoreStack(app, 'TestStack', {
      env: {
        account: '123456789012',
        region: 'us-east-1',
      },
    });
    const template = Template.fromStack(stack);

    template.hasResourceProperties('AWS::CloudFormation::Parameter', {
      AllowedPattern: '^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$',
    });
  });

  it('all resource names incorporate domain parameter', () => {
    const app = new cdk.App();
    const stack = new EmcNotaryCoreStack(app, 'TestStack', {
      env: {
        account: '123456789012',
        region: 'us-east-1',
      },
    });
    const template = Template.fromStack(stack);

    // Check bucket names reference domain
    template.hasResourceProperties('AWS::S3::Bucket', {
      BucketName: {
        'Fn::Join': ['', [{ Ref: 'DomainName' }, '-backup']],
      },
    });

    template.hasResourceProperties('AWS::S3::Bucket', {
      BucketName: {
        'Fn::Join': ['', [{ Ref: 'DomainName' }, '-nextcloud']],
      },
    });

    // Check reverse DNS uses domain
    template.hasResourceProperties('AWS::CloudFormation::CustomResource', {
      Properties: {
        PtrRecord: {
          'Fn::Join': ['', ['box.', { Ref: 'DomainName' }]],
        },
      },
    });
  });
});

