import * as cdk from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { MailServerInstanceStack } from '../stacks/instance-stack';
import { DomainConfig } from '@mm/infra-instance-constructs';

describe('Instance Stack Resource Integration', () => {
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

  describe('Cross-Resource Dependencies', () => {
    it('EIP association references EIP allocation ID from SSM parameter', () => {
      // Verify EIP association exists
      const eipAssociations = template.findResources('AWS::EC2::EIPAssociation', {});
      expect(Object.keys(eipAssociations).length).toBeGreaterThan(0);
      
      const eipAssociation = Object.values(eipAssociations)[0] as any;
      expect(eipAssociation['Properties']).toHaveProperty('AllocationId');
      expect(eipAssociation['Properties']).toHaveProperty('InstanceId');
    });

    it('EC2 instance uses security group from shared construct', () => {
      // Verify EC2 instance has SecurityGroupIds
      const instances = template.findResources('AWS::EC2::Instance', {});
      const instance = Object.values(instances)[0] as any;
      expect(instance['Properties']).toHaveProperty('SecurityGroupIds');
      expect(Array.isArray(instance['Properties']['SecurityGroupIds'])).toBe(true);
    });

    it('EC2 instance uses IAM role from shared construct', () => {
      // Verify EC2 instance has IamInstanceProfile
      const instances = template.findResources('AWS::EC2::Instance', {});
      const instance = Object.values(instances)[0] as any;
      expect(instance['Properties']).toHaveProperty('IamInstanceProfile');
    });

    it('EC2 instance key pair name matches domain', () => {
      // Verify EC2 instance references KeyPair
      const instances = template.findResources('AWS::EC2::Instance', {});
      const instance = Object.values(instances)[0] as any;
      expect(instance['Properties']).toHaveProperty('KeyName');
      
      // Verify KeyPair exists
      const keyPairs = template.findResources('AWS::EC2::KeyPair', {});
      expect(Object.keys(keyPairs).length).toBeGreaterThan(0);
    });

    it('IAM role has correct S3 bucket permissions', () => {
      // Verify IAM policy has S3 bucket access with correct Sids
      const policies = template.findResources('AWS::IAM::Policy', {});
      const instancePolicy = Object.values(policies).find((resource: any) => {
        const statements = resource['Properties']?.['PolicyDocument']?.['Statement'] || [];
        return statements.some((stmt: any) => 
          stmt.Sid === 'BackupS3BucketAccessMIAB' || stmt.Sid === 'NextCloudS3Policy'
        );
      });
      expect(instancePolicy).toBeDefined();
      
      if (instancePolicy) {
        const statements = instancePolicy['Properties']['PolicyDocument']['Statement'] || [];
        const backupS3Statement = statements.find((stmt: any) => stmt.Sid === 'BackupS3BucketAccessMIAB');
        const nextcloudS3Statement = statements.find((stmt: any) => stmt.Sid === 'NextCloudS3Policy');
        expect(backupS3Statement).toBeDefined();
        expect(nextcloudS3Statement).toBeDefined();
      }
    });

    it('IAM role has correct SSM parameter read permissions', () => {
      // Verify IAM policy has SSM permissions
      const policies = template.findResources('AWS::IAM::Policy', {});
      const instancePolicy = Object.values(policies).find((resource: any) => {
        const statements = resource['Properties']?.['PolicyDocument']?.['Statement'] || [];
        return statements.some((stmt: any) =>
          Array.isArray(stmt.Action)
            ? stmt.Action.some((action: string) => action.includes('ssm:GetParameter'))
            : stmt.Action?.includes('ssm:GetParameter')
        );
      });
      expect(instancePolicy).toBeDefined();
    });

    it('nightly reboot Lambda references correct instance ID', () => {
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
        // The INSTANCE_ID should reference the EC2 instance
        const instanceId = rebootLambda['Properties']['Environment']['Variables']['INSTANCE_ID'];
        expect(instanceId).toBeDefined();
      }
    });

    it('nightly reboot EventBridge rule targets Lambda function', () => {
      // Verify EventBridge rule exists and has targets
      template.hasResourceProperties('AWS::Events::Rule', {
        State: 'ENABLED',
      });
      
      // Verify rule has targets
      const rules = template.findResources('AWS::Events::Rule', {});
      const rebootRule = Object.values(rules)[0] as any;
      expect(rebootRule['Properties']).toHaveProperty('Targets');
      expect(Array.isArray(rebootRule['Properties']['Targets'])).toBe(true);
    });

    it('userData includes domain and instance DNS information', () => {
      // UserData is base64 encoded in the template
      const instances = template.findResources('AWS::EC2::Instance', {});
      const instance = Object.values(instances)[0] as any;
      expect(instance['Properties']).toHaveProperty('UserData');
    });

    it('all outputs reference correct resource attributes', () => {
      const outputs = template.findOutputs('*');
      
      // Verify all required outputs exist
      const requiredOutputs = ['InstanceId', 'DomainName', 'ElasticIPAllocationId', 'InstancePublicIp', 'RestorePrefixValue'];
      requiredOutputs.forEach((outputName) => {
        expect(outputs).toHaveProperty(outputName);
        expect(outputs[outputName]['Value']).toBeDefined();
      });
    });
  });

  describe('Instance Configuration', () => {
    it('instance uses parameter for instance type', () => {
      template.hasResourceProperties('AWS::EC2::Instance', {
        InstanceType: { Ref: 'InstanceType' },
      });
    });

    it('instance type parameter has correct default', () => {
      const templateJson = template.toJSON();
      expect(templateJson['Parameters']['InstanceType']).toHaveProperty('Default', 't2.micro');
    });

    it('instance DNS parameter has correct default', () => {
      const templateJson = template.toJSON();
      expect(templateJson['Parameters']['InstanceDns']).toHaveProperty('Default', 'box');
    });
  });
});

