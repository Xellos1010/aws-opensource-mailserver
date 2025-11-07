import {
  aws_lambda as lambda,
  aws_events as events,
  aws_events_targets as targets,
  aws_iam as iam,
  Duration,
} from 'aws-cdk-lib';
import { Construct } from 'constructs';

export interface NightlyRebootProps {
  /** EC2 instance ID to reboot */
  instanceId: string;
  /** Cron schedule (default: "0 8 * * ? *" = 08:00 UTC) */
  schedule?: string;
  /** Description (default: "03:00 ET (08:00 UTC) daily") */
  description?: string;
  /** AWS region */
  region: string;
  /** AWS account ID */
  account: string;
}

/**
 * Creates Lambda function and EventBridge rule for nightly instance reboot
 */
export function createNightlyReboot(
  scope: Construct,
  id: string,
  props: NightlyRebootProps
): { lambda: lambda.Function; rule: events.Rule } {
  const {
    instanceId,
    schedule = '0 8 * * ? *',
    description = 'Daily reboot of Mail-in-a-Box instance at 03:00 ET (08:00 UTC)',
    region,
    account,
  } = props;

  const rebootLambdaRole = new iam.Role(scope, `${id}Role`, {
    assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
    managedPolicies: [
      iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole'),
    ],
  });

  // Allow the Lambda to reboot EC2 instances
  rebootLambdaRole.addToPolicy(
    new iam.PolicyStatement({
      actions: ['ec2:RebootInstances'],
      resources: [`arn:aws:ec2:${region}:${account}:instance/${instanceId}`],
    })
  );

  const rebootLambda = new lambda.Function(scope, `${id}Function`, {
    runtime: lambda.Runtime.NODEJS_20_X,
    code: lambda.Code.fromInline(`
import { EC2Client, RebootInstancesCommand } from '@aws-sdk/client-ec2';

const ec2Client = new EC2Client({ region: process.env.AWS_REGION });

export const handler = async (event: any) => {
  const instanceId = process.env.INSTANCE_ID;

  if (!instanceId) {
    console.error('INSTANCE_ID environment variable not set');
    throw new Error('INSTANCE_ID environment variable not set');
  }

  console.log(\`Rebooting Mail-in-a-Box instance: \${instanceId}\`);

  try {
    await ec2Client.send(
      new RebootInstancesCommand({
        InstanceIds: [instanceId],
      })
    );

    console.log(\`Successfully initiated reboot for instance: \${instanceId}\`);
    return {
      statusCode: 200,
      body: \`Reboot initiated for instance \${instanceId}\`,
    };
  } catch (error) {
    console.error(\`Failed to reboot instance \${instanceId}:\`, error);
    throw error;
  }
};
    `),
    handler: 'index.handler',
    role: rebootLambdaRole,
    timeout: Duration.seconds(30),
    environment: {
      INSTANCE_ID: instanceId,
    },
  });

  // Parse cron expression
  const [minute, hour, day, month, year] = schedule.split(' ');

  const rebootRule = new events.Rule(scope, `${id}Rule`, {
    schedule: events.Schedule.cron({
      minute,
      hour,
      day,
      month,
      year,
    }),
    description,
    enabled: true,
  });

  rebootRule.addTarget(new targets.LambdaFunction(rebootLambda));

  return { lambda: rebootLambda, rule: rebootRule };
}
