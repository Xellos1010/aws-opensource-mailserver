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

// apps/cdk-emcnotary-core/src/stacks/core-stack.ts
var EmcNotaryCoreStack = class extends import_aws_cdk_lib3.Stack {
  constructor(scope, id, props) {
    super(scope, id, props);
    tagStack(this, "emcnotary-mailserver");
    const domainName = new import_aws_cdk_lib3.CfnParameter(this, "DomainName", {
      type: "String",
      default: "emcnotary.com",
      description: "The domain name for the mail server resources",
      allowedPattern: "^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$"
    });
    const domain = domainName.valueAsString;
    const identity = new import_aws_cdk_lib3.aws_ses.EmailIdentity(this, "SesIdentity", {
      identity: import_aws_cdk_lib3.aws_ses.Identity.domain(domain),
      dkimSigning: true,
      mailFromDomain: `mail.${domain}`
    });
    const backupBucket = new import_aws_cdk_lib3.aws_s3.Bucket(this, "BackupBucket", {
      bucketName: `${domain}-backup`,
      removalPolicy: import_aws_cdk_lib3.RemovalPolicy.RETAIN,
      versioned: true,
      blockPublicAccess: import_aws_cdk_lib3.aws_s3.BlockPublicAccess.BLOCK_ALL,
      encryption: import_aws_cdk_lib3.aws_s3.BucketEncryption.S3_MANAGED
    });
    const nextcloudBucket = new import_aws_cdk_lib3.aws_s3.Bucket(this, "NextcloudBucket", {
      bucketName: `${domain}-nextcloud`,
      removalPolicy: import_aws_cdk_lib3.RemovalPolicy.RETAIN,
      versioned: true,
      blockPublicAccess: import_aws_cdk_lib3.aws_s3.BlockPublicAccess.BLOCK_ALL,
      encryption: import_aws_cdk_lib3.aws_s3.BucketEncryption.S3_MANAGED
    });
    const alarmsTopic = new import_aws_cdk_lib3.aws_sns.Topic(this, "AlertTopic", {
      topicName: `ec2-memory-events-${this.stackName}`,
      displayName: "EMC Notary Mailserver Alarms"
    });
    const syslogGroup = new import_aws_cdk_lib3.aws_logs.LogGroup(this, "SyslogGroup", {
      logGroupName: `/ec2/syslog-${this.stackName}`,
      retention: import_aws_cdk_lib3.aws_logs.RetentionDays.ONE_WEEK,
      removalPolicy: import_aws_cdk_lib3.RemovalPolicy.DESTROY
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
      stringValue: domain,
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
    new import_aws_cdk_lib3.CfnOutput(this, "DomainNameOutput", {
      value: domain,
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
    new import_aws_cdk_lib3.CfnOutput(this, "AlarmsTopicArn", {
      value: alarmsTopic.topicArn,
      description: "SNS Alarms Topic ARN"
    });
  }
};

// apps/cdk-emcnotary-core/src/main.ts
var app = new cdk.App();
new EmcNotaryCoreStack(app, "emcnotary-mailserver-core", {
  env: {
    account: process.env["CDK_DEFAULT_ACCOUNT"],
    region: process.env["CDK_DEFAULT_REGION"] || "us-east-1"
  },
  description: "EMC Notary Mailserver \u2013 Core stack (Route53/SES/S3/SNS/CloudWatch/SSM params)"
});
app.synth();
//# sourceMappingURL=main.cjs.map
