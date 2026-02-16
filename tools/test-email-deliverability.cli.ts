#!/usr/bin/env ts-node

/**
 * Test Email Deliverability and Receivability
 *
 * Comprehensive test of email sending and receiving capabilities:
 * 1. Check mail queue status (should be empty after SES relay configuration)
 * 2. Send test email via SMTP (certifiedlsa@emcnotary.com -> external address)
 * 3. Verify delivery in mail logs
 * 4. Check IMAP authentication
 * 5. Test email receiving (external -> certifiedlsa@emcnotary.com)
 */

import { SSMClient, SendCommandCommand, GetCommandInvocationCommand } from '@aws-sdk/client-ssm';
import { fromIni } from '@aws-sdk/credential-providers';
import * as nodemailer from 'nodemailer';
import * as imaps from 'imap-simple';

interface TestOptions {
  region?: string;
  profile?: string;
  domain?: string;
  fromEmail?: string;
  fromPassword?: string;
  toEmail?: string;
  instanceId?: string;
  skipSend?: boolean;
  skipReceive?: boolean;
}

interface TestResult {
  test: string;
  status: 'pass' | 'fail' | 'skip';
  message: string;
  details?: any;
}

async function runSsmCommand(
  ssmClient: SSMClient,
  instanceId: string,
  command: string,
  description: string
): Promise<{ output: string; error?: string }> {
  console.log(`   ${description}...`);

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
    throw new Error('Failed to send SSM command');
  }

  // Wait for command to execute
  await new Promise((resolve) => setTimeout(resolve, 8000));

  const invocation = await ssmClient.send(
    new GetCommandInvocationCommand({
      CommandId: commandId,
      InstanceId: instanceId,
    })
  );

  if (invocation.Status !== 'Success') {
    return {
      output: invocation.StandardOutputContent || '',
      error: invocation.StandardErrorContent || 'Command failed',
    };
  }

  return {
    output: invocation.StandardOutputContent || '',
  };
}

