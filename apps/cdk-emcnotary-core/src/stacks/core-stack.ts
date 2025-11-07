import {
  Stack,
  StackProps,
  CfnOutput,
  CfnParameter,
  aws_s3 as s3,
  aws_sns as sns,
  aws_ssm as ssm,
  aws_ses as ses,
  aws_logs as logs,
  aws_lambda as lambda,
  aws_iam as iam,
  RemovalPolicy,
  Duration,
} from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { tagStack } from '@mm/infra-shared-constructs';
import {
  P_DOMAIN_NAME,
  P_BACKUP_BUCKET,
  P_NEXTCLOUD_BUCKET,
  P_ALARMS_TOPIC,
  P_SES_IDENTITY_ARN,
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

    // SES domain identity + DKIM (no Route53 hosted zone - uses domain name directly)
    const identity = new ses.EmailIdentity(this, 'SesIdentity', {
      identity: ses.Identity.domain(domain),
      dkimSigning: true,
      mailFromDomain: `mail.${domain}`,
    });

    // S3 Buckets: backup and nextcloud (matching CloudFormation template)
    const backupBucket = new s3.Bucket(this, 'BackupBucket', {
      bucketName: `${domain}-backup`,
      removalPolicy: RemovalPolicy.RETAIN,
      versioned: true,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
    });

    const nextcloudBucket = new s3.Bucket(this, 'NextcloudBucket', {
      bucketName: `${domain}-nextcloud`,
      removalPolicy: RemovalPolicy.RETAIN,
      versioned: true,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
    });

    // SNS Alarms topic (matching CloudFormation AlertTopic)
    const alarmsTopic = new sns.Topic(this, 'AlertTopic', {
      topicName: `ec2-memory-events-${this.stackName}`,
      displayName: 'EMC Notary Mailserver Alarms',
    });

    // CloudWatch Log Group for syslog (matching CloudFormation SyslogGroup)
    const syslogGroup = new logs.LogGroup(this, 'SyslogGroup', {
      logGroupName: `/ec2/syslog-${this.stackName}`,
      retention: logs.RetentionDays.ONE_WEEK,
      removalPolicy: RemovalPolicy.DESTROY,
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
      runtime: lambda.Runtime.PYTHON_3_8,
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

logging.basicConfig(level=logging.DEBUG)
log = logging.getLogger(__name__)
region = os.environ['AWS_REGION']
ssm = boto3.client('ssm',region_name=region)

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
    log.debug('%s', event)
    stack_name = os.environ.get('STACK_NAME', '')
    parameter_type = event['ResourceProperties']['ParameterType']
    parameter_arn = "arn:aws:ssm:"+region+":"+os.environ.get('AWS_ACCOUNT_ID', '')+":parameter/smtp-"+parameter_type+"-"+stack_name
    key = event['ResourceProperties']['Key']
    proceed = "True"

    if event['RequestType'] == 'Create':
        if parameter_type == 'username':
            proceed = put_parameter(key, parameter_type, stack_name)
        elif parameter_type == 'password':
            pwd = calculate_key(key, region)
            proceed = put_parameter(pwd, parameter_type, stack_name)
        reason = "Created SMTP "+parameter_type
    elif event['RequestType'] == 'Update':
        if parameter_type == 'username':
            proceed = put_parameter(key, parameter_type, stack_name)
        elif parameter_type == 'password':
            pwd = calculate_key(key, region)
            proceed = put_parameter(pwd, parameter_type, stack_name)
        reason = "Updated SMTP "+parameter_type
    elif event['RequestType'] == 'Delete':
        proceed = delete_smtp_credentials(parameter_type, stack_name)
        reason = "Deleted SMTP "+parameter_type
    else:
        proceed = False
        reason = "Operation %s is unsupported" % (event['RequestType'])

    if proceed:
        cfnresponse.send(event, context, cfnresponse.SUCCESS, {'Reason': reason}, parameter_arn)
    else:
        cfnresponse.send(event, context, cfnresponse.FAILED, {'Reason': reason}, parameter_arn)
      `),
      environment: {
        STACK_NAME: this.stackName,
        AWS_ACCOUNT_ID: this.account,
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
  }
}
