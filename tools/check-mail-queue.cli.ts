#!/usr/bin/env ts-node

/**
 * Check Mail Queue
 *
 * Simple tool to check mail queue status and recent delivery logs
 */

import { resolveStackName, resolveDomain, getStackInfo } from '@mm/admin-stack-info';
import { SSMClient, SendCommandCommand, GetCommandInvocationCommand } from '@aws-sdk/client-ssm';
import { fromIni } from '@aws-sdk/credential-providers';

async function checkMailQueue(): Promise<void> {
  const region = process.env.AWS_REGION || 'us-east-1';
  const profile = process.env.AWS_PROFILE || 'hepe-admin-mfa';
  const domain = process.env.DOMAIN || 'emcnotary.com';
  const appPath = process.env.APP_PATH || 'apps/cdk-emc-notary/instance';

  console.log('📬 Checking Mail Queue\n');

  const instanceStackName = resolveStackName(domain, appPath, undefined, 'instance');
  const stackInfo = await getStackInfo({
    stackName: instanceStackName,
    region,
    profile,
  });

  const instanceId = stackInfo.instanceId;
  console.log(`Instance ID: ${instanceId}\n`);

  const credentials = fromIni({ profile });
  const ssmClient = new SSMClient({ region, credentials });

  const result = await ssmClient.send(
    new SendCommandCommand({
      InstanceIds: [instanceId],
      DocumentName: 'AWS-RunShellScript',
      Parameters: {
        commands: [
          'echo "=== MAIL QUEUE ===" && mailq',
          'echo ""',
          'echo "=== RECENT DELIVERY LOGS (last 30 lines) ===" && tail -30 /var/log/mail.log | grep -E "(status=|relay=|postfix/smtp)"',
        ],
      },
    })
  );

  const commandId = result.Command?.CommandId;
  console.log(`Command ID: ${commandId}\n`);
  console.log('Waiting for results...\n');

  await new Promise((resolve) => setTimeout(resolve, 8000));

  const invocation = await ssmClient.send(
    new GetCommandInvocationCommand({
      CommandId: commandId!,
      InstanceId: instanceId,
    })
  );

  if (invocation.Status !== 'Success') {
    console.log(`Status: ${invocation.Status}`);
    console.log(invocation.StandardErrorContent || 'No error output');
    process.exit(1);
  }

  console.log(invocation.StandardOutputContent || 'No output');
}

if (require.main === module) {
  checkMailQueue().catch((error) => {
    console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  });
}

export { checkMailQueue };
