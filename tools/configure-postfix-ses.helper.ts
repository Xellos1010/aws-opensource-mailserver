#!/usr/bin/env tsx

/**
 * Helper script to configure Postfix SES relay by fetching credentials from SSM
 * and passing them to the configure-ses-relay tool
 */

import { SSMClient, GetParameterCommand } from '@aws-sdk/client-ssm';
import { fromIni } from '@aws-sdk/credential-providers';
import { execSync } from 'child_process';

const profile = process.env.AWS_PROFILE || 'hepe-admin-mfa';
const region = process.env.AWS_REGION || 'us-east-1';
const domain = process.env.DOMAIN || 'emcnotary.com';
const appPath = process.env.APP_PATH || 'apps/cdk-emc-notary/instance';

async function main() {
  console.log('🔐 Fetching SMTP credentials from SSM Parameter Store...\n');

  const credentials = fromIni({ profile });
  const ssm = new SSMClient({ region, credentials });

  try {
    // Fetch SMTP username
    const usernameResp = await ssm.send(new GetParameterCommand({
      Name: '/smtp-username-EmcNotaryCoreStack',
      WithDecryption: true
    }));

    // Fetch SMTP password
    const passwordResp = await ssm.send(new GetParameterCommand({
      Name: '/smtp-password-EmcNotaryCoreStack',
      WithDecryption: true
    }));

    const smtpUsername = usernameResp.Parameter?.Value;
    const smtpPassword = passwordResp.Parameter?.Value;

    if (!smtpUsername || !smtpPassword) {
      throw new Error('Failed to retrieve SMTP credentials from SSM');
    }

    console.log('✅ SMTP credentials retrieved successfully\n');
    console.log('📧 Configuring Postfix to relay through SES...\n');

    // Run the configure-ses-relay tool with credentials
    const command = `pnpm exec tsx --tsconfig tools/tsconfig.json tools/configure-ses-relay.cli.ts --domain ${domain} --smtp-region ${region} --smtp-username "${smtpUsername}" --smtp-password "${smtpPassword}"`;

    execSync(command, {
      stdio: 'inherit',
      env: {
        ...process.env,
        AWS_PROFILE: profile,
        AWS_REGION: region,
        DOMAIN: domain,
        APP_PATH: appPath
      }
    });

    console.log('\n✅ Postfix SES relay configuration complete!\n');

  } catch (error) {
    if (error instanceof Error) {
      console.error(`\n❌ Error: ${error.message}\n`);
      if (error.message.includes('ExpiredToken') || error.message.includes('MFA')) {
        console.error('💡 Tip: Your AWS session may have expired. Please refresh your MFA session and try again.\n');
      }
    }
    process.exit(1);
  }
}

main();
