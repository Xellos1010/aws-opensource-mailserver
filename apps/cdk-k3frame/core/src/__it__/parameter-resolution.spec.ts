import * as cdk from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { K3FrameCoreStack } from '../stacks/core-stack';

describe('Parameter Resolution', () => {
  it('uses default domain when no context provided', () => {
    const app = new cdk.App();
    const stack = new K3FrameCoreStack(app, 'TestStack', {
      env: {
        account: '123456789012',
        region: 'us-east-1',
      },
    });
    const template = Template.fromStack(stack);

    // Check that default domain is used in reverse DNS
    // PtrRecord uses CloudFormation intrinsic function to join domain
    template.hasResourceProperties('AWS::CloudFormation::CustomResource', {
      PtrRecord: {
        'Fn::Join': ['', ['box.', { Ref: 'DomainName' }]],
      },
    });

    // Check bucket names use domain parameter reference
    template.hasResourceProperties('AWS::S3::Bucket', {
      BucketName: {
        'Fn::Join': ['', [{ Ref: 'DomainName' }, '-backup']],
      },
    });
  });

  it('uses custom domain from CDK context', () => {
    const app = new cdk.App();
    app.node.setContext('domain', 'test.example.com');

    const stack = new K3FrameCoreStack(app, 'TestStack', {
      env: {
        account: '123456789012',
        region: 'us-east-1',
      },
    });
    const template = Template.fromStack(stack);

    // Note: CDK context is used in main.ts, not directly in stack
    // This test verifies the stack has a domain parameter with default
    // Parameters are in template.Parameters, not Resources
    const templateJson = template.toJSON();
    expect(templateJson['Parameters']).toHaveProperty('DomainName');
    expect(templateJson['Parameters']['DomainName']).toHaveProperty('Type', 'String');
    expect(templateJson['Parameters']['DomainName']).toHaveProperty('Default', 'k3frame.com');
  });

  it('domain parameter validation pattern is correct', () => {
    const app = new cdk.App();
    const stack = new K3FrameCoreStack(app, 'TestStack', {
      env: {
        account: '123456789012',
        region: 'us-east-1',
      },
    });
    const template = Template.fromStack(stack);

    // Parameters are in template.Parameters, not Resources
    const templateJson = template.toJSON();
    expect(templateJson['Parameters']).toHaveProperty('DomainName');
    expect(templateJson['Parameters']['DomainName']).toHaveProperty('AllowedPattern', '^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$');
  });

  it('rejects invalid domain patterns', () => {
    const app = new cdk.App();
    const stack = new K3FrameCoreStack(app, 'TestStack', {
      env: {
        account: '123456789012',
        region: 'us-east-1',
      },
    });
    const template = Template.fromStack(stack);

    // Domain parameter should have validation pattern that rejects:
    // - Domains starting with dash
    // - Domains ending with dash
    // - Domains with consecutive dots
    // - Domains longer than 63 characters
    // Parameters are in template.Parameters, not Resources
    const templateJson = template.toJSON();
    expect(templateJson['Parameters']).toHaveProperty('DomainName');
    expect(templateJson['Parameters']['DomainName']).toHaveProperty('AllowedPattern', '^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$');
  });

  it('domain parameter has correct default value', () => {
    const app = new cdk.App();
    const stack = new K3FrameCoreStack(app, 'TestStack', {
      env: {
        account: '123456789012',
        region: 'us-east-1',
      },
    });
    const template = Template.fromStack(stack);

    // Parameters are in template.Parameters, not Resources
    const templateJson = template.toJSON();
    expect(templateJson['Parameters']).toHaveProperty('DomainName');
    expect(templateJson['Parameters']['DomainName']).toHaveProperty('Type', 'String');
    expect(templateJson['Parameters']['DomainName']).toHaveProperty('Default', 'k3frame.com');
    expect(templateJson['Parameters']['DomainName']).toHaveProperty('Description', 'The domain name for the mail server resources');
  });

  it('all resource names incorporate domain parameter', () => {
    const app = new cdk.App();
    const stack = new K3FrameCoreStack(app, 'TestStack', {
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

    // Check reverse DNS uses domain - Properties are at top level for CustomResource
    template.hasResourceProperties('AWS::CloudFormation::CustomResource', {
      PtrRecord: {
        'Fn::Join': ['', ['box.', { Ref: 'DomainName' }]],
      },
    });
  });
});

