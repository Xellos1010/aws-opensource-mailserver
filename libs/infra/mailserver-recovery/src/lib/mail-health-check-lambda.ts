import { Construct } from 'constructs';
import {
  Stack,
  aws_lambda as lambda,
  aws_iam as iam,
  aws_events as events,
  aws_events_targets as targets,
  aws_sns as sns,
  Duration,
  RemovalPolicy,
  aws_logs as logs,
} from 'aws-cdk-lib';

export interface MailHealthCheckLambdaProps {
  /** EC2 instance ID to check */
  instanceId: string;
  /** Domain name for resource naming */
  domainName: string;
  /** EventBridge schedule expression (default: every 5 minutes) */
  scheduleExpression?: string;
  /** SNS topic for notifications (optional) */
  notificationTopic?: sns.ITopic;
  /** Timeout in seconds (default: 30) */
  timeout?: Duration;
  /** Memory size in MB (default: 256) */
  memorySize?: number;
}

/**
 * Mail Health Check Lambda - Checks Mail-in-a-Box service health via SSM
 *
 * Primary checks: postfix/dovecot/mailinabox + mailbox permissions + admin endpoint
 * Secondary checks: disk usage + local port connectivity
 */
export class MailHealthCheckLambda extends Construct {
  public readonly lambda: lambda.Function;
  public readonly scheduleRule?: events.Rule;

  constructor(scope: Construct, id: string, props: MailHealthCheckLambdaProps) {
    super(scope, id);

    const {
      instanceId,
      domainName,
      scheduleExpression = 'rate(5 minutes)',
      notificationTopic,
      timeout = Duration.seconds(30),
      memorySize = 256,
    } = props;

    // IAM Role - Use construct ID for naming (domainName is a token from SSM)
    const stack = Stack.of(this);
    const role = new iam.Role(this, 'Role', {
      description: 'Role for mail service health check Lambda',
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName(
          'service-role/AWSLambdaBasicExecutionRole'
        ),
      ],
    });

    role.addToPolicy(
      new iam.PolicyStatement({
        actions: [
          'ssm:SendCommand',
          'ssm:GetCommandInvocation',
          'ssm:DescribeInstanceInformation',
          'ec2:DescribeInstances',
          'cloudwatch:PutMetricData',
        ],
        resources: ['*'],
      })
    );

    role.addToPolicy(
      new iam.PolicyStatement({
        actions: [
          'logs:CreateLogGroup',
          'logs:CreateLogStream',
          'logs:PutLogEvents',
        ],
        resources: ['arn:aws:logs:*:*:*'],
      })
    );

    // CloudWatch Log Group
    const logGroup = new logs.LogGroup(this, 'LogGroup', {
      retention: logs.RetentionDays.ONE_MONTH,
      removalPolicy: RemovalPolicy.DESTROY,
    });

