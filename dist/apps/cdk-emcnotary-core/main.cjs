#!/usr/bin/env node
"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// apps/cdk-emcnotary-core/src/main.ts
var cdk = __toESM(require("aws-cdk-lib"));

// apps/cdk-emcnotary-core/src/stacks/core-stack.ts
var import_aws_cdk_lib3 = require("aws-cdk-lib");
var import_custom_resources = require("aws-cdk-lib/custom-resources");

// libs/infra/shared-constructs/src/lib/alarms.ts
var import_constructs = require("constructs");
var import_aws_cdk_lib = require("aws-cdk-lib");

// libs/infra/shared-constructs/src/lib/tags.ts
var import_aws_cdk_lib2 = require("aws-cdk-lib");
function tagStack(stack, app2) {
  import_aws_cdk_lib2.Tags.of(stack).add("App", app2);
  import_aws_cdk_lib2.Tags.of(stack).add("ManagedBy", "Nx+CDK");
  import_aws_cdk_lib2.Tags.of(stack).add("Environment", process.env["ENVIRONMENT"] || "dev");
}

// libs/infra/core-params/src/lib/core-params.ts
var CORE_PARAM_PREFIX = "/emcnotary/core";
var P_DOMAIN_NAME = `${CORE_PARAM_PREFIX}/domainName`;
var P_BACKUP_BUCKET = `${CORE_PARAM_PREFIX}/backupBucket`;
var P_NEXTCLOUD_BUCKET = `${CORE_PARAM_PREFIX}/nextcloudBucket`;
var P_ALARMS_TOPIC = `${CORE_PARAM_PREFIX}/alarmsTopicArn`;
var P_SES_IDENTITY_ARN = `${CORE_PARAM_PREFIX}/sesIdentityArn`;
var P_EIP_ALLOCATION_ID = `${CORE_PARAM_PREFIX}/eipAllocationId`;

