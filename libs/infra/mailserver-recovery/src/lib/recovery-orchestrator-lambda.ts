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
 * 1. Mail Health Check → If healthy, stop
 * 2. System Reset (30-90s) → If successful, stop
 * 3. Service Restart (30-60s) → If successful, stop
 * 4. Instance Restart (5-10min) → Last resort
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
      description: 'Orchestrates mail service recovery - checks health, restarts services, then instance if needed',
      runtime: lambda.Runtime.PYTHON_3_11,
      handler: 'index.handler',
      code: lambda.Code.fromInline(`
import boto3
import json
import os
import time

lambda_client = boto3.client('lambda')

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

def handler(event, context):
    """
    Orchestrates mail service recovery:
    1. Check mail service health
    2. If unhealthy, try system reset (comprehensive - handles memory, processes, disk)
    3. If system reset fails, try service restart (simple)
    4. If service restart fails, trigger instance restart (last resort)
    """
    
    health_check_lambda = os.environ.get('MAIL_HEALTH_CHECK_LAMBDA_ARN')
    system_reset_lambda = os.environ.get('SYSTEM_RESET_LAMBDA_ARN')
    service_restart_lambda = os.environ.get('SERVICE_RESTART_LAMBDA_ARN')
    stop_start_lambda = os.environ.get('STOP_START_LAMBDA_ARN')
    
    alarm_name = event.get('AlarmName', 'Unknown')
    print(f"=== Mail Recovery Orchestrator ===")
    print(f"Triggered by alarm: {alarm_name}")
    
    # Step 1: Check mail service health
    print("Step 1: Checking mail service health...")
    health_result = invoke_lambda(health_check_lambda)
    
    # Parse health check result
    health_body = health_result.get('body', '{}')
    if isinstance(health_body, str):
        health_data = json.loads(health_body)
    else:
        health_data = health_body
    
    is_healthy = health_data.get('healthy', False)
    health_reason = health_data.get('health_reason', 'Unknown')
    
    print(f"Health check result: {'HEALTHY' if is_healthy else 'UNHEALTHY'}")
    print(f"Reason: {health_reason}")
    
    if is_healthy:
        print("✅ Mail services are healthy - no action needed")
        return {
            'statusCode': 200,
            'body': json.dumps({
                'message': 'Mail services are healthy - no recovery needed',
                'alarm': alarm_name,
                'health_check': health_data,
                'action_taken': 'none'
            })
        }
    
    # Step 2: Try system reset (comprehensive - handles memory, processes, disk, services)
    if system_reset_lambda:
        print("Step 2: Attempting system reset (comprehensive recovery)...")
        system_reset_result = invoke_lambda(system_reset_lambda)
        
        # Parse system reset result
        reset_body = system_reset_result.get('body', '{}')
        if isinstance(reset_body, str):
            reset_data = json.loads(reset_body)
        else:
            reset_data = reset_body
        
        reset_success = reset_data.get('success', False) and reset_data.get('services_healthy', False)
        
        if reset_success:
            print("✅ System reset succeeded - comprehensive recovery completed")
            return {
                'statusCode': 200,
                'body': json.dumps({
                    'message': 'System reset succeeded - comprehensive recovery without reboot',
                    'alarm': alarm_name,
                    'health_check': health_data,
                    'system_reset': reset_data,
                    'action_taken': 'system_reset'
                })
            }
        else:
            print("⚠️ System reset failed or incomplete, trying service restart...")
    
    # Step 3: Try service restart (simple fallback)
    print("Step 3: Attempting service restart (simple recovery)...")
    service_restart_result = invoke_lambda(service_restart_lambda)
    
    # Parse service restart result
    restart_body = service_restart_result.get('body', '{}')
    if isinstance(restart_body, str):
        restart_data = json.loads(restart_body)
    else:
        restart_data = restart_body
    
    restart_success = restart_data.get('success', False) and restart_data.get('services_healthy', False)
    
    if restart_success:
        print("✅ Service restart succeeded - simple recovery completed")
        return {
            'statusCode': 200,
            'body': json.dumps({
                'message': 'Service restart succeeded - simple recovery without reboot',
                'alarm': alarm_name,
                'health_check': health_data,
                'system_reset': reset_data if system_reset_lambda else None,
                'service_restart': restart_data,
                'action_taken': 'service_restart'
            })
        }
    
    # Step 3.5: Wait 45s then re-check health (services may self-recover or SSM may have been transient)
    print("Step 3.5: Waiting 45 seconds before final health check...")
    time.sleep(45)

    retry_health = invoke_lambda(health_check_lambda)
    retry_body = retry_health.get('body', '{}')
    if isinstance(retry_body, str):
        retry_data = json.loads(retry_body)
    else:
        retry_data = retry_body

    if retry_data.get('healthy', False):
        print("✅ Services recovered after waiting - no instance restart needed")
        return {
            'statusCode': 200,
            'body': json.dumps({
                'message': 'Services self-recovered after waiting (transient SSM issue resolved)',
                'alarm': alarm_name,
                'health_check': retry_data,
                'action_taken': 'self_recovery'
            })
        }

    # Step 4: Fall back to instance restart (last resort)
    print("Step 4: All recovery methods failed, triggering instance restart (last resort)...")
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
            'system_reset': reset_data if system_reset_lambda else None,
            'service_restart': restart_data,
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

