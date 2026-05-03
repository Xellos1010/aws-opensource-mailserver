import { Construct } from 'constructs';
import {
  Stack,
  aws_lambda as lambda,
  aws_iam as iam,
  aws_events as events,
  aws_events_targets as targets,
  aws_logs as logs,
  aws_cloudformation as cloudformation,
  Duration,
  RemovalPolicy,
} from 'aws-cdk-lib';

export interface StopStartHelperLambdaProps {
  /** Optional EC2 instance ID override (skips CloudFormation lookup when present). */
  instanceId?: string;
  /** Mail server CloudFormation stack name to get instance ID from */
  mailServerStackName: string;
  /** Domain name for resource naming */
  domainName: string;
  /** Mail health check Lambda function name (optional) */
  mailHealthCheckLambdaName?: string;
  /** Service restart Lambda function name (optional) */
  serviceRestartLambdaName?: string;
  /** EventBridge schedule expression for daily stop-start (optional, e.g., 'cron(0 8 * * ? *)' for 3am EST) */
  scheduleExpression?: string;
  /** Maintenance window start hour (UTC, default: 8) */
  maintenanceWindowStartHour?: number;
  /** Maintenance window end hour (UTC, default: 8.25) */
  maintenanceWindowEndHour?: number;
  /** Whether maintenance window suppression is enabled (default: true when scheduleExpression is set) */
  maintenanceWindowEnabled?: boolean;
  /** Optional remediation state table for restart lock state. */
  remediationStateTableName?: string;
  /** Lock TTL in seconds for restart lock state (default: 900). */
  restartLockTtlSeconds?: number;
  /** Timeout in seconds (default: 900 = 15 minutes) */
  timeout?: Duration;
  /** Memory size in MB (default: 256) */
  memorySize?: number;
}

/**
 * Stop/Start Helper Lambda - Smart instance restart with maintenance window awareness
 *
 * Features:
 * - Maintenance window awareness (suppresses alarm-triggered restarts during scheduled maintenance)
 * - In-progress detection (prevents cascading restarts)
 * - Mail health check before restart (skips if healthy)
 * - Progressive recovery: service restart → instance restart
 * - State management (waits for stop/start completion)
 *
 * Recovery Time: 5-10 minutes (last resort)
 */
export class StopStartHelperLambda extends Construct {
  public readonly lambda: lambda.Function;
  public readonly scheduleRule?: events.Rule;