    // Lambda Function
    this.lambda = new lambda.Function(this, 'Function', {
      description: 'Checks Mail-in-a-Box service health (postfix/dovecot/mailinabox/admin) via SSM',
      runtime: lambda.Runtime.PYTHON_3_11,
      handler: 'index.handler',
      code: lambda.Code.fromInline(`
import boto3
import json
import time
import os
from datetime import datetime

ssm = boto3.client('ssm')
cloudwatch = boto3.client('cloudwatch')

METRICS_NAMESPACE = 'MailServer/Health'
ADMIN_TIMEOUT_SECONDS = 10
DISK_CRITICAL_PERCENT = 95

def parse_admin_healthy(raw_status):
    if raw_status in ['timeout', '', None]:
        return False

    try:
        status_code = int(raw_status)
    except (TypeError, ValueError):
        return False

    # 2xx/3xx and auth challenge responses mean admin responded.
    return 200 <= status_code < 500

def check_mail_services(instance_id):
    """
    Check mail service health via SSM.
    Primary checks: postfix/dovecot/mailinabox + mailbox permissions + admin endpoint.
    Secondary checks: disk usage + local port connectivity.
    """
    
    domain_name = os.environ.get('DOMAIN_NAME', '')
    mailbox_permission_cmd = (
        f'DOMAIN_NAME="{domain_name}"; '
        'ROOT="/home/user-data/mail/mailboxes/$DOMAIN_NAME"; '
        'if [ -z "$DOMAIN_NAME" ]; then echo "skip"; '
        'elif [ ! -d "$ROOT" ]; then echo "missing"; '
        'else '
        'OWN=$(stat -c "%U:%G" "$ROOT" 2>/dev/null || echo unknown); '
        'PERM=$(stat -c "%a" "$ROOT" 2>/dev/null || echo 000); '
        'if [ "$OWN" = "mail:mail" ] && [ "$PERM" = "755" ]; then echo "ok"; '
        'else echo "bad:$OWN:$PERM"; fi; '
        'fi'
    )

    # Primary health checks - these drive MailPrimaryHealthy metric.
    primary_checks = {
        'postfix': 'systemctl is-active postfix',
        'dovecot': 'systemctl is-active dovecot',
        'mailinabox_service': 'systemctl is-active mailinabox',
        'mailbox_root_permissions': mailbox_permission_cmd,
        'mail_queue': 'mailq | head -1 || echo "empty"',
        'admin_endpoint': f'curl -sk --max-time {ADMIN_TIMEOUT_SECONDS} -o /dev/null -w "%{{http_code}}" https://127.0.0.1/admin || echo timeout',
        'disk_usage_percent': "df / | awk 'NR==2{gsub(/%/, \\"\\", $5); print $5}'"
    }
    
    # Secondary checks - port connectivity (informational, non-blocking)
    # Note: AWS may restrict port 25, so these are informational only
    port_checks = {
        'smtp_25': 'timeout 3 bash -c "</dev/tcp/localhost/25" 2>/dev/null && echo "open" || echo "restricted_or_closed"',
        'smtp_587': 'timeout 3 bash -c "</dev/tcp/localhost/587" 2>/dev/null && echo "open" || echo "restricted_or_closed"',
        'imap_993': 'timeout 3 bash -c "</dev/tcp/localhost/993" 2>/dev/null && echo "open" || echo "restricted_or_closed"'
    }
    
    results = {
        'primary': {},
        'ports': {},
        'metrics': {
            'admin_endpoint_healthy': 0,
            'disk_usage_percent': 100,
            'mail_primary_healthy': 0,
        },
        'healthy': False,
        'health_reason': '',
        'timestamp': datetime.utcnow().strftime('%Y-%m-%dT%H:%M:%SZ')
    }
    
    # Mail primary health is intentionally separate from disk pressure.
    mail_primary_healthy = True
    disk_ok = True
    for service, command in primary_checks.items():
        try:
            response = ssm.send_command(
                InstanceIds=[instance_id],
                DocumentName="AWS-RunShellScript",
                Parameters={'commands': [command]},
                TimeoutSeconds=30
            )
            # Extract CommandId from nested response structure
            if 'Command' in response and 'CommandId' in response['Command']:
                command_id = response['Command']['CommandId']
            elif 'CommandId' in response:
                command_id = response['CommandId']
            else:
                raise Exception(f'No CommandId in response: {response}')
            
            # Wait for command completion (poll up to 10 seconds)
            max_wait = 10
            waited = 0
            while waited < max_wait:
                time.sleep(1)
                waited += 1
                output = ssm.get_command_invocation(
                    CommandId=command_id,
                    InstanceId=instance_id
                )
                if output.get('Status') in ['Success', 'Failed', 'TimedOut', 'Cancelled']:
                    break
            
            stdout = output.get('StandardOutputContent', '').strip()
            
            if service in ['postfix', 'dovecot', 'mailinabox_service']:
                is_active = stdout == 'active'
                results['primary'][service] = {
                    'status': 'active' if is_active else 'inactive',
                    'raw': stdout
                }
                if not is_active:
                    mail_primary_healthy = False
            elif service == 'mailbox_root_permissions':
                permission_ok = stdout in ['ok', 'skip']
                results['primary'][service] = {
                    'status': 'ok' if permission_ok else 'error',
                    'raw': stdout
                }
                if not permission_ok:
                    mail_primary_healthy = False
            elif service == 'admin_endpoint':
                admin_healthy = parse_admin_healthy(stdout)
                results['primary'][service] = {
                    'status': 'healthy' if admin_healthy else 'unhealthy',
                    'raw': stdout,
                    'timeout_seconds': ADMIN_TIMEOUT_SECONDS
                }
                results['metrics']['admin_endpoint_healthy'] = 1 if admin_healthy else 0
                if not admin_healthy:
                    mail_primary_healthy = False
            elif service == 'disk_usage_percent':
                try:
                    disk_percent = int(stdout)
                except (TypeError, ValueError):
                    disk_percent = 100
                disk_ok = disk_percent < DISK_CRITICAL_PERCENT
                results['primary'][service] = {
                    'status': 'ok' if disk_ok else 'critical',
                    'usage_percent': disk_percent,
                    'raw': stdout
                }
                results['metrics']['disk_usage_percent'] = disk_percent
                if not disk_ok:
                    disk_ok = False
            else:  # mail_queue
                results['primary'][service] = {
                    'status': 'ok' if stdout and stdout != 'empty' else 'empty',
                    'raw': stdout[:100] if stdout else 'empty'  # Limit output
                }
                
        except Exception as e:
            print(f"Error checking {service}: {str(e)}")
            results['primary'][service] = {
                'status': 'error',
                'error': str(e)
            }
            if service in ['postfix', 'dovecot', 'mailinabox_service', 'mailbox_root_permissions', 'admin_endpoint']:
                mail_primary_healthy = False
            if service == 'disk_usage_percent':
                disk_ok = False
    
    # Check ports (informational only - don't affect health status)
    for port_name, command in port_checks.items():
        try:
            response = ssm.send_command(
                InstanceIds=[instance_id],
                DocumentName="AWS-RunShellScript",
                Parameters={'commands': [command]},
                TimeoutSeconds=30
            )
            # Extract CommandId from nested response structure
            if 'Command' in response and 'CommandId' in response['Command']:
                command_id = response['Command']['CommandId']
            elif 'CommandId' in response:
                command_id = response['CommandId']
            else:
                raise Exception(f'No CommandId in response: {response}')
            time.sleep(2)  # Brief wait for port check
            output = ssm.get_command_invocation(
                CommandId=command_id,
                InstanceId=instance_id
            )
            stdout = output.get('StandardOutputContent', '').strip()
            results['ports'][port_name] = {
                'status': stdout,
                'note': 'informational_only_aws_may_restrict'
            }
        except Exception as e:
            results['ports'][port_name] = {
                'status': 'check_failed',
                'error': str(e),
                'note': 'informational_only_aws_may_restrict'
            }
    
    # Determine overall health:
    # - MailPrimaryHealthy is only service/admin related
    # - Disk usage is tracked separately by DiskUsagePercent alarm
    results['metrics']['mail_primary_healthy'] = 1 if mail_primary_healthy else 0
    results['healthy'] = mail_primary_healthy and disk_ok

    unhealthy_checks = []
    for check_name, check_result in results['primary'].items():
        status = check_result.get('status')
        if check_name in ['postfix', 'dovecot', 'mailinabox_service'] and status != 'active':
            unhealthy_checks.append(check_name)
        if check_name == 'mailbox_root_permissions' and status != 'ok':
            unhealthy_checks.append(f"{check_name}={check_result.get('raw', 'unknown')}")
        if check_name == 'admin_endpoint' and status != 'healthy':
            unhealthy_checks.append(f"{check_name}={check_result.get('raw', 'unknown')}")
        if check_name == 'disk_usage_percent' and status != 'ok':
            unhealthy_checks.append(f"{check_name}={check_result.get('usage_percent', 'unknown')}%")

    if not unhealthy_checks:
        results['health_reason'] = 'All checks passed (postfix, dovecot, mailinabox, mailbox permissions, admin endpoint, disk usage)'
    else:
        results['health_reason'] = f'Checks failing: {", ".join(unhealthy_checks)}'
    
    return results

def publish_metrics(instance_id, domain_name, health):
    metric_data = [
        {
            'MetricName': 'AdminEndpointHealthy',
            'Value': health['metrics']['admin_endpoint_healthy'],
            'Unit': 'Count',
        },
        {
            'MetricName': 'DiskUsagePercent',
            'Value': health['metrics']['disk_usage_percent'],
            'Unit': 'Percent',
        },
        {
            'MetricName': 'MailPrimaryHealthy',
            'Value': health['metrics']['mail_primary_healthy'],
            'Unit': 'Count',
        },
    ]

    dimensions = [
        {'Name': 'InstanceId', 'Value': instance_id},
        {'Name': 'Domain', 'Value': domain_name},
    ]
    for item in metric_data:
        item['Dimensions'] = dimensions

    cloudwatch.put_metric_data(
        Namespace=METRICS_NAMESPACE,
        MetricData=metric_data
    )

def handler(event, context):
    instance_id = os.environ.get('INSTANCE_ID')
    domain_name = os.environ.get('DOMAIN_NAME', 'unknown')
    
    if not instance_id:
        return {
            'statusCode': 500,
            'body': json.dumps({
                'error': 'INSTANCE_ID environment variable not set',
                'healthy': False
            })
        }
    
    try:
        print(f"Checking mail service health for instance {instance_id}")
        health = check_mail_services(instance_id)
        publish_metrics(instance_id, domain_name, health)
        
        print(f"Health check result: {health['healthy']} - {health['health_reason']}")
        
        return {
            'statusCode': 200,
            'body': json.dumps(health, indent=2)
        }
    except Exception as e:
        print(f"Error in health check: {str(e)}")
        return {
            'statusCode': 500,
            'body': json.dumps({
                'error': str(e),
                'healthy': False,
                'health_reason': f'Health check failed: {str(e)}'
            })
        }
      `),
      role,
      timeout,
      memorySize,
      logGroup,
      environment: {
        INSTANCE_ID: instanceId,
        DOMAIN_NAME: domainName,
      },
    });

    // EventBridge Schedule (if provided)
    if (scheduleExpression) {
      this.scheduleRule = new events.Rule(this, 'ScheduleRule', {
        schedule: events.Schedule.expression(scheduleExpression),
        description: 'Scheduled mail health check',
      });

      this.scheduleRule.addTarget(new targets.LambdaFunction(this.lambda));

      // Grant EventBridge permission to invoke Lambda
      this.lambda.addPermission('EventBridgeInvoke', {
        principal: new iam.ServicePrincipal('events.amazonaws.com'),
        sourceArn: this.scheduleRule.ruleArn,
      });
    }

    // SNS Notification (if provided)
    if (notificationTopic) {
      // Note: SNS notifications should be handled by the calling code
      // or via CloudWatch Alarms that trigger on Lambda errors
      this.lambda.addEnvironment('NOTIFICATION_TOPIC_ARN', notificationTopic.topicArn);
      notificationTopic.grantPublish(this.lambda);
    }
  }
}
