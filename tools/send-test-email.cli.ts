#!/usr/bin/env ts-node

/**
 * Send Test Email
 *
 * Sends a test email via the mail server SMTP to verify deliverability
 */

import * as nodemailer from 'nodemailer';

interface SendTestEmailOptions {
  domain?: string;
  fromEmail?: string;
  fromPassword?: string;
  toEmail?: string;
  subject?: string;
  body?: string;
}

async function sendTestEmail(options: SendTestEmailOptions): Promise<void> {
  const domain = options.domain || process.env.DOMAIN || 'emcnotary.com';
  const fromEmail = options.fromEmail || process.env.FROM_EMAIL || `certifiedlsa@${domain}`;
  const fromPassword = options.fromPassword || process.env.FROM_PASSWORD;
  const toEmail = options.toEmail || process.env.TO || 'e.mccallvr@gmail.com';
  const timestamp = new Date().toISOString();
  const subject = options.subject || process.env.SUBJECT || `[TEST] Email Delivery via SES - ${timestamp}`;
  const body = options.body || process.env.BODY ||
    `This is an automated test email sent at ${timestamp}.\n\n` +
    `This email is being sent through the AWS SES SMTP relay to verify that:\n` +
    `1. Postfix is correctly configured to use SES relay\n` +
    `2. SMTP authentication is working\n` +
    `3. Email delivery is functional\n\n` +
    `If you receive this email, the mail server is working correctly!`;

  if (!fromPassword) {
    console.error('❌ Error: FROM_PASSWORD is required');
    console.error('   Set the FROM_PASSWORD environment variable or use --from-password flag\n');
    process.exit(1);
  }

  console.log('📧 Sending Test Email\n');
  console.log(`   From: ${fromEmail}`);
  console.log(`   To: ${toEmail}`);
  console.log(`   Subject: ${subject}`);
  console.log(`   Mail Server: box.${domain}:587\n`);

  try {
    const transporter = nodemailer.createTransport({
      host: `box.${domain}`,
      port: 587,
      secure: false, // Use STARTTLS
      auth: {
        user: fromEmail,
        pass: fromPassword,
      },
      tls: {
        rejectUnauthorized: false, // For self-signed certs
      },
    });

    console.log('🔄 Connecting to mail server...');

    const info = await transporter.sendMail({
      from: fromEmail,
      to: toEmail,
      subject,
      text: body,
      html: `<pre>${body}</pre>`,
    });

    console.log('✅ Email sent successfully!\n');
    console.log(`   Message ID: ${info.messageId}`);
    console.log(`   Response: ${info.response}\n`);
    console.log('📬 The email should be delivered via SES SMTP relay.');
    console.log(`   Check the recipient inbox (${toEmail}) in a few moments.\n`);
    console.log('💡 To verify SES relay was used, check mail logs:');
    console.log('   tail -50 /var/log/mail.log | grep -i "relay=.*email-smtp"\n');

  } catch (error) {
    console.error('❌ Failed to send email\n');
    if (error instanceof Error) {
      console.error(`   Error: ${error.message}\n`);

      if (error.message.includes('Invalid login')) {
        console.error('💡 Troubleshooting:');
        console.error('   - Verify the password is correct for certifiedlsa@emcnotary.com');
        console.error('   - Check if the email account exists on the mail server');
        console.error('   - Verify SMTP authentication is enabled\n');
      } else if (error.message.includes('ECONNREFUSED')) {
        console.error('💡 Troubleshooting:');
        console.error('   - Verify the mail server is running');
        console.error('   - Check if port 587 is accessible');
        console.error('   - Verify Postfix service is active\n');
      }
    } else {
      console.error(`   ${String(error)}\n`);
    }
    process.exit(1);
  }
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const options: SendTestEmailOptions = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    switch (arg) {
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
      case '--subject':
        options.subject = args[++i];
        break;
      case '--body':
        options.body = args[++i];
        break;
      case '--help':
      case '-h':
        console.log(`
Usage: send-test-email.cli.ts [options]

Sends a test email via the mail server SMTP to verify deliverability.

Options:
  --domain, -d <domain>          Domain name (default: emcnotary.com)
  --from-email <email>           From email address (default: certifiedlsa@domain)
  --from-password <password>     From email password (REQUIRED)
  --to <email>                   To email address (default: e.mccallvr@gmail.com)
  --subject <subject>            Email subject (default: auto-generated)
  --body <body>                  Email body (default: test message)
  --help, -h                     Show this help

Environment Variables:
  DOMAIN, FROM_EMAIL, FROM_PASSWORD (required), TO, SUBJECT, BODY

Example:
  FROM_PASSWORD='yourpassword' pnpm exec tsx tools/send-test-email.cli.ts

  FROM_PASSWORD='yourpassword' TO='recipient@example.com' \\
    pnpm exec tsx tools/send-test-email.cli.ts
`);
        process.exit(0);
        break;
    }
  }

  sendTestEmail(options).catch((error) => {
    console.error(`Fatal error: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  });
}

export { sendTestEmail };
