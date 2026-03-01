import { Construct } from 'constructs';
import {
  Stack,
  aws_lambda as lambda,
  aws_iam as iam,
  aws_logs as logs,
  Duration,
  RemovalPolicy,
} from 'aws-cdk-lib';

export interface RecoveryOrchestratorLambdaProps {
  /** Mail health check Lambda function ARN */
  mailHealthCheckLambdaArn: string;
  /** System reset Lambda function ARN */
  systemResetLambdaArn: string;
  /** Service restart Lambda function ARN */
  serviceRestartLambdaArn: string;
  /** Stop/start helper Lambda function ARN */
  stopStartLambdaArn: string;
  /** Domain name for resource naming */
  domainName: string;
  /** Timeout in seconds (default: 300 = 5 minutes) */
  timeout?: Duration;
  /** Memory size in MB (default: 512) */
  memorySize?: number;
}

/**
 * Recovery Orchestrator Lambda - Orchestrates progressive recovery flow
 *
 * Recovery Flow:
 * 1. Mail Health Check + alarm-specific resolution gate
 * 2. Alarm-targeted non-reboot remediation (service restart/system reset order varies)
 * 3. Verification after each step
 * 4. Instance stop/start as strict last resort
 */
export class RecoveryOrchestratorLambda extends Construct {
  public readonly lambda: lambda.Function;

  constructor(scope: Construct, id: string, props: RecoveryOrchestratorLambdaProps) {
    super(scope, id);

    const {
      mailHealthCheckLambdaArn,
      systemResetLambdaArn,
      serviceRestartLambdaArn,
      stopStartLambdaArn,
      domainName,
      timeout = Duration.minutes(8),
      memorySize = 512,
    } = props;

    // IAM Role - Use stack name for naming (domainName is a token from SSM)
    const stack = Stack.of(this);
    const role = new iam.Role(this, 'Role', {
      description: 'Role for mail recovery orchestrator Lambda',
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName(
          'service-role/AWSLambdaBasicExecutionRole'
        ),
      ],
    });

