#!/usr/bin/env ts-node

/**
 * Diagnose Password Authentication
 *
 * Checks how passwords are stored and validates authentication
 */

import { resolveStackName, getStackInfo } from '@mm/admin-stack-info';
import { SSMClient, SendCommandCommand, GetCommandInvocationCommand } from '@aws-sdk/client-ssm';
import { fromIni } from '@aws-sdk/credential-providers';

async function diagnosePassword(): Promise<void> {
  const region = process.env.AWS_REGION || 'us-east-1';
  const profile = process.env.AWS_PROFILE || 'hepe-admin-mfa';
  const email = process.env.EMAIL || 'certifiedlsa@emcnotary.com';
  const password = process.env.PASSWORD || 'Coke@cola10!';

  console.log('🔍 Password Authentication Diagnostics\n');
  console.log(`   Email: ${email}`);
  console.log(`   Testing password authentication...\n`);

  const stackInfo = await getStackInfo({
    stackName: resolveStackName('emcnotary.com', 'apps/cdk-emc-notary/instance', undefined, 'instance'),
    region,
    profile,
  });

  const credentials = fromIni({ profile });
  const ssmClient = new SSMClient({ region, credentials });

  const escapedPassword = password.replace(/'/g, "'\\''");

  const result = await ssmClient.send(
    new SendCommandCommand({
      InstanceIds: [stackInfo.instanceId],
      DocumentName: 'AWS-RunShellScript',
      Parameters: {
        commands: [
          `
echo "=== 1. Password Database Info ==="
if [ -f /home/user-data/mail/users.sqlite ]; then
  ls -lh /home/user-data/mail/users.sqlite
  echo ""
  echo "Database exists: YES"
else
  echo "Database exists: NO"
fi

echo ""
echo "=== 2. User Exists in Database ==="
sqlite3 /home/user-data/mail/users.sqlite "SELECT email FROM users WHERE email='${email}'" || echo "Query failed"

echo ""
echo "=== 3. Password Hash Type ==="
HASH=$(sqlite3 /home/user-data/mail/users.sqlite "SELECT password FROM users WHERE email='${email}'")
echo "Hash prefix: \${HASH:0:20}..."
if [[ \$HASH == \\$6\\$* ]]; then
  echo "Hash type: SHA-512 (Linux standard)"
elif [[ \$HASH == {CRAM-MD5}* ]]; then
  echo "Hash type: CRAM-MD5"
else
  echo "Hash type: Unknown or plaintext"
fi

echo ""
echo "=== 4. Test Dovecot IMAP Authentication ==="
doveadm auth test '${email}' '${escapedPassword}' 2>&1

echo ""
echo "=== 5. How Mail-in-a-Box Sets Passwords ==="
echo "Mail-in-a-Box uses:"
echo "  - management/daemon.py for password changes via API"
echo "  - tools/mail.py user_password for CLI changes"
echo "  - Dovecot for IMAP/POP3 auth"
echo "  - Postfix (via Dovecot SASL) for SMTP auth"

echo ""
echo "=== 6. Last Password Change Method ==="
if [ -f /var/log/syslog ]; then
  echo "Recent password-related logs:"
  grep -i "password" /var/log/syslog 2>/dev/null | tail -5 || echo "No password logs found"
fi
`,
        ],
      },
    })
  );

  const commandId = result.Command?.CommandId;
  console.log(`Command ID: ${commandId}\n`);
  console.log('Waiting for results...\n');

  await new Promise((resolve) => setTimeout(resolve, 10000));

  const invocation = await ssmClient.send(
    new GetCommandInvocationCommand({
      CommandId: commandId!,
      InstanceId: stackInfo.instanceId,
    })
  );

  console.log(invocation.StandardOutputContent || 'No output');

  if (invocation.StandardErrorContent) {
    console.log('\n❌ Errors:');
    console.log(invocation.StandardErrorContent);
  }

  console.log('\n💡 Understanding Mail-in-a-Box Password Authentication:\n');
  console.log('1. Passwords are stored in: /home/user-data/mail/users.sqlite');
  console.log('2. Format: SHA-512 crypt hashes ($6$...)');
  console.log('3. Set via: management/cli.py user_password <email> <password>');
  console.log('4. Used by:');
  console.log('   - Dovecot (IMAP/POP3)');
  console.log('   - Postfix (SMTP via Dovecot SASL)');
  console.log('   - Webmail (Roundcube via Dovecot)');
  console.log('   - Admin panel (separate, uses /home/user-data/users.sqlite)\n');
  console.log('5. The correct way to set a password:');
  console.log('   management/cli.py user_password <email> <password>\n');
}

if (require.main === module) {
  diagnosePassword().catch((error) => {
    console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  });
}

export { diagnosePassword };
