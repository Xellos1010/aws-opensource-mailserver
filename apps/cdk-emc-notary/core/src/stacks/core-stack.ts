import {
  Stack,
  StackProps,
  CfnOutput,
  CfnParameter,
  CustomResource,
  aws_s3 as s3,
  aws_sns as sns,
  aws_ssm as ssm,
  aws_ses as ses,
  aws_logs as logs,
  aws_lambda as lambda,
  aws_iam as iam,
  aws_ec2 as ec2,
  RemovalPolicy,
  Duration,
} from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { Provider } from 'aws-cdk-lib/custom-resources';
import { tagStack } from '@mm/infra-shared-constructs';
import {
  P_DOMAIN_NAME,
  P_BACKUP_BUCKET,
  P_NEXTCLOUD_BUCKET,
  P_ALARMS_TOPIC,
  P_SES_IDENTITY_ARN,
  P_EIP_ALLOCATION_ID,
} from '@mm/infra-core-params';

export class EmcNotaryCoreStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);
    tagStack(this, 'emcnotary-mailserver');

    // Domain name parameter (matches CloudFormation template)
    const domainName = new CfnParameter(this, 'DomainName', {
      type: 'String',
      default: 'emcnotary.com',
      description: 'The domain name for the mail server resources',
      allowedPattern: '^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$',
    });

    const domain = domainName.valueAsString;

    // Elastic IP - persistent across instance updates for hot-swapping
    const eip = new ec2.CfnEIP(this, 'ElasticIP', {
      domain: 'vpc',
      tags: [
        {
          key: 'MAILSERVER',
          value: domain,
        },
      ],
    });

    // Reverse DNS Lambda - sets reverse DNS on EIP creation
    const reverseDnsLambdaRole = new iam.Role(this, 'ReverseDnsLambdaExecutionRole', {
      roleName: `ReverseDnsLambdaExecutionRole-${this.stackName}`,
      description: 'Role assumed by Lambda to set reverse DNS on Elastic IP',
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName(
          'service-role/AWSLambdaBasicExecutionRole'
        ),
      ],
    });

    reverseDnsLambdaRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ['ec2:ModifyAddressAttribute', 'ec2:DescribeAddresses'],
        resources: ['*'], // EIP resources don't support resource-level permissions
      })
    );

    const reverseDnsLambda = new lambda.Function(this, 'ReverseDnsLambdaFunction', {
      functionName: `ReverseDnsLambdaFunction-${this.stackName}`,
      runtime: lambda.Runtime.PYTHON_3_11,
      handler: 'index.lambda_handler',
      role: reverseDnsLambdaRole,
      timeout: Duration.seconds(30),
      memorySize: 128,
      code: lambda.Code.fromInline(`
import boto3
from botocore.exceptions import ClientError
import cfnresponse
import logging
import os

logging.basicConfig(level=logging.INFO)
log = logging.getLogger(__name__)
region = os.environ['AWS_REGION']
ec2 = boto3.client('ec2', region_name=region)

def lambda_handler(event, context):
    log.info('Event: %s', event)
    
    # Handle missing properties gracefully
    allocation_id = event.get('ResourceProperties', {}).get('AllocationId')
    ptr_record = event.get('ResourceProperties', {}).get('PtrRecord', '')
    
    if not allocation_id:
        error_msg = 'Missing AllocationId in ResourceProperties'
        log.error(error_msg)
        cfnresponse.send(event, context, cfnresponse.FAILED, {
            'Reason': error_msg
        }, 'unknown')
        return
    
    request_type = event.get('RequestType', 'Unknown')
    
    try:
        if request_type in ['Create', 'Update']:
            # Set reverse DNS
            try:
                ec2.modify_address_attribute(
                    AllocationId=allocation_id,
                    DomainName=ptr_record
                )
                log.info('Successfully set reverse DNS: %s -> %s', allocation_id, ptr_record)
                cfnresponse.send(event, context, cfnresponse.SUCCESS, {
                    'Message': f'Reverse DNS set to {ptr_record}'
                }, allocation_id)
            except ClientError as e:
                error_code = e.response.get('Error', {}).get('Code', 'Unknown')
                if error_code == 'InvalidAllocationID.NotFound':
                    log.warning('EIP allocation not found: %s (may have been released)', allocation_id)
                    # Still succeed - EIP may have been released already
                    cfnresponse.send(event, context, cfnresponse.SUCCESS, {
                        'Message': f'EIP not found (may be released): {allocation_id}'
                    }, allocation_id)
                else:
                    raise
        elif request_type == 'Delete':
            # Clear reverse DNS on stack deletion to reset to vanilla state
            # Always succeed on delete, even if EIP doesn't exist
            try:
                # First check if EIP exists
                addresses = ec2.describe_addresses(AllocationIds=[allocation_id])
                if not addresses.get('Addresses'):
                    log.info('EIP allocation %s not found - already released or deleted', allocation_id)
                    cfnresponse.send(event, context, cfnresponse.SUCCESS, {
                        'Message': 'EIP not found - already released'
                    }, allocation_id)
                    return
                
                # Try to clear reverse DNS
                ec2.modify_address_attribute(
                    AllocationId=allocation_id,
                    DomainName=''  # Empty string clears reverse DNS
                )
                log.info('Successfully cleared reverse DNS for allocation: %s', allocation_id)
                cfnresponse.send(event, context, cfnresponse.SUCCESS, {
                    'Message': 'Reverse DNS cleared on stack deletion'
                }, allocation_id)
            except ClientError as e:
                error_code = e.response.get('Error', {}).get('Code', 'Unknown')
                # Handle various error cases gracefully
                if error_code in ['InvalidAllocationID.NotFound', 'InvalidAddress.NotFound']:
                    log.info('EIP allocation %s not found - already released', allocation_id)
                    cfnresponse.send(event, context, cfnresponse.SUCCESS, {
                        'Message': 'EIP not found - already released'
                    }, allocation_id)
                elif error_code == 'InvalidParameterValue':
                    log.warning('Invalid parameter for EIP %s: %s', allocation_id, str(e))
                    # Still succeed - EIP may be in invalid state
                    cfnresponse.send(event, context, cfnresponse.SUCCESS, {
                        'Message': f'EIP may be in invalid state: {str(e)}'
                    }, allocation_id)
                else:
                    # For any other error, log but still succeed on delete
                    log.warning('Could not clear reverse DNS for %s: %s', allocation_id, str(e))
                    cfnresponse.send(event, context, cfnresponse.SUCCESS, {
                        'Message': f'Reverse DNS clear attempted: {str(e)}'
                    }, allocation_id)
            except Exception as clear_err:
                # Catch-all for any other exceptions - still succeed on delete
                log.warning('Unexpected error clearing reverse DNS: %s', str(clear_err))
                cfnresponse.send(event, context, cfnresponse.SUCCESS, {
                    'Message': f'Reverse DNS clear attempted: {str(clear_err)}'
                }, allocation_id)
        else:
            cfnresponse.send(event, context, cfnresponse.FAILED, {
                'Reason': f"Unsupported request type: {request_type}"
            }, allocation_id)
    except Exception as e:
        log.error('Unexpected error in reverse DNS handler: %s', str(e))
        # On delete, always succeed even on unexpected errors
        if request_type == 'Delete':
            cfnresponse.send(event, context, cfnresponse.SUCCESS, {
                'Message': f'Delete operation completed with warning: {str(e)}'
            }, allocation_id)
        else:
            cfnresponse.send(event, context, cfnresponse.FAILED, {
                'Reason': str(e)
            }, allocation_id)
      `),
      // Note: AWS_REGION is automatically set by Lambda runtime - don't set it manually
    });

    // Custom resource provider for reverse DNS
    const reverseDnsProvider = new Provider(this, 'ReverseDnsProvider', {
      onEventHandler: reverseDnsLambda,
    });

    // Custom resource to set reverse DNS when EIP is created
    const ptrRecord = `box.${domain}`;
    new CustomResource(this, 'ReverseDnsResource', {
      serviceToken: reverseDnsProvider.serviceToken,
      properties: {
        AllocationId: eip.attrAllocationId,
        PtrRecord: ptrRecord,
      },
    });

    // SES domain identity + DKIM (no Route53 hosted zone - uses domain name directly)
    const identity = new ses.EmailIdentity(this, 'SesIdentity', {
      identity: ses.Identity.domain(domain),
      dkimSigning: true,
      mailFromDomain: `mail.${domain}`,
    });

    // S3 Buckets: backup and nextcloud (matching CloudFormation template)
    // Note: These buckets are deleted when stack is deleted - backups should be handled separately
    const backupBucket = new s3.Bucket(this, 'BackupBucket', {
      bucketName: `${domain}-backup`,
      removalPolicy: RemovalPolicy.DESTROY, // Delete bucket on stack deletion
      versioned: true,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      autoDeleteObjects: true, // Auto-delete objects when stack is deleted
    });

    const nextcloudBucket = new s3.Bucket(this, 'NextcloudBucket', {
      bucketName: `${domain}-nextcloud`,
      removalPolicy: RemovalPolicy.DESTROY, // Delete bucket on stack deletion
      versioned: true,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      autoDeleteObjects: true, // Auto-delete objects when stack is deleted
    });

    // Get central backup bucket from mailservers-backups stack
    // This allows backing up to a central location before deletion
    // Can be provided via CDK context: --context centralBackupBucket=mailservers-backups
    // Or via environment variable: CENTRAL_BACKUP_BUCKET=mailservers-backups
    // If not provided, core stack works without it (backups handled manually)
    const centralBackupBucket =
      this.node.tryGetContext('centralBackupBucket') ||
      process.env['CENTRAL_BACKUP_BUCKET'] ||
      undefined;

    // SNS Alarms topic (matching CloudFormation AlertTopic)
    const alarmsTopic = new sns.Topic(this, 'AlertTopic', {
      topicName: `ec2-memory-events-${this.stackName}`,
      displayName: 'EMC Notary Mailserver Alarms',
    });

    // CloudWatch Log Group for syslog (matching CloudFormation SyslogGroup)
    const syslogGroup = new logs.LogGroup(this, 'SyslogGroup', {
      logGroupName: `/ec2/syslog-${this.stackName}`,
      retention: logs.RetentionDays.ONE_WEEK,
      removalPolicy: RemovalPolicy.DESTROY, // Delete logs when stack is deleted
    });

    // OOM Metric Filter - detects "Out of memory" messages in syslog
    // This creates a CloudWatch metric that increments when OOM kills occur
    new logs.MetricFilter(this, 'OOMMetricFilter', {
      logGroup: syslogGroup,
      filterPattern: logs.FilterPattern.literal('Out of memory'),
      metricNamespace: 'EC2',
      metricName: 'oom_kills',
      metricValue: '1',
      defaultValue: 0,
    });

    // CloudWatch Agent Config SSM Parameter (matching CloudFormation CWAgentConfigParam)
    const cwAgentConfig = new ssm.StringParameter(this, 'CWAgentConfigParam', {
      parameterName: `/cwagent-linux-${this.stackName}`,
      stringValue: JSON.stringify({
        agent: {
          metrics_collection_interval: 60,
          run_as_user: 'root',
        },
        metrics: {
          append_dimensions: {
            InstanceId: '${aws:InstanceId}',
          },
          metrics_collected: {
            mem: {
              measurement: ['mem_used_percent', 'mem_available'],
              metrics_collection_interval: 60,
            },
            swap: {
              measurement: ['swap_used_percent'],
              metrics_collection_interval: 60,
            },
          },
        },
        logs: {
          logs_collected: {
            files: {
              collect_list: [
                {
                  file_path: '/var/log/syslog',
                  log_group_name: `/ec2/syslog-${this.stackName}`,
                  log_stream_name: '{instance_id}',
                },
              ],
            },
          },
        },
      }),
      description: 'CloudWatch Agent configuration for mail server',
    });

    // SES SMTP Credentials Lambda (matching CloudFormation SmtpLambdaFunction)
    const smtpLambdaRole = new iam.Role(this, 'SmtpLambdaExecutionRole', {
      roleName: `SMTPLambdaExecutionRole-${this.stackName}`,
      description: 'Role assumed by Lambda to generate SMTP credentials',
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName(
          'service-role/AWSLambdaBasicExecutionRole'
        ),
      ],
    });

    smtpLambdaRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ['ssm:PutParameter', 'ssm:DeleteParameter'],
        resources: [
          `arn:aws:ssm:${this.region}:${this.account}:parameter/smtp-username-${this.stackName}`,
          `arn:aws:ssm:${this.region}:${this.account}:parameter/smtp-password-${this.stackName}`,
        ],
      })
    );

    const smtpLambda = new lambda.Function(this, 'SmtpLambdaFunction', {
      functionName: `SMTPCredentialsLambdaFunction-${this.stackName}`,
      runtime: lambda.Runtime.PYTHON_3_11,
      handler: 'index.lambda_handler',
      role: smtpLambdaRole,
      timeout: Duration.seconds(30),
      memorySize: 128,
      code: lambda.Code.fromInline(`
import hmac
import hashlib
import base64
import boto3
from botocore.exceptions import ClientError
import json
import cfnresponse
import logging
import os

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S'
)
log = logging.getLogger(__name__)
region = os.environ.get('AWS_REGION', 'us-east-1')
ssm = boto3.client('ssm', region_name=region)

SMTP_REGIONS = [
    'us-east-2', 'us-east-1', 'us-west-2', 'ap-south-1',
    'ap-northeast-2', 'ap-southeast-1', 'ap-southeast-2',
    'ap-northeast-1', 'ca-central-1', 'eu-central-1',
    'eu-west-1', 'eu-west-2', 'sa-east-1', 'us-gov-west-1',
]

DATE = "11111111"
SERVICE = "ses"
MESSAGE = "SendRawEmail"
TERMINAL = "aws4_request"
VERSION = 0x04

def sign(key, msg):
    return hmac.new(key, msg.encode('utf-8'), hashlib.sha256).digest()

def calculate_key(secret_access_key, region):
    if region not in SMTP_REGIONS:
        raise ValueError(f"The {region} Region doesn't have an SMTP endpoint.")
    signature = sign(("AWS4" + secret_access_key).encode('utf-8'), DATE)
    signature = sign(signature, region)
    signature = sign(signature, SERVICE)
    signature = sign(signature, TERMINAL)
    signature = sign(signature, MESSAGE)
    signature_and_version = bytes([VERSION]) + signature
    smtp_password = base64.b64encode(signature_and_version)
    return smtp_password.decode('utf-8')

def put_parameter(value, type, stack_name):
    try:
        ssm.put_parameter(
            Name='smtp-' + type + '-' + stack_name,
            Description='SMTP '+type+' for email communications',
            Value=value,
            Type='SecureString',
            Overwrite=True,
            Tier='Standard'
        )
        return True
    except Exception as e:
        print("Error putting parameter smtp-"+type+"-"+stack_name+": "+str(e))
        return False

def delete_smtp_credentials(type, stack_name):
    try:
        ssm.delete_parameter(Name='smtp-'+type+'-'+stack_name)
        return True
    except Exception as e:
        print("Error deleting parameter smtp-"+type+"-"+stack_name+": "+str(e))
        return False

def lambda_handler(event, context):
    request_id = context.aws_request_id if context else 'unknown'
    request_type = event.get('RequestType', 'Unknown')
    stack_name = os.environ.get('STACK_NAME', '')
    log.info('SMTP Lambda invoked: request_id=%s, request_type=%s, stack_name=%s', 
              request_id, request_type, stack_name)
    
    try:
        if not stack_name:
            raise ValueError('STACK_NAME environment variable not set')
        
        resource_props = event.get('ResourceProperties', {})
        parameter_type = resource_props.get('ParameterType')
        key = resource_props.get('Key')
        
        if not parameter_type:
            raise ValueError('ParameterType missing from ResourceProperties')
        if not key:
            raise ValueError('Key missing from ResourceProperties')
        
        account_id = os.environ.get('AWS_ACCOUNT_ID', '')
        parameter_arn = f"arn:aws:ssm:{region}:{account_id}:parameter/smtp-{parameter_type}-{stack_name}"
        
        proceed = False
        reason = ''
        
        if request_type == 'Create':
            log.info('Creating SMTP credentials: parameter_type=%s', parameter_type)
            if parameter_type == 'username':
                proceed = put_parameter(key, parameter_type, stack_name)
            elif parameter_type == 'password':
                pwd = calculate_key(key, region)
                proceed = put_parameter(pwd, parameter_type, stack_name)
            else:
                raise ValueError(f'Unsupported parameter type: {parameter_type}')
            reason = f"Created SMTP {parameter_type}"
            
        elif request_type == 'Update':
            log.info('Updating SMTP credentials: parameter_type=%s', parameter_type)
            if parameter_type == 'username':
                proceed = put_parameter(key, parameter_type, stack_name)
            elif parameter_type == 'password':
                pwd = calculate_key(key, region)
                proceed = put_parameter(pwd, parameter_type, stack_name)
            else:
                raise ValueError(f'Unsupported parameter type: {parameter_type}')
            reason = f"Updated SMTP {parameter_type}"
            
        elif request_type == 'Delete':
            log.info('Deleting SMTP credentials: parameter_type=%s', parameter_type)
            proceed = delete_smtp_credentials(parameter_type, stack_name)
            reason = f"Deleted SMTP {parameter_type}"
            
        else:
            raise ValueError(f"Unsupported request type: {request_type}")
        
        if proceed:
            log.info('SMTP Lambda succeeded: reason=%s, request_id=%s', reason, request_id)
            cfnresponse.send(event, context, cfnresponse.SUCCESS, {'Reason': reason}, parameter_arn)
        else:
            log.error('SMTP Lambda failed: reason=%s, request_id=%s', reason, request_id)
            cfnresponse.send(event, context, cfnresponse.FAILED, {'Reason': reason}, parameter_arn)
            
    except Exception as e:
        error_msg = f"SMTP Lambda error: {str(e)}"
        log.error('%s: request_id=%s', error_msg, request_id, exc_info=True)
        cfnresponse.send(event, context, cfnresponse.FAILED, {'Reason': error_msg}, 'unknown')
      `),
      environment: {
        STACK_NAME: this.stackName,
        AWS_ACCOUNT_ID: this.account,
        // Note: AWS_REGION is automatically set by Lambda runtime - don't set it manually
      },
    });

    // Publish shared values to SSM for decoupled consumption
    new ssm.StringParameter(this, 'ParamDomainName', {
      parameterName: P_DOMAIN_NAME,
      stringValue: domain,
      description: 'Domain name for EMC Notary mailserver',
    });

    new ssm.StringParameter(this, 'ParamBackupBucket', {
      parameterName: P_BACKUP_BUCKET,
      stringValue: backupBucket.bucketName,
      description: 'S3 backup bucket name',
    });

    new ssm.StringParameter(this, 'ParamNextcloudBucket', {
      parameterName: P_NEXTCLOUD_BUCKET,
      stringValue: nextcloudBucket.bucketName,
      description: 'S3 Nextcloud bucket name',
    });

    new ssm.StringParameter(this, 'ParamAlarmsTopic', {
      parameterName: P_ALARMS_TOPIC,
      stringValue: alarmsTopic.topicArn,
      description: 'SNS alarms topic ARN',
    });

    new ssm.StringParameter(this, 'ParamSesIdentityArn', {
      parameterName: P_SES_IDENTITY_ARN,
      stringValue: identity.emailIdentityArn,
      description: 'SES email identity ARN',
    });

    new ssm.StringParameter(this, 'ParamEipAllocationId', {
      parameterName: P_EIP_ALLOCATION_ID,
      stringValue: eip.attrAllocationId,
      description: 'Elastic IP allocation ID for mail server instance',
    });

    // Outputs matching monolithic stack format
    new CfnOutput(this, 'DomainNameOutput', {
      value: domain,
      description: 'Domain name for mail server',
    });

    new CfnOutput(this, 'SesIdentityArn', {
      value: identity.emailIdentityArn,
      description: 'SES Email Identity ARN',
    });

    new CfnOutput(this, 'BackupBucketName', {
      value: backupBucket.bucketName,
      description: 'S3 Backup Bucket Name',
    });

    new CfnOutput(this, 'AlertTopicArn', {
      value: alarmsTopic.topicArn,
      description: 'SNS Topic ARN for memory and system alerts',
    });

    // DKIM DNS tokens for SES domain verification
    // Note: These are CloudFormation attributes from the EmailIdentity resource
    new CfnOutput(this, 'DkimDNSTokenName1', {
      value: identity.dkimDnsTokenName1,
      description: 'First DKIM DNS token name for SES domain verification',
    });

    new CfnOutput(this, 'DkimDNSTokenValue1', {
      value: identity.dkimDnsTokenValue1,
      description: 'First DKIM DNS token value for SES domain verification',
    });

    new CfnOutput(this, 'DkimDNSTokenName2', {
      value: identity.dkimDnsTokenName2,
      description: 'Second DKIM DNS token name for SES domain verification',
    });

    new CfnOutput(this, 'DkimDNSTokenValue2', {
      value: identity.dkimDnsTokenValue2,
      description: 'Second DKIM DNS token value for SES domain verification',
    });

    new CfnOutput(this, 'DkimDNSTokenName3', {
      value: identity.dkimDnsTokenName3,
      description: 'Third DKIM DNS token name for SES domain verification',
    });

    new CfnOutput(this, 'DkimDNSTokenValue3', {
      value: identity.dkimDnsTokenValue3,
      description: 'Third DKIM DNS token value for SES domain verification',
    });

    // Mail From domain configuration
    const mailFromDomain = `mail.${domain}`;
    new CfnOutput(this, 'MailFromDomain', {
      value: mailFromDomain,
      description: 'Custom MAIL FROM domain name',
    });

    new CfnOutput(this, 'MailFromMXRecord', {
      value: `10 feedback-smtp.${this.region}.amazonses.com`,
      description: 'MX record for custom MAIL FROM domain',
    });

    new CfnOutput(this, 'MailFromTXTRecord', {
      value: 'v=spf1 include:amazonses.com ~all',
      description: 'TXT record for custom MAIL FROM domain',
    });

    new CfnOutput(this, 'ElasticIPAddress', {
      value: eip.ref,
      description: 'The allocated Elastic IP address (persistent across instance updates)',
    });

    new CfnOutput(this, 'ElasticIPAllocationId', {
      value: eip.attrAllocationId,
      description: 'The Elastic IP allocation ID for associating with instances',
    });

    if (centralBackupBucket) {
      new CfnOutput(this, 'CentralBackupBucket', {
        value: centralBackupBucket,
        description: 'Central backup bucket name (from mailservers-backups stack)',
      });
    }
  }
}
