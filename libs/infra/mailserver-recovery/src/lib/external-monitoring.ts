import { Construct } from 'constructs';
import {
  Stack,
  aws_lambda as lambda,
  aws_iam as iam,
  aws_logs as logs,
  aws_events as events,
  aws_events_targets as targets,
  aws_route53 as route53,
  aws_cloudwatch as cw,
  aws_cloudwatch_actions as cwa,
  aws_sns as sns,
  Duration,
  RemovalPolicy,
} from 'aws-cdk-lib';

export interface ExternalMonitoringProps {
  /** EC2 instance ID to monitor */
  instanceId: string;
  /** Domain name for resource naming */
  domainName: string;
  /** Box hostname (e.g., box.emcnotary.com) */
  boxHostname: string;
  /** Emergency restart Lambda ARN (recovery orchestrator) */
  emergencyRestartLambdaArn: string;
  /** SNS topic for alarm notifications (optional) */
  notificationTopic?: sns.ITopic;
  /** Health check interval in seconds (10 or 30, default: 30) */
  healthCheckIntervalSeconds?: number;
  /** Lambda timeout (default: 120 seconds) */
  timeout?: Duration;
  /** Lambda memory size (default: 256 MB) */
  memorySize?: number;
}

/**
 * External Monitoring - Route 53 health checks + proactive health check Lambda
 *
 * Features:
 * - Route 53 HTTPS health check from AWS global infrastructure
 * - Detects zombie instances (EC2 status OK but services unresponsive)
 * - Multi-region health checks
 * - CloudWatch alarm on health check failure
 * - Proactive health check Lambda (runs every 5 minutes)
 * - SSM connectivity check
 * - HTTPS connectivity check
 * - EC2 status check
 * - Publishes custom CloudWatch metrics
 * - Triggers emergency restart on zombie state detection
 */
export class ExternalMonitoring extends Construct {
  public readonly httpsHealthCheck: route53.CfnHealthCheck;
  public readonly httpsHealthCheckAlarm: cw.Alarm;
  public readonly proactiveHealthCheckLambda: lambda.Function;
  public readonly proactiveHealthCheckSchedule: events.Rule;