    role.addToPolicy(
      new iam.PolicyStatement({
        actions: ['lambda:InvokeFunction'],
        resources: [
          mailHealthCheckLambdaArn,
          systemResetLambdaArn,
          serviceRestartLambdaArn,
          stopStartLambdaArn,
        ],
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
      description: 'Orchestrates alarm-targeted non-reboot recovery before instance stop/start fallback',
      runtime: lambda.Runtime.PYTHON_3_11,
      handler: 'index.handler',
      code: lambda.Code.fromInline(`
import boto3
import json
import os
import time

lambda_client = boto3.client('lambda')
DISK_CRITICAL_PERCENT = 95

def invoke_lambda(function_name, payload=None):
    """Invoke a Lambda function and return the result"""
    try:
        response = lambda_client.invoke(
            FunctionName=function_name,
            InvocationType='RequestResponse',
            Payload=json.dumps(payload) if payload else '{}'
        )
        result = json.loads(response['Payload'].read())
        return result
    except Exception as e:
        print(f"Error invoking {function_name}: {str(e)}")
        return {'error': str(e), 'success': False}

def parse_lambda_body(lambda_result):
    body = lambda_result.get('body', '{}')
    if isinstance(body, str):
        try:
            return json.loads(body)
        except json.JSONDecodeError:
            return {}
    return body if isinstance(body, dict) else {}

def alarm_resolved(alarm_name, health_data):
    metrics = health_data.get('metrics', {}) if isinstance(health_data, dict) else {}
    primary = health_data.get('primary', {}) if isinstance(health_data, dict) else {}

    if 'AdminEndpointUnhealthy' in alarm_name:
        return metrics.get('admin_endpoint_healthy') == 1

    if 'MailPrimaryUnhealthy' in alarm_name:
        return metrics.get('mail_primary_healthy') == 1

    if 'DiskUsageCritical' in alarm_name:
        try:
            return int(metrics.get('disk_usage_percent', 100)) < DISK_CRITICAL_PERCENT
        except (TypeError, ValueError):
            return False

    if 'MaildirPermissionDenied' in alarm_name:
        mailbox_status = primary.get('mailbox_root_permissions', {}).get('status')
        return mailbox_status == 'ok'

    return health_data.get('healthy', False)

def remediation_order(alarm_name):
    if 'AdminEndpointUnhealthy' in alarm_name:
        return ['service_restart', 'system_reset']
    if 'MailPrimaryUnhealthy' in alarm_name:
        return ['service_restart', 'system_reset']
    if 'MaildirPermissionDenied' in alarm_name:
        return ['service_restart', 'system_reset']
    if 'DiskUsageCritical' in alarm_name:
        return ['system_reset', 'service_restart']
    return ['system_reset', 'service_restart']

def extract_alarm_name(event):
    if not isinstance(event, dict):
        return 'Unknown'

    direct_name = event.get('AlarmName') or event.get('alarmName')
    if direct_name:
        return str(direct_name)

    alarm_data = event.get('alarmData')
    if isinstance(alarm_data, dict):
        nested_name = alarm_data.get('alarmName') or alarm_data.get('AlarmName')
        if nested_name:
            return str(nested_name)

    detail = event.get('detail')
    if isinstance(detail, dict):
        detail_name = detail.get('alarmName') or detail.get('AlarmName')
        if detail_name:
            return str(detail_name)

        nested_alarm_data = detail.get('alarmData')
        if isinstance(nested_alarm_data, dict):
            deep_name = nested_alarm_data.get('alarmName') or nested_alarm_data.get('AlarmName')
            if deep_name:
                return str(deep_name)

    return 'Unknown'

def handler(event, context):
    """
    Orchestrates targeted non-reboot recovery:
    1. Check health and determine if the triggering alarm condition is already resolved
    2. Execute ordered non-reboot remediation based on alarm type
    3. Re-verify alarm-specific health after each step
    4. Trigger instance stop/start only if all non-reboot methods fail
    """
    
    health_check_lambda = os.environ.get('MAIL_HEALTH_CHECK_LAMBDA_ARN')
    system_reset_lambda = os.environ.get('SYSTEM_RESET_LAMBDA_ARN')
    service_restart_lambda = os.environ.get('SERVICE_RESTART_LAMBDA_ARN')
    stop_start_lambda = os.environ.get('STOP_START_LAMBDA_ARN')
    
    alarm_name = extract_alarm_name(event)
    print(f"=== Mail Recovery Orchestrator ===")
    print(f"Triggered by alarm: {alarm_name}")

    step_results = {}
    lambda_by_step = {
        'system_reset': system_reset_lambda,
        'service_restart': service_restart_lambda,
    }

    # Step 1: Check current health and whether this specific alarm condition is already resolved
    print("Step 1: Checking mail service health...")
    health_result = invoke_lambda(health_check_lambda)
    health_data = parse_lambda_body(health_result)
    is_healthy = health_data.get('healthy', False)
    health_reason = health_data.get('health_reason', 'Unknown')
    
    print(f"Health check result: {'HEALTHY' if is_healthy else 'UNHEALTHY'}")
    print(f"Reason: {health_reason}")
    
    if alarm_resolved(alarm_name, health_data):
        print("✅ Mail services are healthy - no action needed")
        return {
            'statusCode': 200,
            'body': json.dumps({
                'message': 'Alarm condition already resolved - no recovery needed',
                'alarm': alarm_name,
                'health_check': health_data,
                'action_taken': 'none'
            })
        }

    ordered_steps = remediation_order(alarm_name)
    print(f"Remediation order for {alarm_name}: {ordered_steps}")

    # Step 2+: Execute ordered non-reboot recovery and verify alarm-specific resolution.
    current_step_number = 2
    for step_name in ordered_steps:
        target_lambda = lambda_by_step.get(step_name)
        if not target_lambda:
            continue

        print(f"Step {current_step_number}: Attempting {step_name}...")
        current_step_number += 1

        step_result = invoke_lambda(target_lambda)
        step_data = parse_lambda_body(step_result)
        step_results[step_name] = step_data

        step_success = step_data.get('success', False) and step_data.get('services_healthy', False)
        if not step_success:
            print(f"⚠️ {step_name} failed or incomplete")
            continue

        print(f"✅ {step_name} reported success, verifying alarm condition...")
        verify_health_result = invoke_lambda(health_check_lambda)
        verify_health_data = parse_lambda_body(verify_health_result)

        if alarm_resolved(alarm_name, verify_health_data):
            print(f"✅ {step_name} resolved alarm condition")
            return {
                'statusCode': 200,
                'body': json.dumps({
                    'message': f'{step_name} succeeded and resolved alarm condition without reboot',
                    'alarm': alarm_name,
                    'health_check': verify_health_data,
                    'system_reset': step_results.get('system_reset'),
                    'service_restart': step_results.get('service_restart'),
                    'action_taken': step_name
                })
            }

        print(f"⚠️ {step_name} succeeded but alarm condition still unresolved")

    # Final non-reboot guard window: wait and re-check before last resort.
    print("Waiting 45 seconds before final health check...")
    time.sleep(45)

    retry_health = invoke_lambda(health_check_lambda)
    retry_data = parse_lambda_body(retry_health)

    if alarm_resolved(alarm_name, retry_data):
        print("✅ Services recovered after waiting - no instance restart needed")
        return {
            'statusCode': 200,
            'body': json.dumps({
                'message': 'Services self-recovered after waiting (transient SSM issue resolved)',
                'alarm': alarm_name,
                'health_check': retry_data,
                'system_reset': step_results.get('system_reset'),
                'service_restart': step_results.get('service_restart'),
                'action_taken': 'self_recovery'
            })
        }

    if alarm_name == 'Unknown':
        print("Alarm name could not be determined from event payload; skipping instance restart fallback for safety.")
        return {
            'statusCode': 200,
            'body': json.dumps({
                'message': 'Non-reboot recovery attempted but alarm identity is unknown; instance restart skipped for safety',
                'alarm': alarm_name,
                'health_check': retry_data,
                'system_reset': step_results.get('system_reset'),
                'service_restart': step_results.get('service_restart'),
                'action_taken': 'manual_review_required'
            })
        }

    if 'DiskUsageCritical' in alarm_name:
        print("DiskUsageCritical remains unresolved after non-reboot steps; skipping instance restart fallback.")
        return {
            'statusCode': 200,
            'body': json.dumps({
                'message': 'Disk remains above threshold after non-reboot recovery; manual cleanup/volume expansion required',
                'alarm': alarm_name,
                'health_check': retry_data,
                'system_reset': step_results.get('system_reset'),
                'service_restart': step_results.get('service_restart'),
                'action_taken': 'manual_disk_remediation_required'
            })
        }

    # Last resort: instance restart/stop-start path.
    print("All non-reboot recovery methods failed, triggering instance restart (last resort)...")
    instance_restart_result = invoke_lambda(stop_start_lambda, {
        'source': 'aws.cloudwatch',
        'AlarmName': alarm_name
    })
    
    print("✅ Instance restart triggered")
    return {
        'statusCode': 200,
        'body': json.dumps({
            'message': 'Instance restart triggered after all recovery methods failed',
            'alarm': alarm_name,
            'health_check': health_data,
            'system_reset': step_results.get('system_reset'),
            'service_restart': step_results.get('service_restart'),
            'instance_restart': instance_restart_result,
            'action_taken': 'instance_restart'
        })
    }
      `),
      role,
      timeout,
      memorySize,
      logGroup,
      environment: {
        MAIL_HEALTH_CHECK_LAMBDA_ARN: mailHealthCheckLambdaArn,
        SYSTEM_RESET_LAMBDA_ARN: systemResetLambdaArn,
        SERVICE_RESTART_LAMBDA_ARN: serviceRestartLambdaArn,
        STOP_START_LAMBDA_ARN: stopStartLambdaArn,
      },
    });
  }
}
