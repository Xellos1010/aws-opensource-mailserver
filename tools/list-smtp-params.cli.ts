#!/usr/bin/env ts-node

/**
 * List SMTP Parameters
 *
 * Lists all SSM parameters to find SMTP credentials
 */

import { SSMClient, DescribeParametersCommand, GetParameterCommand } from '@aws-sdk/client-ssm';
import { fromIni } from '@aws-sdk/credential-providers';

async function listSmtpParams() {
  const profile = process.env.AWS_PROFILE || 'hepe-admin-mfa';
  const region = process.env.AWS_REGION || 'us-east-1';

  console.log('🔍 Searching for SMTP parameters in SSM\n');

  const credentials = fromIni({ profile });
  const ssmClient = new SSMClient({ region, credentials });

  try {
    // List all parameters
    const response = await ssmClient.send(new DescribeParametersCommand({
      MaxResults: 50
    }));

    if (!response.Parameters || response.Parameters.length === 0) {
      console.log('❌ No parameters found\n');
      return;
    }

    console.log(`Found ${response.Parameters.length} parameters:\n`);

    const smtpParams = response.Parameters.filter(p =>
      p.Name?.toLowerCase().includes('smtp') ||
      p.Name?.toLowerCase().includes('mail') ||
      p.Name?.toLowerCase().includes('ses')
    );

    if (smtpParams.length === 0) {
      console.log('❌ No SMTP/mail/SES parameters found\n');
      console.log('All parameters:');
      response.Parameters.forEach(p => console.log(`   - ${p.Name}`));
      return;
    }

    console.log('✅ SMTP-related parameters:\n');
    for (const param of smtpParams) {
      console.log(`📧 ${param.Name}`);
      console.log(`   Type: ${param.Type}`);
      console.log(`   LastModified: ${param.LastModifiedDate}`);

      // Try to get the value (without decryption for security)
      try {
        const value = await ssmClient.send(new GetParameterCommand({
          Name: param.Name!,
          WithDecryption: false
        }));
        console.log(`   Version: ${value.Parameter?.Version}`);
      } catch (e) {
        console.log(`   (Could not retrieve)`);
      }
      console.log('');
    }
  } catch (error) {
    const err = error as Error;
    console.error(`❌ Error: ${err.message}`);
    process.exit(1);
  }
}

listSmtpParams();
