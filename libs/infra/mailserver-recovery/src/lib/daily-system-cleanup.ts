import {
  Duration,
  aws_events as events,
  aws_events_targets as targets,
  aws_iam as iam,
  aws_lambda as lambda,
} from 'aws-cdk-lib';
import { Construct } from 'constructs';

export interface DailySystemCleanupProps {
  /** EC2 instance ID to clean */
  instanceId: string;
  /** EventBridge schedule expression (default: 02:30 ET / 07:30 UTC daily) */
  scheduleExpression?: string;
  /** Rule description */
  description?: string;
}

/**
 * Creates Lambda function and EventBridge rule for daily non-critical system cleanup.
 * This intentionally does not restart or stop/start the instance.
 */
export function createDailySystemCleanup(
  scope: Construct,
  id: string,
  props: DailySystemCleanupProps
): { lambda: lambda.Function; rule: events.Rule } {
  const {
    instanceId,
    scheduleExpression = 'cron(30 7 * * ? *)',
    description = 'Daily non-critical cleanup for Mail-in-a-Box instance at 02:30 ET (07:30 UTC)',
  } = props;

  const cleanupLambdaRole = new iam.Role(scope, `${id}Role`, {
    assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
    managedPolicies: [
      iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole'),
    ],
  });

  cleanupLambdaRole.addToPolicy(
    new iam.PolicyStatement({
      actions: ['ssm:SendCommand', 'ssm:GetCommandInvocation'],
      resources: ['*'],
    })
  );

  const cleanupLambda = new lambda.Function(scope, `${id}Function`, {
    runtime: lambda.Runtime.NODEJS_20_X,
    code: lambda.Code.fromInline(`
const { SSMClient, SendCommandCommand, GetCommandInvocationCommand } = require('@aws-sdk/client-ssm');

const ssmClient = new SSMClient({ region: process.env.AWS_REGION });

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runCleanup(instanceId) {
  const cleanupScript = [
    'set +e',
    'echo "Disk before cleanup:" && df -h / | tail -1',
    'journalctl --vacuum-time=7d 2>/dev/null || true',
    'journalctl --vacuum-size=100M 2>/dev/null || true',
    'apt-get clean 2>/dev/null || true',
    'apt-get autoclean -y 2>/dev/null || true',
    'find /var/log -type f -name "*.log" -mtime +7 -delete 2>/dev/null || true',
    'find /var/log -type f -name "*.gz" -mtime +3 -delete 2>/dev/null || true',
    'find /tmp -type f -mtime +1 -delete 2>/dev/null || true',
    'find /var/tmp -type f -mtime +2 -delete 2>/dev/null || true',
    'find /home/user-data -type f -name "*.tmp" -mtime +1 -delete 2>/dev/null || true',
    'mkdir -p /var/log/roundcubemail',
    'touch /var/log/roundcubemail/errors.log /var/log/fail2ban.log',
    'chown www-data:www-data /var/log/roundcubemail/errors.log 2>/dev/null || true',
    'chmod 640 /var/log/roundcubemail/errors.log /var/log/fail2ban.log 2>/dev/null || true',
    'chown root:adm /var/log/fail2ban.log 2>/dev/null || true',
    'systemctl is-active fail2ban >/dev/null 2>&1 || systemctl restart fail2ban 2>/dev/null || true',
    'echo "Disk after cleanup:" && df -h / | tail -1',
  ].join('\\n');

  const sendResp = await ssmClient.send(new SendCommandCommand({
    InstanceIds: [instanceId],
    DocumentName: 'AWS-RunShellScript',
    Parameters: { commands: [cleanupScript] },
    TimeoutSeconds: 120,
  }));

  const commandId = sendResp.Command?.CommandId;
  if (!commandId) {
    throw new Error('SSM command did not return CommandId');
  }

  for (let i = 0; i < 40; i++) {
    await sleep(3000);
    const result = await ssmClient.send(new GetCommandInvocationCommand({
      CommandId: commandId,
      InstanceId: instanceId,
    }));

    if (['Success', 'Failed', 'TimedOut', 'Cancelled'].includes(result.Status || '')) {
      return result;
    }
  }

  throw new Error('Cleanup command polling timed out');
}

exports.handler = async () => {
  const instanceId = process.env.INSTANCE_ID;
  if (!instanceId) {
    throw new Error('INSTANCE_ID environment variable not set');
  }

  console.log('Starting scheduled non-critical cleanup for instance:', instanceId);
  const result = await runCleanup(instanceId);

  console.log('Cleanup command status:', result.Status);
  if (result.StandardOutputContent) {
    console.log(result.StandardOutputContent);
  }
  if (result.StandardErrorContent) {
    console.log(result.StandardErrorContent);
  }

  if (result.Status !== 'Success') {
    throw new Error('Cleanup command failed with status ' + result.Status);
  }

  return {
    statusCode: 200,
    body: 'Non-critical cleanup completed successfully for ' + instanceId,
  };
};
    `),
    handler: 'index.handler',
    role: cleanupLambdaRole,
    timeout: Duration.seconds(180),
    environment: {
      INSTANCE_ID: instanceId,
    },
  });

  const cleanupRule = new events.Rule(scope, `${id}Rule`, {
    schedule: events.Schedule.expression(scheduleExpression),
    description,
    enabled: true,
  });

  cleanupRule.addTarget(new targets.LambdaFunction(cleanupLambda));

  return { lambda: cleanupLambda, rule: cleanupRule };
}
