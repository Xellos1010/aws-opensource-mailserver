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
const { EC2Client, RebootInstancesCommand } = require('@aws-sdk/client-ec2');

const ec2Client = new EC2Client({ region: process.env.AWS_REGION });

exports.handler = async (event) => {
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

  // Parse cron expression (EventBridge uses 6 fields: minute, hour, day-of-month, month, day-of-week, year)
  const cronParts = schedule.split(' ');
  if (cronParts.length !== 6) {
    throw new Error(
      `Invalid cron schedule format. Expected 6 fields (minute hour day-of-month month day-of-week year), got ${cronParts.length} fields: "${schedule}"`
    );
  }
  const [minute, hour, dayOfMonth, month, dayOfWeek, year] = cronParts;

  // CDK's Schedule.cron() doesn't allow both 'day' and 'weekDay' to be set
  // If day-of-week is '?', use weekDay and omit day
  // If day-of-month is '?', use day and omit weekDay
  const cronOptions: {
    minute: string;
    hour: string;
    month: string;
    year: string;
    day?: string;
    weekDay?: string;
  } = {
    minute,
    hour,
    month,
    year,
  };

  if (dayOfWeek === '?') {
    // Use day-of-month, ignore day-of-week
    cronOptions.day = dayOfMonth;
  } else {
    // Use day-of-week, ignore day-of-month
    cronOptions.weekDay = dayOfWeek;
    if (dayOfMonth !== '?') {
      // If both are specified (neither is '?'), prefer weekDay for daily schedules
      cronOptions.weekDay = dayOfWeek;
    }
  }

  const rebootRule = new events.Rule(scope, `${id}Rule`, {
    schedule: events.Schedule.cron(cronOptions),
    description,
    enabled: true,
  });

  rebootRule.addTarget(new targets.LambdaFunction(rebootLambda));

  return { lambda: rebootLambda, rule: rebootRule };
}
