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

  // Allow SSM for pre-reboot disk cleanup
  rebootLambdaRole.addToPolicy(
    new iam.PolicyStatement({
      actions: [
        'ssm:SendCommand',
        'ssm:GetCommandInvocation',
      ],
      resources: ['*'],
    })
  );

  const rebootLambda = new lambda.Function(scope, `${id}Function`, {
    runtime: lambda.Runtime.NODEJS_20_X,
    code: lambda.Code.fromInline(`
const { EC2Client, RebootInstancesCommand } = require('@aws-sdk/client-ec2');
const { SSMClient, SendCommandCommand, GetCommandInvocationCommand } = require('@aws-sdk/client-ssm');

const ec2Client = new EC2Client({ region: process.env.AWS_REGION });
const ssmClient = new SSMClient({ region: process.env.AWS_REGION });

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function runPreRebootDiskCleanup(instanceId) {
  const cleanupScript = [
    'journalctl --vacuum-size=100M 2>/dev/null || true',
    'journalctl --vacuum-time=7d 2>/dev/null || true',
    'apt-get clean 2>/dev/null || true',
    'find /var/log/amazon/ssm -name "*.log.*" -mtime +0 -delete 2>/dev/null || true',
    'find /var/log -name "*.gz" -mtime +3 -delete 2>/dev/null || true',
    'find /tmp -type f -mtime +1 -delete 2>/dev/null || true',
    'echo "Disk after pre-reboot cleanup:" && df -h / | tail -1',
  ].join('\\n');

  try {
    console.log('Running pre-reboot disk cleanup via SSM...');
    const sendResp = await ssmClient.send(new SendCommandCommand({
      InstanceIds: [instanceId],
      DocumentName: 'AWS-RunShellScript',
      Parameters: { commands: [cleanupScript] },
      TimeoutSeconds: 60,
    }));

    const commandId = sendResp.Command.CommandId;

    // Poll for completion (up to 75 seconds)
    for (let i = 0; i < 25; i++) {
      await sleep(3000);
      const result = await ssmClient.send(new GetCommandInvocationCommand({
        CommandId: commandId,
        InstanceId: instanceId,
      }));

      if (['Success', 'Failed', 'TimedOut', 'Cancelled'].includes(result.Status)) {
        console.log('Pre-reboot disk cleanup status:', result.Status);
        if (result.StandardOutputContent) {
          console.log(result.StandardOutputContent);
        }
        return result.Status === 'Success';
      }
    }
    console.log('Disk cleanup polling timed out - proceeding with reboot anyway');
    return false;
  } catch (err) {
    console.warn('Pre-reboot disk cleanup failed (non-fatal):', err.message);
    return false;
  }
}

exports.handler = async (event) => {
  const instanceId = process.env.INSTANCE_ID;

  if (!instanceId) {
    console.error('INSTANCE_ID environment variable not set');
    throw new Error('INSTANCE_ID environment variable not set');
  }

  // Step 1: Run disk cleanup before reboot to prevent boot failures from disk-full
  console.log(\`Pre-reboot disk cleanup for instance: \${instanceId}\`);
  const cleanupOk = await runPreRebootDiskCleanup(instanceId);
  console.log(\`Disk cleanup \${cleanupOk ? 'succeeded' : 'skipped/failed (non-fatal)'}\`);

  // Step 2: Reboot the instance
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
      body: \`Reboot initiated for instance \${instanceId} (disk cleanup: \${cleanupOk ? 'ok' : 'skipped'})\`,
    };
  } catch (error) {
    console.error(\`Failed to reboot instance \${instanceId}:\`, error);
    throw error;
  }
};
    `),
    handler: 'index.handler',
    role: rebootLambdaRole,
    timeout: Duration.seconds(120),
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
