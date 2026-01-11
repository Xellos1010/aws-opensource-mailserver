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
 * Mail Health Check Lambda - Checks postfix/dovecot service status via SSM
 *
 * Primary checks: service status (postfix, dovecot) - these determine health
 * Secondary checks: port connectivity (informational only - AWS may restrict port 25)
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
      roleName: `MailHealthCheckLambda-${stack.stackName}`,
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
      logGroupName: `/aws/lambda/mail-health-check-${stack.stackName}`,
      retention: logs.RetentionDays.ONE_MONTH,
      removalPolicy: RemovalPolicy.DESTROY,
    });

    // Lambda Function
    this.lambda = new lambda.Function(this, 'Function', {
      functionName: `mail-health-check-${stack.stackName}`,
      description: 'Checks mail service health (postfix/dovecot) via SSM - port checks are informational only',
      runtime: lambda.Runtime.PYTHON_3_11,
      handler: 'index.handler',
      code: lambda.Code.fromInline(`
import boto3
import json
import time
import os

ssm = boto3.client('ssm')
ec2 = boto3.client('ec2')

def check_mail_services(instance_id):
    """
    Check mail service health via SSM.
    Primary checks: service status (postfix, dovecot) - these determine health
    Secondary checks: port connectivity (informational only - AWS may restrict port 25)
    """
    
    # Primary health checks - service status (these determine health)
    primary_checks = {
        'postfix': 'systemctl is-active postfix',
        'dovecot': 'systemctl is-active dovecot',
        'mail_queue': 'mailq | head -1 || echo "empty"'
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
        'healthy': False,
        'health_reason': ''
    }
    
    # Check primary services (these determine health)
    all_primary_healthy = True
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
            
            if service in ['postfix', 'dovecot']:
                is_active = stdout == 'active'
                results['primary'][service] = {
                    'status': 'active' if is_active else 'inactive',
                    'raw': stdout
                }
                if not is_active:
                    all_primary_healthy = False
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
            if service in ['postfix', 'dovecot']:
                all_primary_healthy = False
    
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
    
    # Determine overall health based on primary checks only
    results['healthy'] = all_primary_healthy
    if all_primary_healthy:
        results['health_reason'] = 'All primary services (postfix, dovecot) are active'
    else:
        inactive = [s for s, v in results['primary'].items() 
                   if s in ['postfix', 'dovecot'] and v.get('status') != 'active']
        results['health_reason'] = f'Services inactive: {", ".join(inactive)}'
    
    return results

def handler(event, context):
    instance_id = os.environ.get('INSTANCE_ID')
    
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