// apps/cdk-emcnotary-core/src/stacks/core-stack.ts
var EmcNotaryCoreStack = class extends import_aws_cdk_lib3.Stack {
  constructor(scope, id, props) {
    super(scope, id, props);
    tagStack(this, "emcnotary-mailserver");
    const domainName2 = new import_aws_cdk_lib3.CfnParameter(this, "DomainName", {
      type: "String",
      default: "emcnotary.com",
      description: "The domain name for the mail server resources",
      allowedPattern: "^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$"
    });
    const domain2 = domainName2.valueAsString;
    const eip = new import_aws_cdk_lib3.aws_ec2.CfnEIP(this, "ElasticIP", {
      domain: "vpc",
      tags: [
        {
          key: "MAILSERVER",
          value: domain2
        }
      ]
    });
    const reverseDnsLambdaRole = new import_aws_cdk_lib3.aws_iam.Role(this, "ReverseDnsLambdaExecutionRole", {
      roleName: `ReverseDnsLambdaExecutionRole-${this.stackName}`,
      description: "Role assumed by Lambda to set reverse DNS on Elastic IP",
      assumedBy: new import_aws_cdk_lib3.aws_iam.ServicePrincipal("lambda.amazonaws.com"),
      managedPolicies: [
        import_aws_cdk_lib3.aws_iam.ManagedPolicy.fromAwsManagedPolicyName(
          "service-role/AWSLambdaBasicExecutionRole"
        )
      ]
    });
    reverseDnsLambdaRole.addToPolicy(
      new import_aws_cdk_lib3.aws_iam.PolicyStatement({
        actions: ["ec2:ModifyAddressAttribute", "ec2:DescribeAddresses"],
        resources: ["*"]
        // EIP resources don't support resource-level permissions
      })
    );
    const reverseDnsLambda = new import_aws_cdk_lib3.aws_lambda.Function(this, "ReverseDnsLambdaFunction", {
      functionName: `ReverseDnsLambdaFunction-${this.stackName}`,
      runtime: import_aws_cdk_lib3.aws_lambda.Runtime.PYTHON_3_11,
      handler: "index.lambda_handler",
      role: reverseDnsLambdaRole,
      timeout: import_aws_cdk_lib3.Duration.seconds(30),
      memorySize: 128,
      code: import_aws_cdk_lib3.aws_lambda.Code.fromInline(`
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
      `)
      // Note: AWS_REGION is automatically set by Lambda runtime - don't set it manually
    });
    const reverseDnsProvider = new import_custom_resources.Provider(this, "ReverseDnsProvider", {
      onEventHandler: reverseDnsLambda
    });
    const ptrRecord = `box.${domain2}`;
    new import_aws_cdk_lib3.CustomResource(this, "ReverseDnsResource", {
      serviceToken: reverseDnsProvider.serviceToken,
      properties: {
        AllocationId: eip.attrAllocationId,
        PtrRecord: ptrRecord
      }
    });
    const identity = new import_aws_cdk_lib3.aws_ses.EmailIdentity(this, "SesIdentity", {
      identity: import_aws_cdk_lib3.aws_ses.Identity.domain(domain2),
      dkimSigning: true,
      mailFromDomain: `mail.${domain2}`
    });
    const backupBucket = new import_aws_cdk_lib3.aws_s3.Bucket(this, "BackupBucket", {
      bucketName: `${domain2}-backup`,
      removalPolicy: import_aws_cdk_lib3.RemovalPolicy.DESTROY,
      // Delete bucket on stack deletion
      versioned: true,
      blockPublicAccess: import_aws_cdk_lib3.aws_s3.BlockPublicAccess.BLOCK_ALL,
      encryption: import_aws_cdk_lib3.aws_s3.BucketEncryption.S3_MANAGED,
      autoDeleteObjects: true
      // Auto-delete objects when stack is deleted
    });
    const nextcloudBucket = new import_aws_cdk_lib3.aws_s3.Bucket(this, "NextcloudBucket", {
      bucketName: `${domain2}-nextcloud`,
      removalPolicy: import_aws_cdk_lib3.RemovalPolicy.DESTROY,
      // Delete bucket on stack deletion
      versioned: true,
      blockPublicAccess: import_aws_cdk_lib3.aws_s3.BlockPublicAccess.BLOCK_ALL,
      encryption: import_aws_cdk_lib3.aws_s3.BucketEncryption.S3_MANAGED,
      autoDeleteObjects: true
      // Auto-delete objects when stack is deleted
    });
    const centralBackupBucket = this.node.tryGetContext("centralBackupBucket") || process.env["CENTRAL_BACKUP_BUCKET"] || void 0;
    const alarmsTopic = new import_aws_cdk_lib3.aws_sns.Topic(this, "AlertTopic", {
      topicName: `ec2-memory-events-${this.stackName}`,
      displayName: "EMC Notary Mailserver Alarms"
    });
    const syslogGroup = new import_aws_cdk_lib3.aws_logs.LogGroup(this, "SyslogGroup", {
      logGroupName: `/ec2/syslog-${this.stackName}`,
      retention: import_aws_cdk_lib3.aws_logs.RetentionDays.ONE_WEEK,
      removalPolicy: import_aws_cdk_lib3.RemovalPolicy.DESTROY
      // Delete logs when stack is deleted
    });
    const cwAgentConfig = new import_aws_cdk_lib3.aws_ssm.StringParameter(this, "CWAgentConfigParam", {
      parameterName: `/cwagent-linux-${this.stackName}`,
      stringValue: JSON.stringify({
        agent: {
          metrics_collection_interval: 60,
          run_as_user: "root"
        },
        metrics: {
          append_dimensions: {
            InstanceId: "${aws:InstanceId}"
          },
          metrics_collected: {
            mem: {
              measurement: ["mem_used_percent", "mem_available"],
              metrics_collection_interval: 60
            },
            swap: {
              measurement: ["swap_used_percent"],
              metrics_collection_interval: 60
            }
          }
        },
        logs: {
          logs_collected: {
            files: {
              collect_list: [
                {
                  file_path: "/var/log/syslog",
                  log_group_name: `/ec2/syslog-${this.stackName}`,
                  log_stream_name: "{instance_id}"
                }
              ]
            }
          }
        }
      }),
      description: "CloudWatch Agent configuration for mail server"
    });
    const smtpLambdaRole = new import_aws_cdk_lib3.aws_iam.Role(this, "SmtpLambdaExecutionRole", {
      roleName: `SMTPLambdaExecutionRole-${this.stackName}`,
      description: "Role assumed by Lambda to generate SMTP credentials",
      assumedBy: new import_aws_cdk_lib3.aws_iam.ServicePrincipal("lambda.amazonaws.com"),
      managedPolicies: [
        import_aws_cdk_lib3.aws_iam.ManagedPolicy.fromAwsManagedPolicyName(
          "service-role/AWSLambdaBasicExecutionRole"
        )
      ]
    });
    smtpLambdaRole.addToPolicy(
      new import_aws_cdk_lib3.aws_iam.PolicyStatement({
        actions: ["ssm:PutParameter", "ssm:DeleteParameter"],
        resources: [
          `arn:aws:ssm:${this.region}:${this.account}:parameter/smtp-username-${this.stackName}`,
          `arn:aws:ssm:${this.region}:${this.account}:parameter/smtp-password-${this.stackName}`
        ]
      })
    );
    const smtpLambda = new import_aws_cdk_lib3.aws_lambda.Function(this, "SmtpLambdaFunction", {
      functionName: `SMTPCredentialsLambdaFunction-${this.stackName}`,
      runtime: import_aws_cdk_lib3.aws_lambda.Runtime.PYTHON_3_8,
      handler: "index.lambda_handler",
      role: smtpLambdaRole,
      timeout: import_aws_cdk_lib3.Duration.seconds(30),
      memorySize: 128,
      code: import_aws_cdk_lib3.aws_lambda.Code.fromInline(`
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
        AWS_ACCOUNT_ID: this.account
      }
    });
    new import_aws_cdk_lib3.aws_ssm.StringParameter(this, "ParamDomainName", {
      parameterName: P_DOMAIN_NAME,
      stringValue: domain2,
      description: "Domain name for EMC Notary mailserver"
    });
    new import_aws_cdk_lib3.aws_ssm.StringParameter(this, "ParamBackupBucket", {
      parameterName: P_BACKUP_BUCKET,
      stringValue: backupBucket.bucketName,
      description: "S3 backup bucket name"
    });
    new import_aws_cdk_lib3.aws_ssm.StringParameter(this, "ParamNextcloudBucket", {
      parameterName: P_NEXTCLOUD_BUCKET,
      stringValue: nextcloudBucket.bucketName,
      description: "S3 Nextcloud bucket name"
    });
    new import_aws_cdk_lib3.aws_ssm.StringParameter(this, "ParamAlarmsTopic", {
      parameterName: P_ALARMS_TOPIC,
      stringValue: alarmsTopic.topicArn,
      description: "SNS alarms topic ARN"
    });
    new import_aws_cdk_lib3.aws_ssm.StringParameter(this, "ParamSesIdentityArn", {
      parameterName: P_SES_IDENTITY_ARN,
      stringValue: identity.emailIdentityArn,
      description: "SES email identity ARN"
    });
    new import_aws_cdk_lib3.aws_ssm.StringParameter(this, "ParamEipAllocationId", {
      parameterName: P_EIP_ALLOCATION_ID,
      stringValue: eip.attrAllocationId,
      description: "Elastic IP allocation ID for mail server instance"
    });
    new import_aws_cdk_lib3.CfnOutput(this, "DomainNameOutput", {
      value: domain2,
      description: "Domain name for mail server"
    });
    new import_aws_cdk_lib3.CfnOutput(this, "SesIdentityArn", {
      value: identity.emailIdentityArn,
      description: "SES Email Identity ARN"
    });
    new import_aws_cdk_lib3.CfnOutput(this, "BackupBucketName", {
      value: backupBucket.bucketName,
      description: "S3 Backup Bucket Name"
    });
    new import_aws_cdk_lib3.CfnOutput(this, "AlertTopicArn", {
      value: alarmsTopic.topicArn,
      description: "SNS Topic ARN for memory and system alerts"
    });
    new import_aws_cdk_lib3.CfnOutput(this, "DkimDNSTokenName1", {
      value: identity.dkimDnsTokenName1,
      description: "First DKIM DNS token name for SES domain verification"
    });
    new import_aws_cdk_lib3.CfnOutput(this, "DkimDNSTokenValue1", {
      value: identity.dkimDnsTokenValue1,
      description: "First DKIM DNS token value for SES domain verification"
    });
    new import_aws_cdk_lib3.CfnOutput(this, "DkimDNSTokenName2", {
      value: identity.dkimDnsTokenName2,
      description: "Second DKIM DNS token name for SES domain verification"
    });
    new import_aws_cdk_lib3.CfnOutput(this, "DkimDNSTokenValue2", {
      value: identity.dkimDnsTokenValue2,
      description: "Second DKIM DNS token value for SES domain verification"
    });
    new import_aws_cdk_lib3.CfnOutput(this, "DkimDNSTokenName3", {
      value: identity.dkimDnsTokenName3,
      description: "Third DKIM DNS token name for SES domain verification"
    });
    new import_aws_cdk_lib3.CfnOutput(this, "DkimDNSTokenValue3", {
      value: identity.dkimDnsTokenValue3,
      description: "Third DKIM DNS token value for SES domain verification"
    });
    const mailFromDomain = `mail.${domain2}`;
    new import_aws_cdk_lib3.CfnOutput(this, "MailFromDomain", {
      value: mailFromDomain,
      description: "Custom MAIL FROM domain name"
    });
    new import_aws_cdk_lib3.CfnOutput(this, "MailFromMXRecord", {
      value: `10 feedback-smtp.${this.region}.amazonses.com`,
      description: "MX record for custom MAIL FROM domain"
    });
    new import_aws_cdk_lib3.CfnOutput(this, "MailFromTXTRecord", {
      value: "v=spf1 include:amazonses.com ~all",
      description: "TXT record for custom MAIL FROM domain"
    });
    new import_aws_cdk_lib3.CfnOutput(this, "ElasticIPAddress", {
      value: eip.ref,
      description: "The allocated Elastic IP address (persistent across instance updates)"
    });
    new import_aws_cdk_lib3.CfnOutput(this, "ElasticIPAllocationId", {
      value: eip.attrAllocationId,
      description: "The Elastic IP allocation ID for associating with instances"
    });
    if (centralBackupBucket) {
      new import_aws_cdk_lib3.CfnOutput(this, "CentralBackupBucket", {
        value: centralBackupBucket,
        description: "Central backup bucket name (from mailservers-backups stack)"
      });
    }
  }
};

// apps/cdk-emcnotary-core/src/main.ts
var app = new cdk.App();
var defaultDomain = "emcnotary.com";
var domain = process.env["DOMAIN"] || defaultDomain;
var domainName = domain.replace(/\./g, "-");
var stackName = `${domainName}-mailserver-core`;
new EmcNotaryCoreStack(app, stackName, {
  env: {
    account: process.env["CDK_DEFAULT_ACCOUNT"],
    region: process.env["CDK_DEFAULT_REGION"] || "us-east-1"
  },
  description: "EMC Notary Mailserver \u2013 Core stack (SES/S3/SNS/CloudWatch/SSM params)"
  // Optional: Pass central backup bucket if mailservers-backups stack exists
  // This can be set via environment variable or CDK context
  // If not provided, core stack will work without it
});
app.synth();
//# sourceMappingURL=main.cjs.map