  constructor(scope: Construct, id: string, props: StopStartHelperLambdaProps) {
    super(scope, id);

    const {
      instanceId,
      mailServerStackName,
      domainName,
      mailHealthCheckLambdaName,
      serviceRestartLambdaName,
      scheduleExpression,
      maintenanceWindowStartHour = 8,
      maintenanceWindowEndHour = 8.25,
      maintenanceWindowEnabled = Boolean(scheduleExpression),
      remediationStateTableName,
      restartLockTtlSeconds = 15 * 60,
      timeout = Duration.minutes(15),
      memorySize = 256,
    } = props;

    // IAM Role - Use stack name for naming (domainName is a token from SSM)
    const stack = Stack.of(this);
    const role = new iam.Role(this, 'Role', {
      description: 'Role assumed by Lambda to stop and start EC2 instance',
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
          'ec2:StopInstances',
          'ec2:StartInstances',
          'ec2:DescribeInstances',
          'cloudformation:DescribeStacks',
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
          'logs:FilterLogEvents',
          'logs:DescribeLogStreams',
        ],
        resources: ['arn:aws:logs:*:*:*'],
      })
    );

    if (remediationStateTableName) {
      role.addToPolicy(
        new iam.PolicyStatement({
          actions: ['dynamodb:GetItem', 'dynamodb:PutItem', 'dynamodb:DeleteItem'],
          resources: [
            stack.formatArn({
              service: 'dynamodb',
              resource: 'table',
              resourceName: remediationStateTableName,
            }),
          ],
        })
      );
    }

    // Lambda invoke permissions for health check and service restart
    if (mailHealthCheckLambdaName || serviceRestartLambdaName) {
      role.addToPolicy(
        new iam.PolicyStatement({
          actions: ['lambda:InvokeFunction'],
          resources: [
            `arn:aws:lambda:*:*:function:${mailHealthCheckLambdaName || '*'}`,
            `arn:aws:lambda:*:*:function:${serviceRestartLambdaName || '*'}`,
          ],
        })
      );
    }

    // CloudWatch Log Group
    const logGroup = new logs.LogGroup(this, 'LogGroup', {
      retention: logs.RetentionDays.ONE_MONTH,
      removalPolicy: RemovalPolicy.DESTROY,
    });

    // Lambda Function
    this.lambda = new lambda.Function(this, 'Function', {
      description: 'Stops and starts EC2 instance with state waiting and smart logic',
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'index.handler',
      code: lambda.Code.fromInline(`
const { EC2Client, StopInstancesCommand, StartInstancesCommand, DescribeInstancesCommand } = require('@aws-sdk/client-ec2');
const { CloudFormationClient, DescribeStacksCommand } = require('@aws-sdk/client-cloudformation');
const { LambdaClient, InvokeCommand } = require('@aws-sdk/client-lambda');
const { CloudWatchLogsClient, FilterLogEventsCommand } = require('@aws-sdk/client-cloudwatch-logs');
const { DynamoDBClient, PutItemCommand, DeleteItemCommand } = require('@aws-sdk/client-dynamodb');
const { TextDecoder } = require('util');

const region = process.env.AWS_REGION || 'us-east-1';
const ec2Client = new EC2Client({ region });
const cfClient = new CloudFormationClient({ region });
const lambdaClient = new LambdaClient({ region });
const logsClient = new CloudWatchLogsClient({ region });
const dynamodbClient = new DynamoDBClient({ region });

async function getInstanceIdFromStack(stackName) {
  try {
    const response = await cfClient.send(
      new DescribeStacksCommand({ StackName: stackName })
    );
    const stack = response.Stacks?.[0];
    if (!stack || !stack.Outputs) {
      throw new Error('Stack ' + stackName + ' not found or has no outputs');
    }

    // Try InstanceId first, then RestorePrefix (legacy)
    const outputs = {};
    stack.Outputs.forEach(output => {
      outputs[output.OutputKey] = output.OutputValue;
    });

    const instanceId = outputs['InstanceId'] || outputs['RestorePrefix'];
    if (!instanceId) {
      throw new Error('Instance ID not found in stack outputs. Available: ' + Object.keys(outputs).join(', '));
    }

    return instanceId;
  } catch (error) {
    console.error('Failed to get instance ID from stack ' + stackName + ':', error);
    throw error;
  }
}

async function getInstanceState(id) {
  const response = await ec2Client.send(
    new DescribeInstancesCommand({ InstanceIds: [id] })
  );
  const instance = response.Reservations?.[0]?.Instances?.[0];
  if (!instance) {
    throw new Error('Instance ' + id + ' not found');
  }
  return instance.State?.Name || 'unknown';
}

async function waitForState(id, desiredState, timeoutMs = 600000) {
  const startTime = Date.now();
  const checkInterval = 10000; // Check every 10 seconds

  console.log('Waiting for instance ' + id + ' to reach state: ' + desiredState);

  while (Date.now() - startTime < timeoutMs) {
    const currentState = await getInstanceState(id);

    if (currentState === desiredState) {
      console.log('Instance ' + id + ' is now in ' + desiredState + ' state');
      return;
    }

    const elapsed = Math.floor((Date.now() - startTime) / 1000 / 60);
    console.log('Current state: ' + currentState + '. Waiting... (' + elapsed + ' minutes elapsed)');

    await new Promise(resolve => setTimeout(resolve, checkInterval));
  }

  throw new Error(
    'Timeout waiting for instance ' + id + ' to reach ' + desiredState + ' state after ' + (timeoutMs / 1000 / 60) + ' minutes'
  );
}

async function stopAndStart(id) {
  console.log('Stopping and restarting instance ' + id + '...');

  // Check current state
  let currentState = await getInstanceState(id);
  console.log('Current instance state: ' + currentState);

  // If instance is pending (starting), wait for it to be running first
  if (currentState === 'pending') {
    console.log('Instance ' + id + ' is starting. Waiting for running state before stopping...');
    await waitForState(id, 'running', 900000); // 15 minutes for starting
    currentState = await getInstanceState(id);
  }

  // Stop the instance if it's running or stopping
  if (currentState === 'running') {
    console.log('Stopping instance ' + id + '...');
    await ec2Client.send(new StopInstancesCommand({ InstanceIds: [id] }));
    await waitForState(id, 'stopped');
  } else if (currentState === 'stopping') {
    console.log('Instance ' + id + ' is already stopping. Waiting for stopped state...');
    await waitForState(id, 'stopped');
  } else if (currentState === 'stopped') {
    console.log('Instance ' + id + ' is already stopped');
  } else {
    throw new Error(
      'Cannot stop instance ' + id + ' from ' + currentState + ' state. Must be running or stopping.'
    );
  }

  // Start the instance
  currentState = await getInstanceState(id);
  if (currentState === 'stopped') {
    console.log('Starting instance ' + id + '...');
    await ec2Client.send(new StartInstancesCommand({ InstanceIds: [id] }));
    await waitForState(id, 'running', 900000); // 15 minutes for starting
  } else if (currentState === 'pending') {
    console.log('Instance ' + id + ' is already starting. Waiting for running state...');
    await waitForState(id, 'running', 900000);
  } else if (currentState === 'running') {
    console.log('Instance ' + id + ' is already running');
  } else {
    throw new Error(
      'Cannot start instance ' + id + ' from ' + currentState + ' state. Must be stopped or pending.'
    );
  }

  console.log('✅ Instance ' + id + ' stop-and-start completed successfully');
}

// Smart restart logic
function isMaintenanceWindow() {
  const enabled = (process.env.MAINTENANCE_WINDOW_ENABLED || 'true') === 'true';
  if (!enabled) {
    return false;
  }
  const now = new Date();
  const utcHour = now.getUTCHours();
  const utcMinute = now.getUTCMinutes();
  const hourDecimal = utcHour + (utcMinute / 60.0);
  const startHour = parseFloat(process.env.MAINTENANCE_WINDOW_START_HOUR || '8');
  const endHour = parseFloat(process.env.MAINTENANCE_WINDOW_END_HOUR || '8.25');
  return hourDecimal >= startHour && hourDecimal < endHour;
}

async function isRestartInProgress(logGroupName) {
  try {
    const now = Date.now();
    const fiveMinutesAgo = now - (5 * 60 * 1000);
    
    const response = await logsClient.send(new FilterLogEventsCommand({
      logGroupName: logGroupName,
      startTime: fiveMinutesAgo,
      endTime: now,
      filterPattern: 'START RequestId'
    }));
    
    // Check if there are any recent START events (excluding this execution)
    const recentStarts = response.events || [];
    return recentStarts.length > 1; // More than 1 means another execution started
  } catch (error) {
    console.log('Could not check for in-progress restarts:', error.message);
    return false; // Fail open - allow restart if check fails
  }
}

async function checkMailHealth(lambdaName) {
  try {
    console.log('Checking mail service health via Lambda: ' + lambdaName);
    const response = await lambdaClient.send(new InvokeCommand({
      FunctionName: lambdaName,
      InvocationType: 'RequestResponse'
    }));
    
    const responsePayload = JSON.parse(new TextDecoder().decode(response.Payload));
    const healthData = typeof responsePayload.body === 'string' 
      ? JSON.parse(responsePayload.body) 
      : responsePayload.body || responsePayload;
    
    const healthy = healthData.healthy === true;
    const reason = healthData.health_reason || 'Unknown';
    
    console.log('Mail health check result:', {
      healthy: healthy,
      reason: reason,
      primary: healthData.primary || {},
      ports: healthData.ports || {}
    });
    
    return { healthy, reason, details: healthData };
  } catch (error) {
    console.error('Mail health check failed:', error.message);
    // Fail open - if health check fails, assume unhealthy and allow restart
    return { healthy: false, reason: 'Health check failed: ' + error.message, details: {} };
  }
}

async function restartServices(lambdaName) {
  try {
    console.log('Attempting service restart via Lambda: ' + lambdaName);
    const response = await lambdaClient.send(new InvokeCommand({
      FunctionName: lambdaName,
      InvocationType: 'RequestResponse'
    }));
    
    const responsePayload = JSON.parse(new TextDecoder().decode(response.Payload));
    const result = typeof responsePayload.body === 'string' 
      ? JSON.parse(responsePayload.body) 
      : responsePayload.body || responsePayload;
    
    const success = result.success === true && result.services_healthy === true;
    const status = result.status || 'Unknown';
    
    console.log('Service restart result:', {
      success: success,
      status: status,
      stdout: result.stdout ? result.stdout.substring(0, 500) : 'N/A'
    });
    
    return { success, status, details: result };
  } catch (error) {
    console.error('Service restart failed:', error.message);
    return { success: false, status: 'Error', error: error.message };
  }
}

function determineRestartReason(event) {
  // Check if this is from EventBridge (scheduled) or CloudWatch alarm
  if (event.source === 'aws.events' || event['detail-type'] === 'Scheduled Event') {
    return 'scheduled';
  }
  if (event.source === 'aws.cloudwatch' || event.AlarmName) {
    return 'alarm-triggered';
  }
  return 'manual';
}

async function acquireRestartLock(instanceId, restartReason) {
  const tableName = process.env.REMEDIATION_STATE_TABLE_NAME;
  if (!tableName) {
    return { acquired: true, stateKey: '' };
  }

  const ttlSeconds = parseInt(process.env.RESTART_LOCK_TTL_SECONDS || '900', 10);
  const now = Math.floor(Date.now() / 1000);
  const stateKey = 'lock#' + instanceId + '#restart';

  try {
    await dynamodbClient.send(new PutItemCommand({
      TableName: tableName,
      Item: {
        stateKey: { S: stateKey },
        kind: { S: 'restart-lock' },
        reason: { S: restartReason || 'unknown' },
        updatedAt: { N: String(now) },
        expiresAt: { N: String(now + ttlSeconds) },
      },
      ConditionExpression: 'attribute_not_exists(stateKey) OR expiresAt < :now',
      ExpressionAttributeValues: {
        ':now': { N: String(now) },
      },
    }));
    return { acquired: true, stateKey };
  } catch (error) {
    console.log('Restart lock is already held:', error.message);
    return { acquired: false, stateKey };
  }
}

async function releaseRestartLock(stateKey) {
  const tableName = process.env.REMEDIATION_STATE_TABLE_NAME;
  if (!tableName || !stateKey) {
    return;
  }
  try {
    await dynamodbClient.send(new DeleteItemCommand({
      TableName: tableName,
      Key: { stateKey: { S: stateKey } },
    }));
  } catch (error) {
    console.log('Failed to release restart lock:', error.message);
  }
}

exports.handler = async (event) => {
  const stackName = process.env.MAIL_SERVER_STACK_NAME;
  const configuredInstanceId = process.env.INSTANCE_ID;
  const healthCheckLambdaName = process.env.MAIL_HEALTH_CHECK_LAMBDA_NAME;
  const serviceRestartLambdaName = process.env.SERVICE_RESTART_LAMBDA_NAME;
  const logGroupName = process.env.LOG_GROUP_NAME || '/aws/lambda/' + process.env.AWS_LAMBDA_FUNCTION_NAME;

  if (!stackName && !configuredInstanceId) {
    console.error('MAIL_SERVER_STACK_NAME or INSTANCE_ID environment variable must be set');
    throw new Error('MAIL_SERVER_STACK_NAME or INSTANCE_ID environment variable must be set');
  }

  // Determine restart reason
  const restartReason = determineRestartReason(event);
  console.log('=== Smart Restart Lambda Execution ===');
  console.log('Restart reason:', restartReason);
  console.log('Event source:', event.source || 'unknown');

  try {
    // Check if restart is already in progress
    const inProgress = await isRestartInProgress(logGroupName);
    if (inProgress) {
      console.log('⚠️ Skipping restart - another restart is already in progress');
      return {
        statusCode: 200,
        body: JSON.stringify({
          message: 'Restart skipped - already in progress',
          restartReason,
          skipped: true
        }),
      };
    }

    // Check maintenance window for alarm-triggered restarts
    if (restartReason === 'alarm-triggered') {
      const inMaintenanceWindow = isMaintenanceWindow();
      console.log('Maintenance window check:', {
        inWindow: inMaintenanceWindow,
        currentTime: new Date().toISOString()
      });
      
      if (inMaintenanceWindow) {
        console.log('⚠️ Suppressing alarm-triggered restart during maintenance window');
        return {
          statusCode: 200,
          body: JSON.stringify({
            message: 'Restart suppressed - within scheduled maintenance window',
            restartReason,
            suppressed: true,
            maintenanceWindow: true
          }),
        };
      }

      // Check mail service health before restarting (alarm-triggered only)
      if (healthCheckLambdaName) {
        const healthCheck = await checkMailHealth(healthCheckLambdaName);
        
        if (healthCheck.healthy) {
          console.log('⚠️ Mail services are healthy - skipping restart');
          console.log('Health reason:', healthCheck.reason);
          return {
            statusCode: 200,
            body: JSON.stringify({
              message: 'Restart skipped - mail services are healthy',
              restartReason,
              skipped: true,
              healthCheck: healthCheck.details
            }),
          };
        } else {
          console.log('✓ Mail services unhealthy - proceeding with recovery');
          console.log('Health reason:', healthCheck.reason);
        }
      }
    }

    // Get instance ID
    const instanceId = configuredInstanceId || await getInstanceIdFromStack(stackName);
    console.log('Resolved instance ID: ' + instanceId);
    console.log('Found instance ID: ' + instanceId);

    // For alarm-triggered restarts, try service restart first (faster recovery)
    if (restartReason === 'alarm-triggered' && serviceRestartLambdaName) {
      console.log('Attempting service restart first (faster recovery)...');
      const serviceRestartResult = await restartServices(serviceRestartLambdaName);
      
      if (serviceRestartResult.success) {
        console.log('✅ Service restart succeeded - no instance restart needed');
        return {
          statusCode: 200,
          body: JSON.stringify({
            message: 'Services restarted successfully without instance restart',
            instanceId,
            restartReason,
            recoveryMethod: 'service-restart',
            timestamp: new Date().toISOString(),
            details: serviceRestartResult.details
          }),
        };
      } else {
        console.log('⚠️ Service restart failed, falling back to instance restart');
        console.log('Service restart status:', serviceRestartResult.status);
      }
    }

    // Proceed with instance restart (either scheduled, manual, or after failed service restart)
    console.log('Proceeding with instance restart (reason: ' + restartReason + ')');
    const lock = await acquireRestartLock(instanceId, restartReason);
    if (!lock.acquired) {
      return {
        statusCode: 200,
        body: JSON.stringify({
          message: 'Restart skipped - restart lock is already held',
          instanceId,
          restartReason,
          skipped: true,
        }),
      };
    }
    try {
      await stopAndStart(instanceId);
    } finally {
      await releaseRestartLock(lock.stateKey);
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: 'Successfully completed stop-and-start for instance ' + instanceId,
        instanceId,
        restartReason,
        timestamp: new Date().toISOString()
      }),
    };
  } catch (error) {
    console.error('Error in stop-and-start Lambda:', error);
    throw error;
  }
};
      `),
      role,
      timeout,
      memorySize,
      logGroup,
      environment: {
        INSTANCE_ID: instanceId || '',
        MAIL_SERVER_STACK_NAME: mailServerStackName,
        MAIL_HEALTH_CHECK_LAMBDA_NAME: mailHealthCheckLambdaName || '',
        SERVICE_RESTART_LAMBDA_NAME: serviceRestartLambdaName || '',
        LOG_GROUP_NAME: logGroup.logGroupName,
        MAINTENANCE_WINDOW_START_HOUR: maintenanceWindowStartHour.toString(),
        MAINTENANCE_WINDOW_END_HOUR: maintenanceWindowEndHour.toString(),
        MAINTENANCE_WINDOW_ENABLED: maintenanceWindowEnabled ? 'true' : 'false',
        REMEDIATION_STATE_TABLE_NAME: remediationStateTableName || '',
        RESTART_LOCK_TTL_SECONDS: String(restartLockTtlSeconds),
      },
    });

    // EventBridge Schedule (if provided)
    if (scheduleExpression) {
      this.scheduleRule = new events.Rule(this, 'ScheduleRule', {
        schedule: events.Schedule.expression(scheduleExpression),
        description: 'Triggers stop-and-start of mail server instance daily',
      });

      this.scheduleRule.addTarget(new targets.LambdaFunction(this.lambda));

      // Grant EventBridge permission to invoke Lambda
      this.lambda.addPermission('EventBridgeInvoke', {
        principal: new iam.ServicePrincipal('events.amazonaws.com'),
        sourceArn: this.scheduleRule.ruleArn,
      });
    }

    // NOTE: This Lambda is invoked by the Recovery Orchestrator Lambda, not directly by alarms.
    // The Recovery Orchestrator Lambda will have the CloudWatch alarm permission added automatically
    // by LambdaAction when alarms are wired to it. No manual permission needed here.
  }
}
