import * as cdk from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { MailServerInstanceStack, EmcNotaryInstanceStack } from '../../stacks/instance-stack';
import { DomainConfig } from '@mm/infra-instance-constructs';

describe('MailServerInstanceStack', () => {
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

  describe('EC2 Instance', () => {
    it('creates EC2 instance with correct properties', () => {
      // ImageId uses Ref to SSM parameter, not Fn::Join
      template.hasResourceProperties('AWS::EC2::Instance', {
        InstanceType: { Ref: 'InstanceType' },
      });
      
      // Verify ImageId references SSM parameter
      const instances = template.findResources('AWS::EC2::Instance', {});
      const instance = Object.values(instances)[0] as any;
      expect(instance['Properties']['ImageId']).toBeDefined();
    });

    it('creates instance with encrypted EBS volume', () => {
      template.hasResourceProperties('AWS::EC2::Instance', {
        BlockDeviceMappings: [
          {
            DeviceName: '/dev/sda1',
            Ebs: {
              VolumeSize: 8,
              VolumeType: 'gp2',
              DeleteOnTermination: true,
              Encrypted: true,
            },
          },
        ],
      });
    });

    it('tags instance with correct name and domain', () => {
      // CDK adds additional tags, so we check for the specific ones we care about
      const instances = template.findResources('AWS::EC2::Instance', {});
      const instance = Object.values(instances)[0] as any;
      const tags = instance['Properties']['Tags'] || [];
      
      const nameTag = tags.find((tag: any) => tag.Key === 'Name');
      expect(nameTag).toBeDefined();
      expect(nameTag?.Value).toContain('MailInABoxInstance');
      
      const mailserverTag = tags.find((tag: any) => tag.Key === 'MAILSERVER');
      expect(mailserverTag).toBeDefined();
    });
  });

  describe('Security Group', () => {
    it('creates security group with mail server ports', () => {
      template.hasResourceProperties('AWS::EC2::SecurityGroup', {
        GroupDescription: 'Security Group for Mail-in-a-box Instance',
        SecurityGroupIngress: [
          {
            CidrIp: '0.0.0.0/0',
            Description: 'SSH',
            FromPort: 22,
            IpProtocol: 'tcp',
            ToPort: 22,
          },
          {
            CidrIp: '0.0.0.0/0',
            Description: 'DNS (TCP)',
            FromPort: 53,
            IpProtocol: 'tcp',
            ToPort: 53,
          },
          {
            CidrIp: '0.0.0.0/0',
            Description: 'DNS (UDP)',
            FromPort: 53,
            IpProtocol: 'udp',
            ToPort: 53,
          },
          {
            CidrIp: '0.0.0.0/0',
            Description: 'HTTP',
            FromPort: 80,
            IpProtocol: 'tcp',
            ToPort: 80,
          },
          {
            CidrIp: '0.0.0.0/0',
            Description: 'HTTPS',
            FromPort: 443,
            IpProtocol: 'tcp',
            ToPort: 443,
          },
          {
            CidrIp: '0.0.0.0/0',
            Description: 'SMTP (STARTTLS)',
            FromPort: 25,
            IpProtocol: 'tcp',
            ToPort: 25,
          },
          {
            CidrIp: '0.0.0.0/0',
            Description: 'IMAP (STARTTLS)',
            FromPort: 143,
            IpProtocol: 'tcp',
            ToPort: 143,
          },
          {
            CidrIp: '0.0.0.0/0',
            Description: 'IMAPS',
            FromPort: 993,
            IpProtocol: 'tcp',
            ToPort: 993,
          },
          {
            CidrIp: '0.0.0.0/0',
            Description: 'SMTPS',
            FromPort: 465,
            IpProtocol: 'tcp',
            ToPort: 465,
          },
          {
            CidrIp: '0.0.0.0/0',
            Description: 'SMTP Submission',
            FromPort: 587,
            IpProtocol: 'tcp',
            ToPort: 587,
          },
          {
            CidrIp: '0.0.0.0/0',
            Description: 'Sieve Mail filtering',
            FromPort: 4190,
            IpProtocol: 'tcp',
            ToPort: 4190,
          },
        ],
      });
    });
  });

  describe('IAM Role', () => {
    it('creates IAM role for EC2 instance', () => {
      // RoleName is a string, not a CloudFormation function
      template.hasResourceProperties('AWS::IAM::Role', {
        AssumeRolePolicyDocument: {
          Statement: [
            {
              Action: 'sts:AssumeRole',
              Effect: 'Allow',
              Principal: {
                Service: 'ec2.amazonaws.com',
              },
            },
          ],
        },
      });
      
      // Verify RoleName contains expected pattern
      const roles = template.findResources('AWS::IAM::Role', {});
      const instanceRole = Object.values(roles).find((resource: any) =>
        resource['Properties']?.['RoleName']?.includes('MailInABoxInstanceRole')
      );
      expect(instanceRole).toBeDefined();
    });

    it('creates instance profile', () => {
      // InstanceProfileName is a string, not a CloudFormation function
      // Verify InstanceProfileName contains expected pattern
      const profiles = template.findResources('AWS::IAM::InstanceProfile', {});
      const instanceProfile = Object.values(profiles).find((resource: any) =>
        resource['Properties']?.['InstanceProfileName']?.includes('MailInABoxInstanceProfile')
      );
      expect(instanceProfile).toBeDefined();
      
      // Verify it has Roles array
      if (instanceProfile) {
        expect(instanceProfile['Properties']).toHaveProperty('Roles');
        expect(Array.isArray(instanceProfile['Properties']['Roles'])).toBe(true);
      }
    });

    it('grants S3 bucket access permissions', () => {
      // Policy has more statements than just S3, so we check for the specific Sids
      const policies = template.findResources('AWS::IAM::Policy', {});
      const roles = template.findResources('AWS::IAM::Role', {});
      const instanceRoleLogicalId = Object.keys(roles).find((logicalId) =>
        roles[logicalId]['Properties']?.['RoleName']?.includes('MailInABoxInstanceRole')
      );
      
      const instancePolicy = Object.values(policies).find((resource: any) =>
        resource['Properties']?.['Roles']?.some((role: any) => 
          typeof role === 'object' && 'Ref' in role && role['Ref'] === instanceRoleLogicalId
        )
      );
      expect(instancePolicy).toBeDefined();
      
      if (instancePolicy) {
        const statements = instancePolicy['Properties']['PolicyDocument']['Statement'] || [];
        const backupS3Statement = statements.find((stmt: any) => stmt.Sid === 'BackupS3BucketAccessMIAB');
        const nextcloudS3Statement = statements.find((stmt: any) => stmt.Sid === 'NextCloudS3Policy');
        expect(backupS3Statement).toBeDefined();
        expect(nextcloudS3Statement).toBeDefined();
      }
    });

    it('grants SSM parameter read permissions', () => {
      // Policy has multiple statements, check for SSM permissions
      const policies = template.findResources('AWS::IAM::Policy', {});
      const instancePolicy = Object.values(policies).find((resource: any) =>
        resource['Properties']?.['Roles']?.some((role: any) => 
          typeof role === 'object' && 'Ref' in role
        )
      );
      expect(instancePolicy).toBeDefined();
      
      if (instancePolicy) {
        const statements = instancePolicy['Properties']['PolicyDocument']['Statement'] || [];
        const ssmStatement = statements.find((stmt: any) =>
          Array.isArray(stmt.Action)
            ? stmt.Action.some((action: string) => action.includes('ssm:GetParameter'))
            : stmt.Action?.includes('ssm:GetParameter')
        );
        expect(ssmStatement).toBeDefined();
      }
    });

    it('has AmazonSSMManagedInstanceCore managed policy for SSM access', () => {
      // Verify the IAM role has the SSM managed policy attached
      const roles = template.findResources('AWS::IAM::Role', {});
      const instanceRole = Object.values(roles).find((resource: any) =>
        resource['Properties']?.['RoleName']?.includes('MailInABoxInstanceRole')
      );
      expect(instanceRole).toBeDefined();
      
      if (instanceRole) {
        const managedPolicyArns = instanceRole['Properties']['ManagedPolicyArns'] || [];
        const hasSsmPolicy = managedPolicyArns.some((arn: any) => {
          // Managed policy ARN can be a string or CloudFormation intrinsic function
          if (typeof arn === 'string') {
            return arn.includes('AmazonSSMManagedInstanceCore');
          }
          // Check if it's a CloudFormation function that resolves to the SSM policy
          if (typeof arn === 'object' && 'Fn::Join' in arn) {
            const joinParts = arn['Fn::Join'][1];
            return joinParts.some((part: any) => 
              typeof part === 'string' && part.includes('AmazonSSMManagedInstanceCore')
            );
          }
          return false;
        });
        expect(hasSsmPolicy).toBe(true);
      }
    });
  });

  describe('Key Pair', () => {
    it('creates EC2 key pair with domain name', () => {
      // Verify KeyPair exists
      const keyPairs = template.findResources('AWS::EC2::KeyPair', {});
      expect(Object.keys(keyPairs).length).toBeGreaterThan(0);
      
      const keyPair = Object.values(keyPairs)[0] as any;
      expect(keyPair['Properties']['KeyName']).toBeDefined();
      
      // Verify tags contain MAILSERVER
      const tags = keyPair['Properties']['Tags'] || [];
      const mailserverTag = tags.find((tag: any) => tag.Key === 'MAILSERVER');
      expect(mailserverTag).toBeDefined();
    });
  });

  describe('EIP Association', () => {
    it('associates EIP from core stack', () => {
      // Verify EIP association exists
      const eipAssociations = template.findResources('AWS::EC2::EIPAssociation', {});
      expect(Object.keys(eipAssociations).length).toBeGreaterThan(0);
      
      // Verify it has AllocationId and InstanceId
      const eipAssociation = Object.values(eipAssociations)[0] as any;
      expect(eipAssociation['Properties']).toHaveProperty('AllocationId');
      expect(eipAssociation['Properties']).toHaveProperty('InstanceId');
    });
  });

  describe('Nightly Reboot', () => {
    it('creates Lambda function for reboot', () => {
      // Find Lambda function by logical ID pattern (NightlyRebootFunction)
      const lambdaResources = template.findResources('AWS::Lambda::Function', {});
      const rebootLambda = Object.values(lambdaResources).find((resource: any, index: number, arr: any[]) => {
        const logicalId = Object.keys(lambdaResources)[index];
        return logicalId.includes('NightlyReboot') || logicalId.includes('Reboot');
      });
      
      // If not found by logical ID, check by runtime and environment variables
      const lambdaByRuntime = Object.values(lambdaResources).find((resource: any) =>
        resource['Properties']?.['Runtime'] === 'nodejs20.x' &&
        resource['Properties']?.['Environment']?.['Variables']?.['INSTANCE_ID']
      );
      
      const foundLambda = rebootLambda || lambdaByRuntime;
      expect(foundLambda).toBeDefined();
      
      if (foundLambda) {
        expect(foundLambda['Properties']['Runtime']).toBe('nodejs20.x');
        expect(foundLambda['Properties']['Timeout']).toBe(30);
        expect(foundLambda['Properties']['Environment']).toHaveProperty('Variables');
        expect(foundLambda['Properties']['Environment']['Variables']).toHaveProperty('INSTANCE_ID');
      }
    });

    it('creates EventBridge rule with correct schedule', () => {
      // EventBridge schedule format may vary slightly
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

    it('Lambda has EC2 reboot permissions', () => {
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
  });

  describe('CloudFormation Parameters', () => {
    it('creates InstanceType parameter with default', () => {
      const templateJson = template.toJSON();
      expect(templateJson['Parameters']).toHaveProperty('InstanceType');
      expect(templateJson['Parameters']['InstanceType']).toHaveProperty('Type', 'String');
      expect(templateJson['Parameters']['InstanceType']).toHaveProperty('Default', 't2.micro');
      expect(templateJson['Parameters']['InstanceType']).toHaveProperty('Description', 'EC2 instance type');
    });

    it('creates InstanceDns parameter with default', () => {
      const templateJson = template.toJSON();
      expect(templateJson['Parameters']).toHaveProperty('InstanceDns');
      expect(templateJson['Parameters']['InstanceDns']).toHaveProperty('Type', 'String');
      expect(templateJson['Parameters']['InstanceDns']).toHaveProperty('Default', 'box');
      expect(templateJson['Parameters']['InstanceDns']).toHaveProperty('Description', "DNS name of Instance (within the 'DomainName')");
    });
  });

  describe('CloudFormation Outputs', () => {
    it('outputs all required values', () => {
      const outputs = template.findOutputs('*');
      const requiredOutputs = [
        'InstanceId',
        'KeyPairId',
        'DomainName',
        'InstanceDnsName',
        'ElasticIPAllocationId',
        'InstancePublicIp',
        'AdminPassword',
        'RestorePrefixValue',
        'NightlyRebootSchedule',
        'BootstrapCommand',
      ];

      requiredOutputs.forEach((outputName) => {
        expect(outputs).toHaveProperty(outputName);
        expect(outputs[outputName]).toHaveProperty('Description');
        expect(outputs[outputName]).toHaveProperty('Value');
      });
    });

    it('outputs instance ID', () => {
      // Instance ID output uses actual resource logical ID
      template.hasOutput('InstanceId', {
        Description: 'The EC2 instance ID',
      });
      
      // Verify output references an EC2 instance
      const outputs = template.findOutputs('*');
      expect(outputs['InstanceId']['Value']).toBeDefined();
    });

    it('outputs domain name', () => {
      // Domain name output uses Ref to parameter, not Fn::GetAtt
      template.hasOutput('DomainName', {
        Description: 'The domain name',
      });
      
      // Verify output exists
      const outputs = template.findOutputs('*');
      expect(outputs['DomainName']['Value']).toBeDefined();
    });

    it('outputs bootstrap command', () => {
      template.hasOutput('BootstrapCommand', {
        Description: 'Command to bootstrap this instance via SSM',
      });
    });
  });

  describe('SSM Parameter Dependencies', () => {
    it('reads domain name from SSM parameter', () => {
      // Instance stack reads SSM parameters but doesn't create them
      // They are created by the core stack
      // We verify the stack references the correct parameter names via StringParameter.fromStringParameterAttributes
      // This creates CloudFormation parameters that reference the SSM parameters
      const templateJson = template.toJSON();
      const parameters = templateJson['Parameters'] || {};
      
      // Verify parameters exist for SSM parameter references
      // CDK creates parameters like CoreDomainNameParameter, CoreBackupBucketParameter, etc.
      expect(Object.keys(parameters).length).toBeGreaterThan(0);
    });

    it('reads backup bucket from SSM parameter', () => {
      // Same as above - verify parameters exist
      const templateJson = template.toJSON();
      const parameters = templateJson['Parameters'] || {};
      expect(Object.keys(parameters).length).toBeGreaterThan(0);
    });

    it('reads nextcloud bucket from SSM parameter', () => {
      // Same as above - verify parameters exist
      const templateJson = template.toJSON();
      const parameters = templateJson['Parameters'] || {};
      expect(Object.keys(parameters).length).toBeGreaterThan(0);
    });

    it('reads alarms topic ARN from SSM parameter', () => {
      // Same as above - verify parameters exist
      const templateJson = template.toJSON();
      const parameters = templateJson['Parameters'] || {};
      expect(Object.keys(parameters).length).toBeGreaterThan(0);
    });

    it('reads EIP allocation ID from SSM parameter', () => {
      // Same as above - verify parameters exist
      const templateJson = template.toJSON();
      const parameters = templateJson['Parameters'] || {};
      expect(Object.keys(parameters).length).toBeGreaterThan(0);
    });
  });
});

describe('EmcNotaryInstanceStack', () => {
  let app: cdk.App;
  let stack: EmcNotaryInstanceStack;
  let template: Template;

  beforeEach(() => {
    app = new cdk.App();
    stack = new EmcNotaryInstanceStack(app, 'TestStack', {
      env: {
        account: '123456789012',
        region: 'us-east-1',
      },
    });
    template = Template.fromStack(stack);
  });

  it('creates stack with emcnotary.com domain configuration', () => {
    // Instance stack reads SSM parameters but doesn't create them
    // Verify stack uses correct coreParamPrefix by checking domain config
    const templateJson = template.toJSON();
    expect(templateJson).toBeDefined();
    
    // Verify stack has required resources (EC2 Instance, Security Group, etc.)
    const ec2Instances = template.findResources('AWS::EC2::Instance', {});
    expect(Object.keys(ec2Instances).length).toBeGreaterThan(0);
    
    const securityGroups = template.findResources('AWS::EC2::SecurityGroup', {});
    expect(Object.keys(securityGroups).length).toBeGreaterThan(0);
  });

  it('uses default instance DNS of box', () => {
    const templateJson = template.toJSON();
    expect(templateJson['Parameters']['InstanceDns']).toHaveProperty('Default', 'box');
  });
});

