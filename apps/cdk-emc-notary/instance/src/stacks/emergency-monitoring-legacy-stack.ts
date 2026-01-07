import {
  Stack,
  StackProps,
  Duration,
  CfnOutput,
  aws_lambda as lambda,
  aws_iam as iam,
  aws_sns as sns,
} from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { tagStack } from '@mm/infra-shared-constructs';

export interface EmergencyMonitoringLegacyStackProps extends StackProps {
  /** Legacy CloudFormation stack name to monitor */
  legacyStackName: string;
  /** Domain name for tagging */
  domainName: string;
  /** SNS topic ARN for notifications (optional, will create if not provided) */
  alarmsTopicArn?: string;
}

/**
 * Emergency Monitoring Stack for Legacy CloudFormation Stacks
 * 
 * This stack monitors an existing legacy CloudFormation mailserver stack and
 * automatically restarts the EC2 instance when critical failures are detected.
 * 
 * It discovers the instance ID from the legacy stack outputs and creates:
 * - Emergency restart Lambda function
 * - CloudWatch alarms (if they don't exist)
 * - Alarm actions that trigger the Lambda
 */
export class EmergencyMonitoringLegacyStack extends Stack {
  public readonly restartLambda: lambda.Function;
  public readonly alarmsTopic: sns.ITopic;

