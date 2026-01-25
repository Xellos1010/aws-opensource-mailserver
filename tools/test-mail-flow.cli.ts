#!/usr/bin/env ts-node

/**
 * Test Mail Flow
 *
 * Sends test emails via postfix/sendmail and validates IMAP auth via doveadm.
 */

import { resolveStackName, resolveDomain, getStackInfo } from '@mm/admin-stack-info';
import { SSMClient, SendCommandCommand, GetCommandInvocationCommand } from '@aws-sdk/client-ssm';
import { fromIni } from '@aws-sdk/credential-providers';

interface TestMailFlowOptions {
  domain?: string;
  appPath?: string;
  region?: string;
  profile?: string;
  fromEmail: string;
  fromPassword: string;
  recipients: string[];
  subject?: string;
  body?: string;
}

async function testMailFlow(options: TestMailFlowOptions): Promise<void> {
  const region = options.region || process.env.AWS_REGION || 'us-east-1';
  const profile = options.profile || process.env.AWS_PROFILE || 'hepe-admin-mfa';
  const domain = options.domain || process.env.DOMAIN;
  const appPath = options.appPath || process.env.APP_PATH;
  const subject = options.subject || `Mail flow test ${new Date().toISOString()}`;
  const body = options.body || 'Mail flow test message';

  if (!domain && !appPath) {
    throw new Error('Cannot resolve domain. Provide domain or appPath');
  }

  const resolvedDomain = domain || (appPath ? resolveDomain(appPath) : null);
  if (!resolvedDomain) {
    throw new Error('Cannot resolve domain. Provide domain or appPath');
  }

  if (!options.fromEmail || !options.fromPassword) {
    throw new Error('Missing fromEmail/fromPassword');
  }

  if (!options.recipients || options.recipients.length === 0) {
    throw new Error('Missing recipients');
  }

  console.log('✉️  Test Mail Flow');
  console.log(`   Domain: ${resolvedDomain}`);
  console.log(`   From:   ${options.fromEmail}`);
  console.log(`   To:     ${options.recipients.join(', ')}\n`);

  const instanceStackName = resolveStackName(resolvedDomain, appPath, undefined, 'instance');
  const stackInfo = await getStackInfo({
    stackName: instanceStackName,
    region,
    profile,
  });

  const instanceId = stackInfo.instanceId;
  if (!instanceId) {
    throw new Error(`Could not determine instance ID from stack ${instanceStackName}`);
  }

  const ssmCredentials = fromIni({ profile });
  const ssmClient = new SSMClient({ region, credentials: ssmCredentials });

  const fromEmailB64 = Buffer.from(options.fromEmail).toString('base64');
  const fromPasswordB64 = Buffer.from(options.fromPassword).toString('base64');
  const recipientsB64 = Buffer.from(JSON.stringify(options.recipients)).toString('base64');
  const subjectB64 = Buffer.from(subject).toString('base64');
  const bodyB64 = Buffer.from(body).toString('base64');

  const command = [
    'set -e',
    'FROM_EMAIL=$(echo "' + fromEmailB64 + '" | base64 -d)',
    'FROM_PASS=$(echo "' + fromPasswordB64 + '" | base64 -d)',
    'RECIPIENTS=$(echo "' + recipientsB64 + '" | base64 -d)',
    'SUBJECT=$(echo "' + subjectB64 + '" | base64 -d)',
    'BODY=$(echo "' + bodyB64 + '" | base64 -d)',
    'echo "=== IMAP auth test ==="',
    'sudo doveadm auth test "$FROM_EMAIL" "$FROM_PASS" 2>&1 || echo "IMAP_AUTH_FAILED"',
    'echo ""',
    'echo "=== Sending emails ==="',
    'RECIPIENT_LIST=$(printf "%s" "$RECIPIENTS" | python3 -c "import json,sys; print(\' \'.join(json.loads(sys.stdin.read())))")',
    'for TO in $RECIPIENT_LIST; do\n' +
      '  MSG_ID=$(date +%s%N)\n' +
      '  echo "Sending to $TO (msg $MSG_ID)"\n' +
      '  printf "From: %s\\nTo: %s\\nSubject: %s\\n\\n%s\\n\\nMSG-ID:%s\\n" "$FROM_EMAIL" "$TO" "$SUBJECT" "$BODY" "$MSG_ID" | sendmail -t\n' +
      'done',
    'echo ""',
    'echo "=== Postfix queue ==="',
    'mailq || true',
    'echo ""',
    'echo "=== Recent mail.log ==="',
    'tail -n 200 /var/log/mail.log || true',
  ].join('\n');

  const result = await ssmClient.send(
    new SendCommandCommand({
      InstanceIds: [instanceId],
      DocumentName: 'AWS-RunShellScript',
      Parameters: {
        commands: [command],
      },
    })
  );

  const commandId = result.Command?.CommandId;
  if (!commandId) {
    throw new Error('Failed to send mail flow command');
  }

  await new Promise(resolve => setTimeout(resolve, 8000));

  const invocation = await ssmClient.send(
    new GetCommandInvocationCommand({
      CommandId: commandId,
      InstanceId: instanceId,
    })
  );

  const output = invocation.StandardOutputContent || '';
  const error = invocation.StandardErrorContent || '';

  if (invocation.Status !== 'Success') {
    throw new Error(`Mail flow test failed: ${error || output || 'Unknown error'}`);
  }

  console.log(output.trim() || 'No output');
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const options: Partial<TestMailFlowOptions> = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    switch (arg) {
      case '--domain':
      case '-d':
        options.domain = args[++i];
        break;
      case '--app-path':
        options.appPath = args[++i];
        break;
      case '--region':
      case '-r':
        options.region = args[++i];
        break;
      case '--profile':
        options.profile = args[++i];
        break;
      case '--from-email':
        options.fromEmail = args[++i];
        break;
      case '--from-password':
        options.fromPassword = args[++i];
        break;
      case '--to':
        options.recipients = args[++i].split(',').map(v => v.trim());
        break;
      case '--subject':
        options.subject = args[++i];
        break;
      case '--body':
        options.body = args[++i];
        break;
      case '--help':
      case '-h':
        console.log(`
Usage: test-mail-flow.cli.ts [options]

Sends test emails via sendmail and validates IMAP auth.

Options:
  --domain, -d <domain>        Domain name (default: from APP_PATH or DOMAIN env)
  --app-path <path>            App path (default: from APP_PATH env)
  --region, -r <region>        AWS region (default: us-east-1)
  --profile <profile>          AWS profile (default: hepe-admin-mfa)
  --from-email <email>         Sender email
  --from-password <password>   Sender password
  --to <list>                  Comma-separated recipients
  --subject <text>             Subject line
  --body <text>                Body text
  --help, -h                   Show this help
`);
        process.exit(0);
        break;
    }
  }

  testMailFlow(options as TestMailFlowOptions).catch((error) => {
    console.error(`Fatal error: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  });
}

export { testMailFlow };