  constructor(scope: Construct, id: string, props: ExternalMonitoringProps) {
    super(scope, id);

    const {
      instanceId,
      domainName,
      boxHostname,
      emergencyRestartLambdaArn,
      notificationTopic,
      healthCheckIntervalSeconds = 30,
      timeout = Duration.seconds(120),
      memorySize = 256,
    } = props;

    const stack = Stack.of(this);

    // Route 53 Health Check - External HTTPS monitoring
    // This runs from AWS global infrastructure and can detect zombie instances
    this.httpsHealthCheck = new route53.CfnHealthCheck(this, 'HttpsHealthCheck', {
      healthCheckConfig: {
        type: 'HTTPS',
        fullyQualifiedDomainName: boxHostname,
        port: 443,
        resourcePath: '/',
        requestInterval: healthCheckIntervalSeconds,
        failureThreshold: 3, // Fail after 3 consecutive failures
        enableSni: true,
        regions: ['us-east-1', 'us-west-1', 'us-west-2', 'eu-west-1'],
      },
      healthCheckTags: [
        { key: 'Name', value: `HTTPS-${boxHostname}` },
        { key: 'Domain', value: domainName },
        { key: 'Purpose', value: 'Zombie state detection' },
      ],
    });

    // CloudWatch Alarm for HTTPS Health Check
    // Use stack name for alarm name to avoid token resolution issues with boxHostname
    this.httpsHealthCheckAlarm = new cw.Alarm(this, 'HttpsHealthCheckAlarm', {
      alarmName: `HttpsUnhealthy-${stack.stackName}`,
      alarmDescription: `${boxHostname} HTTPS endpoint is unreachable. This detects zombie instances where EC2 status checks pass but web services are down. Triggers automatic instance restart.`,
      metric: new cw.Metric({
        namespace: 'AWS/Route53',
        metricName: 'HealthCheckStatus',
        dimensionsMap: {
          HealthCheckId: this.httpsHealthCheck.ref,
        },
        period: Duration.minutes(1),
        statistic: 'Minimum',
      }),
      threshold: 1,
      evaluationPeriods: 3, // 3 minutes of unhealthy before alarming
      comparisonOperator: cw.ComparisonOperator.LESS_THAN_THRESHOLD,
      treatMissingData: cw.TreatMissingData.BREACHING,
    });

    // Wire HTTPS health check alarm to emergency restart Lambda
    // Create permission using CfnPermission directly to avoid environment token issues
    // Lambda is in same stack, so we reference it by ARN
    new lambda.CfnPermission(this, 'EmergencyRestartLambdaAlarmPermission', {
      functionName: emergencyRestartLambdaArn,
      action: 'lambda:InvokeFunction',
      principal: 'lambda.alarms.cloudwatch.amazonaws.com',
    });

    // Set alarm action directly using escape hatch
    const httpsAlarmCfn = this.httpsHealthCheckAlarm.node.defaultChild as cw.CfnAlarm;
    const alarmActions: string[] = [emergencyRestartLambdaArn];
    if (notificationTopic) {
      alarmActions.push(notificationTopic.topicArn);
    }
    httpsAlarmCfn.addPropertyOverride('AlarmActions', alarmActions);

    // Proactive Health Check Lambda Role
    const proactiveHealthCheckRole = new iam.Role(this, 'ProactiveHealthCheckRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName(
          'service-role/AWSLambdaBasicExecutionRole'
        ),
      ],
    });

    proactiveHealthCheckRole.addToPolicy(
      new iam.PolicyStatement({
        actions: [
          'ssm:DescribeInstanceInformation',
          'ssm:SendCommand',
          'ssm:GetCommandInvocation',
          'ec2:DescribeInstances',
          'ec2:DescribeInstanceStatus',
          'lambda:InvokeFunction',
          'cloudwatch:PutMetricData',
        ],
        resources: ['*'],
      })
    );

    if (notificationTopic) {
      proactiveHealthCheckRole.addToPolicy(
        new iam.PolicyStatement({
          actions: ['sns:Publish'],
          resources: [notificationTopic.topicArn],
        })
      );
    }

    // CloudWatch Log Group for proactive health check
    const proactiveLogGroup = new logs.LogGroup(this, 'ProactiveHealthCheckLogGroup', {
      retention: logs.RetentionDays.ONE_MONTH,
      removalPolicy: RemovalPolicy.DESTROY,
    });

    // Proactive Health Check Lambda
    // Note: Shell script variables (\${VAR}) are escaped to prevent TypeScript template string interpolation
    this.proactiveHealthCheckLambda = new lambda.Function(this, 'ProactiveHealthCheckLambda', {
      description: `Proactive health check that runs every 5 minutes. Detects zombie instances by checking SSM connectivity and service status. Triggers emergency restart if issues persist.`,
      runtime: lambda.Runtime.PYTHON_3_11,
      handler: 'index.handler',
      role: proactiveHealthCheckRole,
      timeout,
      memorySize,
      logGroup: proactiveLogGroup,
      environment: {
        INSTANCE_ID: instanceId,
        DOMAIN_NAME: domainName,
        BOX_HOSTNAME: boxHostname,
        EMERGENCY_RESTART_LAMBDA_ARN: emergencyRestartLambdaArn,
        ALERT_TOPIC_ARN: notificationTopic?.topicArn || '',
      },
      code: lambda.Code.fromInline(`
import boto3
import json
import os
import urllib.request
import ssl
from datetime import datetime

ssm = boto3.client('ssm')
ec2 = boto3.client('ec2')
lambda_client = boto3.client('lambda')
cloudwatch = boto3.client('cloudwatch')
sns = boto3.client('sns')

INSTANCE_ID = os.environ.get('INSTANCE_ID')
DOMAIN_NAME = os.environ.get('DOMAIN_NAME')
BOX_HOSTNAME = os.environ.get('BOX_HOSTNAME')
EMERGENCY_RESTART_LAMBDA_ARN = os.environ.get('EMERGENCY_RESTART_LAMBDA_ARN')
ALERT_TOPIC_ARN = os.environ.get('ALERT_TOPIC_ARN')

def check_ssm_connectivity():
    """Check if SSM agent is online and responsive"""
    try:
        response = ssm.describe_instance_information(
            Filters=[{'Key': 'InstanceIds', 'Values': [INSTANCE_ID]}]
        )
        instances = response.get('InstanceInformationList', [])
        if not instances:
            return {'healthy': False, 'reason': 'Instance not found in SSM'}
        instance = instances[0]
        ping_status = instance.get('PingStatus', 'Unknown')
        last_ping = instance.get('LastPingDateTime')
        if ping_status != 'Online':
            return {
                'healthy': False,
                'reason': f'SSM agent status: {ping_status}',
                'last_ping': str(last_ping) if last_ping else 'Never'
            }
        if last_ping:
            now = datetime.now(last_ping.tzinfo)
            if (now - last_ping).total_seconds() > 600:
                return {
                    'healthy': False,
                    'reason': f'SSM agent last ping was {(now - last_ping).total_seconds() / 60:.1f} minutes ago',
                    'last_ping': str(last_ping)
                }
        return {'healthy': True, 'reason': 'SSM agent is online and responsive'}
    except Exception as e:
        return {'healthy': False, 'reason': f'SSM check error: {str(e)}'}

def check_https_connectivity():
    """Check HTTPS connectivity to box hostname"""
    try:
        ctx = ssl.create_default_context()
        ctx.check_hostname = False
        ctx.verify_mode = ssl.CERT_NONE
        url = f'https://{BOX_HOSTNAME}/'
        req = urllib.request.Request(url, method='HEAD')
        with urllib.request.urlopen(req, timeout=10, context=ctx) as response:
            return {
                'healthy': True,
                'reason': f'HTTPS responding with status {response.status}',
                'status_code': response.status
            }
    except Exception as e:
        return {'healthy': False, 'reason': f'HTTPS check failed: {str(e)}'}

def check_ec2_status():
    """Check EC2 instance status"""
    try:
        response = ec2.describe_instance_status(
            InstanceIds=[INSTANCE_ID],
            IncludeAllInstances=True
        )
        statuses = response.get('InstanceStatuses', [])
        if not statuses:
            return {'healthy': False, 'reason': 'No instance status found'}
        status = statuses[0]
        instance_state = status.get('InstanceState', {}).get('Name', 'unknown')
        system_status = status.get('SystemStatus', {}).get('Status', 'unknown')
        instance_status = status.get('InstanceStatus', {}).get('Status', 'unknown')
        if instance_state != 'running':
            return {
                'healthy': False,
                'reason': f'Instance state is {instance_state}',
                'state': instance_state
            }
        if system_status != 'ok' or instance_status != 'ok':
            return {
                'healthy': False,
                'reason': f'Status checks: system={system_status}, instance={instance_status}',
                'system_status': system_status,
                'instance_status': instance_status
            }
        return {
            'healthy': True,
            'reason': 'EC2 status checks passing',
            'state': instance_state
        }
    except Exception as e:
        return {'healthy': False, 'reason': f'EC2 check error: {str(e)}'}

def publish_metrics(health_results):
    """Publish custom CloudWatch metrics"""
    try:
        metrics = [
            {
                'MetricName': 'SSMConnectivityHealthy',
                'Value': 1 if health_results['ssm']['healthy'] else 0,
                'Unit': 'Count',
                'Dimensions': [
                    {'Name': 'InstanceId', 'Value': INSTANCE_ID},
                    {'Name': 'Domain', 'Value': DOMAIN_NAME}
                ]
            },
            {
                'MetricName': 'HTTPSHealthy',
                'Value': 1 if health_results['https']['healthy'] else 0,
                'Unit': 'Count',
                'Dimensions': [
                    {'Name': 'InstanceId', 'Value': INSTANCE_ID},
                    {'Name': 'Domain', 'Value': DOMAIN_NAME}
                ]
            },
            {
                'MetricName': 'OverallHealthy',
                'Value': 1 if health_results['overall_healthy'] else 0,
                'Unit': 'Count',
                'Dimensions': [
                    {'Name': 'InstanceId', 'Value': INSTANCE_ID},
                    {'Name': 'Domain', 'Value': DOMAIN_NAME}
                ]
            }
        ]
        cloudwatch.put_metric_data(
            Namespace='MailServer/ProactiveHealthCheck',
            MetricData=metrics
        )
    except Exception as e:
        print(f"Error publishing metrics: {e}")

def send_alert(subject, message):
    """Send alert via SNS"""
    if not ALERT_TOPIC_ARN:
        return
    try:
        sns.publish(
            TopicArn=ALERT_TOPIC_ARN,
            Subject=subject[:100],
            Message=message
        )
    except Exception as e:
        print(f"Error sending alert: {e}")

def trigger_emergency_restart(health_results):
    """Trigger emergency restart Lambda"""
    try:
        payload = {
            'AlarmName': 'ProactiveHealthCheck-ZombieStateDetected',
            'NewStateReason': f'Zombie state detected: {health_results["failure_reason"]}',
            'source': 'proactive-health-check'
        }
        response = lambda_client.invoke(
            FunctionName=EMERGENCY_RESTART_LAMBDA_ARN,
            InvocationType='Event',
            Payload=json.dumps(payload)
        )
        print(f"Emergency restart triggered: {response}")
        return True
    except Exception as e:
        print(f"Error triggering restart: {e}")
        return False

def handler(event, context):
    """Proactive health check handler. Runs every 5 minutes to detect zombie instances."""
    print(f"=== Proactive Health Check ===")
    print(f"Instance: {INSTANCE_ID}")
    print(f"Domain: {DOMAIN_NAME}")
    print(f"Time: {datetime.now().isoformat()}")
    health_results = {
        'ec2': check_ec2_status(),
        'ssm': check_ssm_connectivity(),
        'https': check_https_connectivity(),
        'overall_healthy': True,
        'failure_reason': None,
        'timestamp': datetime.now().isoformat()
    }
    if not health_results['ec2']['healthy']:
        health_results['overall_healthy'] = False
        health_results['failure_reason'] = f"EC2 issue: {health_results['ec2']['reason']}"
    elif not health_results['ssm']['healthy'] or not health_results['https']['healthy']:
        health_results['overall_healthy'] = False
        reasons = []
        if not health_results['ssm']['healthy']:
            reasons.append(f"SSM: {health_results['ssm']['reason']}")
        if not health_results['https']['healthy']:
            reasons.append(f"HTTPS: {health_results['https']['reason']}")
        health_results['failure_reason'] = ' | '.join(reasons)
    publish_metrics(health_results)
    print(f"Health Results: {json.dumps(health_results, indent=2)}")
    if not health_results['overall_healthy']:
        print(f"🚨 UNHEALTHY: {health_results['failure_reason']}")
        send_alert(
            f"🚨 {DOMAIN_NAME} Health Check FAILED",
            f"Proactive health check detected issues:\\n\\n"
            f"Instance: {INSTANCE_ID}\\n"
            f"Domain: {DOMAIN_NAME}\\n"
            f"Failure Reason: {health_results['failure_reason']}\\n\\n"
            f"Details:\\n"
            f"- EC2: {health_results['ec2']['reason']}\\n"
            f"- SSM: {health_results['ssm']['reason']}\\n"
            f"- HTTPS: {health_results['https']['reason']}\\n\\n"
            f"🔄 Emergency restart will be triggered."
        )
        restart_triggered = trigger_emergency_restart(health_results)
        health_results['restart_triggered'] = restart_triggered
    else:
        print("✅ All health checks passed")
    return {
        'statusCode': 200,
        'body': json.dumps(health_results, indent=2)
    }
      `),
    });

    // EventBridge Rule to run proactive health check every 5 minutes
    this.proactiveHealthCheckSchedule = new events.Rule(this, 'ProactiveHealthCheckSchedule', {
      description: 'Run proactive health check every 5 minutes',
      schedule: events.Schedule.rate(Duration.minutes(5)),
      enabled: true,
    });

    this.proactiveHealthCheckSchedule.addTarget(new targets.LambdaFunction(this.proactiveHealthCheckLambda));

    // Grant EventBridge permission to invoke Lambda
    this.proactiveHealthCheckLambda.addPermission('EventBridgeInvoke', {
      principal: new iam.ServicePrincipal('events.amazonaws.com'),
      sourceArn: this.proactiveHealthCheckSchedule.ruleArn,
    });
  }
}
