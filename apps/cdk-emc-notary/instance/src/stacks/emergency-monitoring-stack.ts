import {
  Stack,
  StackProps,
  Duration,
  aws_lambda as lambda,
  aws_iam as iam,
  aws_cloudwatch_actions as cwa,
} from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { tagStack } from '@mm/infra-shared-constructs';

export interface EmergencyMonitoringStackProps extends StackProps {
  /** Instance ID to monitor */
  instanceId: string;
  /** Domain name for tagging */
  domainName: string;
  /** SNS topic ARN for notifications */
  alarmsTopicArn: string;
  /** CloudWatch alarms that should trigger auto-restart */
  alarms: {
    instanceStatusCheck: lambda.IFunction;
    systemStatusCheck: lambda.IFunction;
    oomKill: lambda.IFunction;
  };
}

/**
 * Emergency Monitoring Stack
 * 
 * Creates a Lambda function that automatically restarts EC2 instances when
 * critical failures are detected (status check failures, OOM kills).
 * 
 * This stack should be deployed separately from the instance stack to ensure
 * it remains available even if the instance stack has issues.
 */
export class EmergencyMonitoringStack extends Stack {
  public readonly restartLambda: lambda.Function;

  constructor(
    scope: Construct,
    id: string,
    props: EmergencyMonitoringStackProps
  ) {
    super(scope, id, props);
    const { instanceId, domainName, alarmsTopicArn } = props;

    tagStack(this, `${domainName}-emergency-monitoring`);

    // IAM role for the restart Lambda
    const restartLambdaRole = new iam.Role(this, 'RestartLambdaRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      description: 'Role for emergency instance restart Lambda',
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName(
          'service-role/AWSLambdaBasicExecutionRole'
        ),
      ],
    });

    // Grant EC2 permissions for stop/start/describe
    restartLambdaRole.addToPolicy(
      new iam.PolicyStatement({
        actions: [
          'ec2:StopInstances',
          'ec2:StartInstances',
          'ec2:DescribeInstances',
          'ec2:DescribeInstanceStatus',
        ],
        resources: [`arn:aws:ec2:${this.region}:${this.account}:instance/${instanceId}`],
      })
    );

    // Grant CloudWatch Logs permissions
    restartLambdaRole.addToPolicy(
      new iam.PolicyStatement({
        actions: [
          'logs:CreateLogGroup',
          'logs:CreateLogStream',
          'logs:PutLogEvents',
        ],
        resources: [
          `arn:aws:logs:${this.region}:${this.account}:log-group:/aws/lambda/emergency-restart-*`,
        ],
      })
    );

    // Lambda function that performs stop-and-start restart
    this.restartLambda = new lambda.Function(this, 'EmergencyRestartLambda', {
      functionName: `emergency-restart-${domainName.replace(/\./g, '-')}`,
      runtime: lambda.Runtime.NODEJS_20_X,
      code: lambda.Code.fromInline(`
const { EC2Client, StopInstancesCommand, StartInstancesCommand, DescribeInstancesCommand } = require('@aws-sdk/client-ec2');

const ec2Client = new EC2Client({ region: process.env.AWS_REGION });

async function getInstanceState(instanceId) {
  const response = await ec2Client.send(
    new DescribeInstancesCommand({ InstanceIds: [instanceId] })
  );
  const instance = response.Reservations?.[0]?.Instances?.[0];
  if (!instance) {
    throw new Error(\`Instance \${instanceId} not found\`);
  }
  return instance.State?.Name || 'unknown';
}

async function waitForState(instanceId, desiredState, timeoutMs = 600000) {
  const startTime = Date.now();
  const checkInterval = 10000; // 10 seconds

  console.log(\`Waiting for instance \${instanceId} to reach state: \${desiredState}\`);

  while (Date.now() - startTime < timeoutMs) {
    const currentState = await getInstanceState(instanceId);

    if (currentState === desiredState) {
      console.log(\`Instance \${instanceId} is now in \${desiredState} state\`);
      return;
    }

    const elapsed = Math.floor((Date.now() - startTime) / 1000 / 60);
    console.log(\`Current state: \${currentState}. Waiting... (\${elapsed} minutes elapsed)\`);

    await new Promise((resolve) => setTimeout(resolve, checkInterval));
  }

  throw new Error(
    \`Timeout waiting for instance \${instanceId} to reach \${desiredState} state after \${timeoutMs / 1000 / 60} minutes\`
  );
}

async function stopAndStart(instanceId) {
  console.log(\`Emergency restart: Stopping and restarting instance \${instanceId}...\`);

  // Check current state
  let currentState = await getInstanceState(instanceId);
  console.log(\`Current instance state: \${currentState}\`);

  // If instance is pending (starting), wait for it to be running first
  if (currentState === 'pending') {
    console.log(\`Instance \${instanceId} is starting. Waiting for running state before stopping...\`);
    await waitForState(instanceId, 'running', 900000); // 15 minutes
    currentState = await getInstanceState(instanceId);
  }

  // Stop the instance if it's running or stopping
  if (currentState === 'running') {
    console.log(\`Stopping instance \${instanceId}...\`);
    await ec2Client.send(new StopInstancesCommand({ InstanceIds: [instanceId] }));
    await waitForState(instanceId, 'stopped');
  } else if (currentState === 'stopping') {
    console.log(\`Instance \${instanceId} is already stopping. Waiting for stopped state...\`);
    await waitForState(instanceId, 'stopped');
  } else if (currentState === 'stopped') {
    console.log(\`Instance \${instanceId} is already stopped\`);
  } else {
    throw new Error(
      \`Cannot stop instance \${instanceId} from \${currentState} state. Must be running or stopping.\`
    );
  }

  // Start the instance
  currentState = await getInstanceState(instanceId);
  if (currentState === 'stopped') {
    console.log(\`Starting instance \${instanceId}...\`);
    await ec2Client.send(new StartInstancesCommand({ InstanceIds: [instanceId] }));
    await waitForState(instanceId, 'running', 900000); // 15 minutes for starting
  } else if (currentState === 'pending') {
    console.log(\`Instance \${instanceId} is already starting. Waiting for running state...\`);
    await waitForState(instanceId, 'running', 900000);
  } else if (currentState === 'running') {
    console.log(\`Instance \${instanceId} is already running\`);
  } else {
    throw new Error(
      \`Cannot start instance \${instanceId} from \${currentState} state. Must be stopped or pending.\`
    );
  }

  console.log(\`✅ Emergency restart completed successfully for instance \${instanceId}\`);
}

exports.handler = async (event) => {
  const instanceId = process.env.INSTANCE_ID;

  if (!instanceId) {
    console.error('INSTANCE_ID environment variable not set');
    throw new Error('INSTANCE_ID environment variable not set');
  }

  // Extract alarm information from event
  const alarmName = event?.AlarmName || event?.detail?.alarmName || 'Unknown';
  const alarmReason = event?.NewStateReason || event?.detail?.reason || 'No reason provided';
  const triggerTime = new Date().toISOString();

  console.log(\`🚨 Emergency restart triggered by alarm: \${alarmName}\`);
  console.log(\`Reason: \${alarmReason}\`);
  console.log(\`Trigger time: \${triggerTime}\`);
  console.log(\`Instance ID: \${instanceId}\`);

  try {
    await stopAndStart(instanceId);
    
    return {
      statusCode: 200,
      body: JSON.stringify({
        message: \`Emergency restart completed for instance \${instanceId}\`,
        alarmName,
        triggerTime,
        instanceId,
      }),
    };
  } catch (error) {
    console.error(\`❌ Emergency restart failed for instance \${instanceId}:\`, error);
    
    return {
      statusCode: 500,
      body: JSON.stringify({
        message: \`Emergency restart failed for instance \${instanceId}\`,
        error: error.message,
        alarmName,
        triggerTime,
        instanceId,
      }),
    };
  }
};
      `),
      handler: 'index.handler',
      role: restartLambdaRole,
      timeout: Duration.minutes(20), // Allow time for stop/start cycle
      memorySize: 256,
      environment: {
        INSTANCE_ID: instanceId,
        DOMAIN_NAME: domainName,
      },
      description: 'Emergency restart Lambda - automatically restarts instance on critical failures',
    });

    // Add Lambda action to alarms (passed in from instance stack)
    // Note: These alarms are created in the instance stack, but we add the Lambda action here
    // The instance stack will need to be updated to accept and use this Lambda ARN
  }
}