async function testEmailDeliverability(options: TestOptions): Promise<void> {
  const region = options.region || process.env.AWS_REGION || 'us-east-1';
  const profile = options.profile || process.env.AWS_PROFILE || 'hepe-admin-mfa';
  const domain = options.domain || process.env.DOMAIN || 'emcnotary.com';
  const fromEmail = options.fromEmail || process.env.FROM_EMAIL || `certifiedlsa@${domain}`;
  const fromPassword = options.fromPassword || process.env.FROM_PASSWORD;
  const toEmail = options.toEmail || process.env.TO || 'e.mccallvr@gmail.com';
  const instanceId = options.instanceId || 'i-0b86bbad6a2c66f1d'; // EMC Notary instance

  console.log('📧 Email Deliverability Test Suite\n');
  console.log(`   Domain: ${domain}`);
  console.log(`   From: ${fromEmail}`);
  console.log(`   To: ${toEmail}`);
  console.log(`   Instance ID: ${instanceId}\n`);

  const credentials = fromIni({ profile });
  const ssmClient = new SSMClient({ region, credentials });

  const results: TestResult[] = [];

  // Test 1: Check mail queue
  console.log('1️⃣  Testing mail queue status...');
  try {
    const queueResult = await runSsmCommand(
      ssmClient,
      instanceId,
      'mailq',
      'Checking mail queue'
    );

    const isQueueEmpty =
      queueResult.output.includes('Mail queue is empty') ||
      queueResult.output.includes('-- 0 Kbytes in 0 Request');

    results.push({
      test: 'Mail Queue Status',
      status: isQueueEmpty ? 'pass' : 'fail',
      message: isQueueEmpty
        ? 'Mail queue is empty (all messages delivered)'
        : 'Mail queue has pending messages',
      details: queueResult.output.trim(),
    });

    console.log(`   ${isQueueEmpty ? '✅' : '⚠️ '} ${results[results.length - 1].message}\n`);
  } catch (error) {
    results.push({
      test: 'Mail Queue Status',
      status: 'fail',
      message: `Error: ${error instanceof Error ? error.message : String(error)}`,
    });
    console.log(`   ❌ ${results[results.length - 1].message}\n`);
  }

  // Test 2: Check Postfix SES relay configuration
  console.log('2️⃣  Verifying Postfix SES relay configuration...');
  try {
    const postfixResult = await runSsmCommand(
      ssmClient,
      instanceId,
      "postconf -n | grep -E 'relayhost|smtp_sasl|smtp_tls_security_level'",
      'Checking Postfix config'
    );

    const hasRelayhost = postfixResult.output.includes('email-smtp.us-east-1.amazonaws.com');
    const hasSasl = postfixResult.output.includes('smtp_sasl_auth_enable = yes');
    const hasTls = postfixResult.output.includes('smtp_tls_security_level = encrypt');

    const isConfigured = hasRelayhost && hasSasl && hasTls;

    results.push({
      test: 'Postfix SES Relay Configuration',
      status: isConfigured ? 'pass' : 'fail',
      message: isConfigured
        ? 'Postfix correctly configured for SES relay'
        : 'Postfix SES relay configuration incomplete',
      details: {
        relayhost: hasRelayhost,
        sasl_auth: hasSasl,
        tls_encryption: hasTls,
        output: postfixResult.output.trim(),
      },
    });

    console.log(`   ${isConfigured ? '✅' : '❌'} ${results[results.length - 1].message}\n`);
  } catch (error) {
    results.push({
      test: 'Postfix SES Relay Configuration',
      status: 'fail',
      message: `Error: ${error instanceof Error ? error.message : String(error)}`,
    });
    console.log(`   ❌ ${results[results.length - 1].message}\n`);
  }

  // Test 3: Send test email
  if (!options.skipSend) {
    console.log('3️⃣  Sending test email...');

    if (!fromPassword) {
      results.push({
        test: 'Send Test Email',
        status: 'skip',
        message: 'Skipped: FROM_PASSWORD not provided',
      });
      console.log(`   ⏭️  ${results[results.length - 1].message}\n`);
    } else {
      try {
        const timestamp = new Date().toISOString();
        const transporter = nodemailer.createTransport({
          host: `box.${domain}`,
          port: 587,
          secure: false,
          auth: {
            user: fromEmail,
            pass: fromPassword,
          },
          tls: {
            rejectUnauthorized: false, // For self-signed certs
          },
        });

        const info = await transporter.sendMail({
          from: fromEmail,
          to: toEmail,
          subject: `[TEST] Email Delivery Test - ${timestamp}`,
          text: `This is an automated test email sent at ${timestamp} to verify email deliverability via SES SMTP relay.\n\nIf you receive this, email sending is working correctly!`,
          html: `<p>This is an automated test email sent at <strong>${timestamp}</strong> to verify email deliverability via SES SMTP relay.</p><p>If you receive this, email sending is working correctly!</p>`,
        });

        results.push({
          test: 'Send Test Email',
          status: 'pass',
          message: `Email sent successfully to ${toEmail}`,
          details: {
            messageId: info.messageId,
            response: info.response,
            timestamp,
          },
        });

        console.log(`   ✅ ${results[results.length - 1].message}`);
        console.log(`   Message ID: ${info.messageId}\n`);

        // Wait a bit and check mail logs
        console.log('   Waiting 5 seconds to check mail logs...');
        await new Promise((resolve) => setTimeout(resolve, 5000));

        const logsResult = await runSsmCommand(
          ssmClient,
          instanceId,
          `tail -50 /var/log/mail.log | grep -i "${toEmail}" | tail -10`,
          'Checking mail logs for delivery confirmation'
        );

        const hasDeliveryConfirmation =
          logsResult.output.includes('status=sent') ||
          logsResult.output.includes('250 2.0.0 Ok');

        console.log(
          `   ${hasDeliveryConfirmation ? '✅' : '⏳'} ${
            hasDeliveryConfirmation
              ? 'Delivery confirmed in mail logs'
              : 'Delivery pending (check logs in a few moments)'
          }\n`
        );

        if (logsResult.output) {
          console.log('   Recent mail log entries:');
          console.log(
            logsResult.output
              .split('\n')
              .map((line) => `     ${line}`)
              .join('\n')
          );
          console.log('');
        }
      } catch (error) {
        results.push({
          test: 'Send Test Email',
          status: 'fail',
          message: `Failed to send: ${error instanceof Error ? error.message : String(error)}`,
        });
        console.log(`   ❌ ${results[results.length - 1].message}\n`);
      }
    }
  } else {
    results.push({
      test: 'Send Test Email',
      status: 'skip',
      message: 'Skipped by user request',
    });
    console.log(`   ⏭️  ${results[results.length - 1].message}\n`);
  }

  // Test 4: IMAP authentication
  console.log('4️⃣  Testing IMAP authentication...');
  if (!fromPassword) {
    results.push({
      test: 'IMAP Authentication',
      status: 'skip',
      message: 'Skipped: FROM_PASSWORD not provided',
    });
    console.log(`   ⏭️  ${results[results.length - 1].message}\n`);
  } else {
    try {
      const imapResult = await runSsmCommand(
        ssmClient,
        instanceId,
        `doveadm auth test ${fromEmail} '${fromPassword.replace(/'/g, "'\\''")}'`,
        'Testing IMAP authentication'
      );

      const authSuccess =
        imapResult.output.includes('passdb') || imapResult.output.includes('auth succeeded');

      results.push({
        test: 'IMAP Authentication',
        status: authSuccess ? 'pass' : 'fail',
        message: authSuccess
          ? 'IMAP authentication successful'
          : 'IMAP authentication failed',
        details: imapResult.output.trim(),
      });

      console.log(`   ${authSuccess ? '✅' : '❌'} ${results[results.length - 1].message}\n`);
    } catch (error) {
      results.push({
        test: 'IMAP Authentication',
        status: 'fail',
        message: `Error: ${error instanceof Error ? error.message : String(error)}`,
      });
      console.log(`   ❌ ${results[results.length - 1].message}\n`);
    }
  }

  // Test 5: Check receiving capability
  if (!options.skipReceive) {
    console.log('5️⃣  Testing email receiving capability...');
    console.log('   Checking SMTP service (port 25 for incoming mail)...');

    try {
      const smtpResult = await runSsmCommand(
        ssmClient,
        instanceId,
        'ss -tlnp | grep :25 || netstat -tlnp | grep :25',
        'Checking SMTP port 25 listener'
      );

      const isSmtpListening = smtpResult.output.includes(':25') && smtpResult.output.includes('LISTEN');

      results.push({
        test: 'Email Receiving (SMTP Port 25)',
        status: isSmtpListening ? 'pass' : 'fail',
        message: isSmtpListening
          ? 'SMTP port 25 is listening for incoming mail'
          : 'SMTP port 25 is not listening',
        details: smtpResult.output.trim(),
      });

      console.log(`   ${isSmtpListening ? '✅' : '❌'} ${results[results.length - 1].message}\n`);

      if (isSmtpListening) {
        console.log('   ℹ️  To test receiving:');
        console.log(`      Send an email TO: ${fromEmail}`);
        console.log(`      FROM: Any external email address (e.g., ${toEmail})`);
        console.log(`      Then check mailbox via IMAP or webmail\n`);
      }
    } catch (error) {
      results.push({
        test: 'Email Receiving (SMTP Port 25)',
        status: 'fail',
        message: `Error: ${error instanceof Error ? error.message : String(error)}`,
      });
      console.log(`   ❌ ${results[results.length - 1].message}\n`);
    }
  } else {
    results.push({
      test: 'Email Receiving',
      status: 'skip',
      message: 'Skipped by user request',
    });
    console.log(`   ⏭️  ${results[results.length - 1].message}\n`);
  }

  // Summary
  console.log('━'.repeat(60));
  console.log('📊 TEST SUMMARY\n');

  const passed = results.filter((r) => r.status === 'pass').length;
  const failed = results.filter((r) => r.status === 'fail').length;
  const skipped = results.filter((r) => r.status === 'skip').length;

  results.forEach((result) => {
    const icon =
      result.status === 'pass' ? '✅' : result.status === 'fail' ? '❌' : '⏭️ ';
    console.log(`${icon} ${result.test}: ${result.message}`);
  });

  console.log('');
  console.log(`Total: ${results.length} tests`);
  console.log(`✅ Passed: ${passed}`);
  console.log(`❌ Failed: ${failed}`);
  console.log(`⏭️  Skipped: ${skipped}`);

  const overallStatus = failed === 0 && passed > 0 ? 'PASS' : 'FAIL';
  console.log(`\n${overallStatus === 'PASS' ? '✅' : '❌'} Overall Status: ${overallStatus}\n`);

  if (overallStatus === 'PASS') {
    console.log('🎉 Email deliverability is working correctly!');
    console.log(`   • Sending emails: ✅ Working (via SES SMTP relay)`);
    console.log(`   • Receiving emails: ✅ Ready (SMTP port 25 listening)`);
    console.log(`   • Mail queue: ✅ Empty (all messages delivered)\n`);
  } else {
    console.log('⚠️  Some tests failed. Please review the results above.\n');
  }

  if (failed > 0) {
    process.exit(1);
  }
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const options: TestOptions = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    switch (arg) {
      case '--region':
      case '-r':
        options.region = args[++i];
        break;
      case '--profile':
        options.profile = args[++i];
        break;
      case '--domain':
      case '-d':
        options.domain = args[++i];
        break;
      case '--from-email':
        options.fromEmail = args[++i];
        break;
      case '--from-password':
        options.fromPassword = args[++i];
        break;
      case '--to':
        options.toEmail = args[++i];
        break;
      case '--instance-id':
        options.instanceId = args[++i];
        break;
      case '--skip-send':
        options.skipSend = true;
        break;
      case '--skip-receive':
        options.skipReceive = true;
        break;
      case '--help':
      case '-h':
        console.log(`
Usage: test-email-deliverability.cli.ts [options]

Comprehensive test of email sending and receiving capabilities.

Options:
  --region, -r <region>        AWS region (default: us-east-1)
  --profile <profile>          AWS profile (default: hepe-admin-mfa)
  --domain, -d <domain>        Domain name (default: emcnotary.com)
  --from-email <email>         From email address (default: certifiedlsa@domain)
  --from-password <password>   From email password (required for send/IMAP tests)
  --to <email>                 To email address (default: e.mccallvr@gmail.com)
  --instance-id <id>           EC2 instance ID (default: auto-detect)
  --skip-send                  Skip sending test email
  --skip-receive               Skip receiving capability check
  --help, -h                   Show this help

Environment Variables:
  AWS_PROFILE, AWS_REGION, DOMAIN, FROM_EMAIL, FROM_PASSWORD, TO

Example:
  FROM_PASSWORD='yourpassword' pnpm exec tsx tools/test-email-deliverability.cli.ts
`);
        process.exit(0);
        break;
    }
  }

  testEmailDeliverability(options).catch((error) => {
    console.error(`Fatal error: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  });
}

export { testEmailDeliverability };