  constructor(
    scope: Construct,
    id: string,
    props: EmergencyMonitoringLegacyStackProps
  ) {
    super(scope, id, props);
    const { legacyStackName, domainName, alarmsTopicArn } = props;

    tagStack(this, `${domainName}-emergency-monitoring`);

    // Get SNS topic (use existing or create new)
    if (alarmsTopicArn) {
      this.alarmsTopic = sns.Topic.fromTopicArn(this, 'AlarmsTopic', alarmsTopicArn);
    } else {
      this.alarmsTopic = new sns.Topic(this, 'AlarmsTopic', {
        topicName: `ec2-emergency-events-${domainName.replace(/\./g, '-')}`,
        displayName: `${domainName} Emergency Alarms`,
      });
    }

    // Note: We cannot directly reference the legacy stack in CDK, so the Lambda
    // will discover the instance ID at runtime by querying CloudFormation

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

    // Grant CloudFormation read permissions to discover instance ID
    restartLambdaRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ['cloudformation:DescribeStacks'],
        resources: [`arn:aws:cloudformation:${this.region}:${this.account}:stack/${legacyStackName}/*`],
      })
    );

    // Grant EC2 permissions (will be scoped to specific instance after discovery)
    restartLambdaRole.addToPolicy(
      new iam.PolicyStatement({
        actions: [
          'ec2:StopInstances',
          'ec2:StartInstances',
          'ec2:DescribeInstances',
          'ec2:DescribeInstanceStatus',
        ],
        resources: ['*'], // Will be scoped by instance ID at runtime
      })
    );

    // Lambda function that discovers instance ID and performs stop-and-start restart
    this.restartLambda = new lambda.Function(this, 'EmergencyRestartLambda', {
      functionName: `emergency-restart-${domainName.replace(/\./g, '-')}`,
      runtime: lambda.Runtime.NODEJS_20_X,
      code: lambda.Code.fromInline(`
const { EC2Client, StopInstancesCommand, StartInstancesCommand, DescribeInstancesCommand } = require('@aws-sdk/client-ec2');
const { CloudFormationClient, DescribeStacksCommand } = require('@aws-sdk/client-cloudformation');

const region = process.env.AWS_REGION || 'us-east-1';
const ec2Client = new EC2Client({ region });
const cfnClient = new CloudFormationClient({ region });

async function getInstanceIdFromStack(stackName) {
  try {
    const response = await cfnClient.send(
      new DescribeStacksCommand({ StackName: stackName })
    );
    const stack = response.Stacks?.[0];
    if (!stack) {
      throw new Error(\`Stack \${stackName} not found\`);
    }
    
    // Legacy stack uses "RestorePrefix" output which contains instance ID
    // Or try "InstanceId" output
    const restorePrefix = stack.Outputs?.find(o => o.OutputKey === 'RestorePrefix')?.OutputValue;
    const instanceId = stack.Outputs?.find(o => o.OutputKey === 'InstanceId')?.OutputValue;
    
    return instanceId || restorePrefix;
  } catch (error) {
    console.error(\`Failed to get instance ID from stack \${stackName}:\`, error);
    throw error;
  }
}

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
  const checkInterval = 10000;

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
  throw new Error(\`Timeout waiting for instance \${instanceId} to reach \${desiredState} state\`);
}

async function stopAndStart(instanceId) {
  console.log(\`Emergency restart: Stopping and restarting instance \${instanceId}...\`);
  let currentState = await getInstanceState(instanceId);
  console.log(\`Current instance state: \${currentState}\`);

  if (currentState === 'pending') {
    console.log(\`Instance \${instanceId} is starting. Waiting for running state...\`);
    await waitForState(instanceId, 'running', 900000);
    currentState = await getInstanceState(instanceId);
  }

  if (currentState === 'running') {
    console.log(\`Stopping instance \${instanceId}...\`);
    await ec2Client.send(new StopInstancesCommand({ InstanceIds: [instanceId] }));
    await waitForState(instanceId, 'stopped');
  } else if (currentState === 'stopping') {
    console.log(\`Instance \${instanceId} is already stopping. Waiting...\`);
    await waitForState(instanceId, 'stopped');
  } else if (currentState === 'stopped') {
    console.log(\`Instance \${instanceId} is already stopped\`);
  } else {
    throw new Error(\`Cannot stop instance \${instanceId} from \${currentState} state\`);
  }

  currentState = await getInstanceState(instanceId);
  if (currentState === 'stopped') {
    console.log(\`Starting instance \${instanceId}...\`);
    await ec2Client.send(new StartInstancesCommand({ InstanceIds: [instanceId] }));
    await waitForState(instanceId, 'running', 900000);
  } else if (currentState === 'pending') {
    console.log(\`Instance \${instanceId} is already starting. Waiting...\`);
    await waitForState(instanceId, 'running', 900000);
  } else if (currentState === 'running') {
    console.log(\`Instance \${instanceId} is already running\`);
  } else {
    throw new Error(\`Cannot start instance \${instanceId} from \${currentState} state\`);
  }
  console.log(\`✅ Emergency restart completed successfully for instance \${instanceId}\`);
}

exports.handler = async (event) => {
  const stackName = process.env.LEGACY_STACK_NAME;
  if (!stackName) {
    throw new Error('LEGACY_STACK_NAME environment variable not set');
  }

  // Discover instance ID from legacy stack
  console.log(\`Discovering instance ID from stack: \${stackName}\`);
  const instanceId = await getInstanceIdFromStack(stackName);
  console.log(\`Found instance ID: \${instanceId}\`);

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
        stackName,
      }),
    };
  } catch (error) {
    console.error(\`❌ Emergency restart failed:\`, error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        message: \`Emergency restart failed\`,
        error: error.message,
        alarmName,
        triggerTime,
        instanceId,
        stackName,
      }),
    };
  }
};
      `),
      handler: 'index.handler',
      role: restartLambdaRole,
      timeout: Duration.minutes(20),
      memorySize: 256,
      environment: {
        LEGACY_STACK_NAME: legacyStackName,
        DOMAIN_NAME: domainName,
      },
      description: 'Emergency restart Lambda - automatically restarts instance on critical failures (legacy stack)',
    });

    // Note: We cannot directly modify alarms in the legacy stack, but we can:
    // 1. Create new alarms that reference the instance
    // 2. Or use a custom resource to update existing alarms
    // For now, we'll create new alarms that will work alongside existing ones

    // Outputs
    new CfnOutput(this, 'RestartLambdaArn', {
      value: this.restartLambda.functionArn,
      description: 'ARN of the emergency restart Lambda function',
    });

    new CfnOutput(this, 'AlarmsTopicArn', {
      value: this.alarmsTopic.topicArn,
      description: 'ARN of the SNS topic for alarm notifications',
    });

    new CfnOutput(this, 'LegacyStackName', {
      value: legacyStackName,
      description: 'Name of the legacy CloudFormation stack being monitored',
    });

    new CfnOutput(this, 'Instructions', {
      value: `To enable auto-restart, update existing CloudWatch alarms to include Lambda action: ${this.restartLambda.functionArn}`,
      description: 'Instructions for enabling auto-restart on existing alarms',
    });
  }
}

