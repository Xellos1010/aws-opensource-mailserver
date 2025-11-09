import * as cdk from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { EmcNotaryCoreStack } from '../../stacks/core-stack';

describe('EmcNotaryCoreStack', () => {
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

  describe('SES Resources', () => {
    it('creates SES email identity with DKIM enabled', () => {
      template.hasResourceProperties('AWS::SES::EmailIdentity', {
        DkimAttributes: {
          SigningEnabled: true,
        },
        MailFromAttributes: {
          MailFromDomain: {
            'Fn::Join': ['', ['mail.', { Ref: 'DomainName' }]],
          },
        },
      });
    });

    it('outputs DKIM DNS tokens for domain verification', () => {
      template.hasOutput('DkimDNSTokenName1', {
        Description: 'First DKIM DNS token name for SES domain verification',
      });
      template.hasOutput('DkimDNSTokenValue1', {
        Description: 'First DKIM DNS token value for SES domain verification',
      });
      template.hasOutput('DkimDNSTokenName2', {});
      template.hasOutput('DkimDNSTokenValue2', {});
      template.hasOutput('DkimDNSTokenName3', {});
      template.hasOutput('DkimDNSTokenValue3', {});
    });

    it('outputs Mail From domain configuration', () => {
      template.hasOutput('MailFromDomain', {
        Description: 'Custom MAIL FROM domain name',
      });
      template.hasOutput('MailFromMXRecord', {
        Description: 'MX record for custom MAIL FROM domain',
      });
      template.hasOutput('MailFromTXTRecord', {
        Description: 'TXT record for custom MAIL FROM domain',
      });
    });
  });

  describe('S3 Resources', () => {
    it('creates encrypted versioned backup bucket', () => {
      template.hasResourceProperties('AWS::S3::Bucket', {
        BucketName: {
          'Fn::Join': ['', [{ Ref: 'DomainName' }, '-backup']],
        },
        VersioningConfiguration: {
          Status: 'Enabled',
        },
        BucketEncryption: {
          ServerSideEncryptionConfiguration: [
            {
              ServerSideEncryptionByDefault: {
                SSEAlgorithm: 'AES256',
              },
            },
          ],
        },
        PublicAccessBlockConfiguration: {
          BlockPublicAcls: true,
          BlockPublicPolicy: true,
          IgnorePublicAcls: true,
          RestrictPublicBuckets: true,
        },
      });
    });

    it('creates encrypted versioned nextcloud bucket', () => {
      template.hasResourceProperties('AWS::S3::Bucket', {
        BucketName: {
          'Fn::Join': ['', [{ Ref: 'DomainName' }, '-nextcloud']],
        },
        VersioningConfiguration: {
          Status: 'Enabled',
        },
        BucketEncryption: {
          ServerSideEncryptionConfiguration: [
            {
              ServerSideEncryptionByDefault: {
                SSEAlgorithm: 'AES256',
              },
            },
          ],
        },
      });
    });

    it('configures auto-delete for buckets', () => {
      template.resourceCountIs('Custom::S3AutoDeleteObjects', 2);
    });

    it('outputs backup bucket name', () => {
      template.hasOutput('BackupBucketName', {
        Description: 'S3 Backup Bucket Name',
      });
    });
  });

  describe('Lambda Functions', () => {
    it('creates reverse DNS lambda with proper IAM permissions', () => {
      template.hasResourceProperties('AWS::IAM::Role', {
        RoleName: {
          'Fn::Join': [
            '',
            ['ReverseDnsLambdaExecutionRole-', { Ref: 'AWS::StackName' }],
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

      // Check Lambda function exists
      const lambdaResources = template.findResources('AWS::Lambda::Function', {
        FunctionName: {
          'Fn::Join': [
            '',
            ['ReverseDnsLambdaFunction-', { Ref: 'AWS::StackName' }],
          ],
        },
      });
      expect(Object.keys(lambdaResources).length).toBeGreaterThan(0);
    });

    it('creates SMTP credentials lambda with SSM permissions', () => {
      const lambdaResources = template.findResources('AWS::Lambda::Function', {
        FunctionName: {
          'Fn::Join': [
            '',
            ['SMTPCredentialsLambdaFunction-', { Ref: 'AWS::StackName' }],
          ],
        },
      });
      expect(Object.keys(lambdaResources).length).toBeGreaterThan(0);

      // Check IAM role has SSM permissions
      template.hasResourceProperties('AWS::IAM::Policy', {
        PolicyDocument: {
          Statement: [
            {
              Action: ['ssm:PutParameter', 'ssm:DeleteParameter'],
              Effect: 'Allow',
            },
          ],
        },
      });
    });

    it('reverse DNS lambda has EC2 permissions', () => {
      template.hasResourceProperties('AWS::IAM::Policy', {
        PolicyDocument: {
          Statement: [
            {
              Action: ['ec2:ModifyAddressAttribute', 'ec2:DescribeAddresses'],
              Effect: 'Allow',
            },
          ],
        },
      });
    });
  });

  describe('SSM Parameters', () => {
    it('publishes domain name parameter', () => {
      template.hasResourceProperties('AWS::SSM::Parameter', {
        Name: '/emcnotary/core/domainName',
        Description: 'Domain name for EMC Notary mailserver',
      });
    });

    it('publishes backup bucket parameter', () => {
      template.hasResourceProperties('AWS::SSM::Parameter', {
        Name: '/emcnotary/core/backupBucket',
        Description: 'S3 backup bucket name',
      });
    });

    it('publishes nextcloud bucket parameter', () => {
      template.hasResourceProperties('AWS::SSM::Parameter', {
        Name: '/emcnotary/core/nextcloudBucket',
        Description: 'S3 Nextcloud bucket name',
      });
    });

    it('publishes alarms topic parameter', () => {
      template.hasResourceProperties('AWS::SSM::Parameter', {
        Name: '/emcnotary/core/alarmsTopicArn',
        Description: 'SNS alarms topic ARN',
      });
    });

    it('publishes SES identity ARN parameter', () => {
      template.hasResourceProperties('AWS::SSM::Parameter', {
        Name: '/emcnotary/core/sesIdentityArn',
        Description: 'SES email identity ARN',
      });
    });

    it('publishes EIP allocation ID parameter', () => {
      template.hasResourceProperties('AWS::SSM::Parameter', {
        Name: '/emcnotary/core/eipAllocationId',
        Description: 'Elastic IP allocation ID for mail server instance',
      });
    });
  });

  describe('CloudWatch Resources', () => {
    it('creates syslog log group with 7-day retention', () => {
      template.hasResourceProperties('AWS::Logs::LogGroup', {
        LogGroupName: {
          'Fn::Join': ['', ['/ec2/syslog-', { Ref: 'AWS::StackName' }]],
        },
        RetentionInDays: 7,
      });
    });

    it('creates CW agent config SSM parameter', () => {
      template.hasResourceProperties('AWS::SSM::Parameter', {
        ParameterName: {
          'Fn::Join': ['', ['/cwagent-linux-', { Ref: 'AWS::StackName' }]],
        },
        Description: 'CloudWatch Agent configuration for mail server',
      });
    });
  });

  describe('SNS Resources', () => {
    it('creates alarms topic', () => {
      template.hasResourceProperties('AWS::SNS::Topic', {
        TopicName: {
          'Fn::Join': [
            '',
            ['ec2-memory-events-', { Ref: 'AWS::StackName' }],
          ],
        },
        DisplayName: 'EMC Notary Mailserver Alarms',
      });
    });

    it('outputs alert topic ARN', () => {
      template.hasOutput('AlertTopicArn', {
        Description: 'SNS Topic ARN for memory and system alerts',
      });
    });
  });

  describe('Elastic IP', () => {
    it('creates Elastic IP in VPC domain', () => {
      template.hasResourceProperties('AWS::EC2::EIP', {
        Domain: 'vpc',
      });
    });

    it('outputs Elastic IP address and allocation ID', () => {
      template.hasOutput('ElasticIPAddress', {
        Description: 'The allocated Elastic IP address (persistent across instance updates)',
      });
      template.hasOutput('ElasticIPAllocationId', {
        Description: 'The Elastic IP allocation ID for associating with instances',
      });
    });
  });

  describe('Custom Resources', () => {
    it('creates reverse DNS custom resource', () => {
      template.hasResourceProperties('AWS::CloudFormation::CustomResource', {
        Properties: {
          PtrRecord: {
            'Fn::Join': ['', ['box.', { Ref: 'DomainName' }]],
          },
        },
      });
    });
  });

  describe('Stack Outputs', () => {
    it('outputs all required values', () => {
      const outputs = template.findOutputs('*');
      const requiredOutputs = [
        'DomainNameOutput',
        'SesIdentityArn',
        'BackupBucketName',
        'AlertTopicArn',
        'DkimDNSTokenName1',
        'DkimDNSTokenValue1',
        'DkimDNSTokenName2',
        'DkimDNSTokenValue2',
        'DkimDNSTokenName3',
        'DkimDNSTokenValue3',
        'MailFromDomain',
        'MailFromMXRecord',
        'MailFromTXTRecord',
        'ElasticIPAddress',
        'ElasticIPAllocationId',
      ];

      requiredOutputs.forEach((outputName) => {
        expect(outputs).toHaveProperty(outputName);
        expect(outputs[outputName]).toHaveProperty('Description');
        expect(outputs[outputName]).toHaveProperty('Value');
      });
    });
  });

  describe('Domain Parameter', () => {
    it('creates domain name parameter with validation', () => {
      template.hasResourceProperties('AWS::CloudFormation::Parameter', {
        Type: 'String',
        Default: 'emcnotary.com',
        Description: 'The domain name for the mail server resources',
        AllowedPattern: '^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$',
      });
    });
  });
});

