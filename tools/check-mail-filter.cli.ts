#!/usr/bin/env ts-node

/**
 * Check Mail Filter / SMTP Inbound Health
 *
 * Inspects Postfix content filter settings and local listener on port 10023.
 */

import { resolveStackName, resolveDomain, getStackInfo } from '@mm/admin-stack-info';
import { SSMClient, SendCommandCommand, GetCommandInvocationCommand } from '@aws-sdk/client-ssm';
import { fromIni } from '@aws-sdk/credential-providers';

interface CheckMailFilterOptions {
  domain?: string;
  appPath?: string;
  region?: string;
  profile?: string;
}

async function checkMailFilter(options: CheckMailFilterOptions): Promise<void> {
  const region = options.region || process.env.AWS_REGION || 'us-east-1';
  const profile = options.profile || process.env.AWS_PROFILE || 'hepe-admin-mfa';
  const domain = options.domain || process.env.DOMAIN;
  const appPath = options.appPath || process.env.APP_PATH;

  if (!domain && !appPath) {
    throw new Error('Cannot resolve domain. Provide domain or appPath');
  }

  const resolvedDomain = domain || (appPath ? resolveDomain(appPath) : null);
  if (!resolvedDomain) {
    throw new Error('Cannot resolve domain. Provide domain or appPath');
  }

  console.log('🔍 Check Mail Filter Status');
  console.log(`   Domain: ${resolvedDomain}\n`);

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

  const credentials = fromIni({ profile });
  const ssmClient = new SSMClient({ region, credentials });

  const command = `
set -e
echo "=== Postfix content filter config ==="
postconf -n | egrep -i "content_filter|smtpd_milters|non_smtpd_milters|proxy|filter" || true
echo ""
echo "=== Postfix settings referencing 10023/10024 ==="
postconf -n | egrep -i "10023|10024" || echo "No 10023/10024 references in postconf -n"
echo ""
echo "=== Postfix master.cf filter services (10023/10024) ==="
postconf -M | egrep -i "10023|10024|spam|amavis|rspamd|filter" || true
echo ""
echo "=== Postfix master.cf entries with 10023/10024 ==="
grep -n "10023\\|10024" /etc/postfix/master.cf || echo "No 10023/10024 entries in master.cf"
echo ""
echo "=== Listeners on 10023/10024 ==="
ss -lntp | egrep "10023|10024" || echo "No listeners on 10023/10024"
echo ""
echo "=== Mail filter services ==="
systemctl list-units --type=service --state=running | egrep -i "amavis|spam|rspamd|clam|filter" || echo "No running mail filter services"
echo ""
echo "=== Policy services (postgrey/policyd) ==="
systemctl list-units --type=service --state=running | egrep -i "postgrey|policyd|postfix-policyd|spf|opendkim|opendmarc" || echo "No running policy services"
echo ""
systemctl status postgrey --no-pager -l | head -40 || true
echo ""
echo "=== spampd status/config ==="
systemctl status spampd --no-pager -l | head -40 || true
echo ""
ps -ef | grep -i "[s]pampd" || true
echo ""
for f in /etc/default/spampd /etc/spampd.conf /etc/spamassassin/local.cf; do
  if [ -f "$f" ]; then
    echo "---- $f ----"
    cat "$f" | head -80
    echo ""
  fi
done
echo ""
echo "=== Recent mail.log filter errors ==="
tail -n 200 /var/log/mail.log | egrep -i "10023|10024|filter|amavis|rspamd|spam" || echo "No recent filter errors"
`;

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
    throw new Error('Failed to send command');
  }

  await new Promise(resolve => setTimeout(resolve, 4000));

  const invocation = await ssmClient.send(
    new GetCommandInvocationCommand({
      CommandId: commandId,
      InstanceId: instanceId,
    })
  );

  if (invocation.Status !== 'Success') {
    throw new Error(invocation.StandardErrorContent || invocation.StandardOutputContent || 'Command failed');
  }

  const output = invocation.StandardOutputContent || '';
  console.log(output.trim() || 'No output');
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const options: CheckMailFilterOptions = {};

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
      case '--help':
      case '-h':
        console.log(`
Usage: check-mail-filter.cli.ts [options]

Checks Postfix content filter config and local listeners.

Options:
  --domain, -d <domain>     Domain name (default: from APP_PATH or DOMAIN env)
  --app-path <path>         App path (default: from APP_PATH env)
  --region, -r <region>     AWS region (default: us-east-1)
  --profile <profile>       AWS profile (default: hepe-admin-mfa)
  --help, -h                Show this help
`);
        process.exit(0);
        break;
    }
  }

  checkMailFilter(options).catch((error) => {
    console.error(`Fatal error: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  });
}

export { checkMailFilter };

