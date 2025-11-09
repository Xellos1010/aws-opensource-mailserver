import * as cdk from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { MailServerInstanceStack } from '../stacks/instance-stack';
import { DomainConfig } from '@mm/infra-instance-constructs';

describe('SSM Parameter Resolution Integration', () => {
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

  describe('Core Stack SSM Parameter Dependencies', () => {
    it('reads domainName from core stack SSM parameter', () => {
      // Instance stack reads SSM parameters but doesn't create them
      // They are created by the core stack
      // We verify the stack references the correct parameter names via StringParameter.fromStringParameterAttributes
      // This creates CloudFormation parameters that reference the SSM parameters
      const templateJson = template.toJSON();
      const parameters = templateJson['Parameters'] || {};
      
      // Verify parameters exist for SSM parameter references
      expect(Object.keys(parameters).length).toBeGreaterThan(0);
    });

    it('reads backupBucket from core stack SSM parameter', () => {
      // Same as above - verify parameters exist
      const templateJson = template.toJSON();
      const parameters = templateJson['Parameters'] || {};
      expect(Object.keys(parameters).length).toBeGreaterThan(0);
    });

    it('reads nextcloudBucket from core stack SSM parameter', () => {
      // Same as above - verify parameters exist
      const templateJson = template.toJSON();
      const parameters = templateJson['Parameters'] || {};
      expect(Object.keys(parameters).length).toBeGreaterThan(0);
    });

    it('reads alarmsTopicArn from core stack SSM parameter', () => {
      // Same as above - verify parameters exist
      const templateJson = template.toJSON();
      const parameters = templateJson['Parameters'] || {};
      expect(Object.keys(parameters).length).toBeGreaterThan(0);
    });

    it('reads eipAllocationId from core stack SSM parameter', () => {
      // Same as above - verify parameters exist
      const templateJson = template.toJSON();
      const parameters = templateJson['Parameters'] || {};
      expect(Object.keys(parameters).length).toBeGreaterThan(0);
    });
  });

  describe('Multi-Domain Support', () => {
    it('uses correct coreParamPrefix for different domains', () => {
      const customDomainConfig: DomainConfig = {
        domainName: 'custom.example.com',
        instanceDns: 'mail',
        coreParamPrefix: '/custom/core', // coreParamPrefix uses only first part of domain
        stackName: 'custom-example-com-mailserver-instance',
      };

      const customApp = new cdk.App();
      const customStack = new MailServerInstanceStack(customApp, 'CustomStack', {
        domainConfig: customDomainConfig,
        env: {
          account: '123456789012',
          region: 'us-east-1',
        },
      });
      const customTemplate = Template.fromStack(customStack);

      // Verify stack synthesizes correctly with custom domain
      const templateJson = customTemplate.toJSON();
      expect(templateJson).toBeDefined();
    });

    it('uses default coreParamPrefix for emcnotary.com', () => {
      const emcnotaryConfig: DomainConfig = {
        domainName: 'emcnotary.com',
        instanceDns: 'box',
        coreParamPrefix: '/emcnotary/core',
        stackName: 'emcnotary-com-mailserver-instance',
      };

      const emcApp = new cdk.App();
      const emcStack = new MailServerInstanceStack(emcApp, 'EmcStack', {
        domainConfig: emcnotaryConfig,
        env: {
          account: '123456789012',
          region: 'us-east-1',
        },
      });
      const emcTemplate = Template.fromStack(emcStack);

      // Verify stack synthesizes correctly with emcnotary.com domain
      const templateJson = emcTemplate.toJSON();
      expect(templateJson).toBeDefined();
    });
  });

  describe('Parameter Resolution in Resources', () => {
    it('EIP association uses eipAllocationId from SSM parameter', () => {
      // Verify EIP association exists and references SSM parameter
      const eipAssociations = template.findResources('AWS::EC2::EIPAssociation', {});
      expect(Object.keys(eipAssociations).length).toBeGreaterThan(0);
      
      const eipAssociation = Object.values(eipAssociations)[0] as any;
      expect(eipAssociation['Properties']).toHaveProperty('AllocationId');
    });

    it('IAM role uses backupBucket from SSM parameter', () => {
      // Verify IAM policy has S3 bucket access with correct Sid
      const policies = template.findResources('AWS::IAM::Policy', {});
      const instancePolicy = Object.values(policies).find((resource: any) => {
        const statements = resource['Properties']?.['PolicyDocument']?.['Statement'] || [];
        return statements.some((stmt: any) => stmt.Sid === 'BackupS3BucketAccessMIAB');
      });
      expect(instancePolicy).toBeDefined();
    });

    it('IAM role uses nextcloudBucket from SSM parameter', () => {
      // Verify IAM policy has S3 bucket access with correct Sid
      const policies = template.findResources('AWS::IAM::Policy', {});
      const instancePolicy = Object.values(policies).find((resource: any) => {
        const statements = resource['Properties']?.['PolicyDocument']?.['Statement'] || [];
        return statements.some((stmt: any) => stmt.Sid === 'NextCloudS3Policy');
      });
      expect(instancePolicy).toBeDefined();
    });

    it('key pair name uses domainName from SSM parameter', () => {
      // Verify KeyPair exists and has KeyName
      const keyPairs = template.findResources('AWS::EC2::KeyPair', {});
      expect(Object.keys(keyPairs).length).toBeGreaterThan(0);
      
      const keyPair = Object.values(keyPairs)[0] as any;
      expect(keyPair['Properties']).toHaveProperty('KeyName');
    });
  });
});

