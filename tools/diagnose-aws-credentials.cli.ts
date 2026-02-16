#!/usr/bin/env ts-node

/**
 * Diagnose AWS Credentials
 *
 * Tests AWS SDK authentication and SSM access
 */

import { SSMClient, GetParameterCommand } from '@aws-sdk/client-ssm';
import { fromIni } from '@aws-sdk/credential-providers';
import { STSClient, GetCallerIdentityCommand } from '@aws-sdk/client-sts';

async function diagnoseCredentials() {
  const profile = process.env.AWS_PROFILE || 'hepe-admin-mfa';
  const region = process.env.AWS_REGION || 'us-east-1';

  console.log('🔍 AWS Credentials Diagnostic\n');
  console.log(`Profile: ${profile}`);
  console.log(`Region: ${region}\n`);

  try {
    console.log('1️⃣ Testing credential provider...');
    const credentials = fromIni({ profile });

    console.log('2️⃣ Testing STS GetCallerIdentity...');
    const stsClient = new STSClient({ region, credentials });
    const identity = await stsClient.send(new GetCallerIdentityCommand({}));

    console.log('✅ AWS Identity:');
    console.log(`   Account: ${identity.Account}`);
    console.log(`   UserId: ${identity.UserId}`);
    console.log(`   Arn: ${identity.Arn}\n`);

    console.log('3️⃣ Testing SSM access...');
    const ssmClient = new SSMClient({ region, credentials });

    const testParams = [
      '/smtp-username-EmcNotaryCoreStack',
      '/smtp-password-EmcNotaryCoreStack',
    ];

    for (const paramName of testParams) {
      try {
        console.log(`   Checking: ${paramName}`);
        const result = await ssmClient.send(new GetParameterCommand({
          Name: paramName,
          WithDecryption: false
        }));
        console.log(`   ✅ Found: ${result.Parameter?.Name} (Type: ${result.Parameter?.Type})`);
      } catch (error) {
        const err = error as Error;
        console.log(`   ❌ Error: ${err.name} - ${err.message}`);
        if ('$metadata' in error) {
          const metadata = (error as any).$metadata;
          console.log(`   HTTP Status: ${metadata.httpStatusCode}`);
        }
      }
    }

    console.log('\n✅ Diagnostic complete\n');
  } catch (error) {
    const err = error as Error;
    console.error('\n❌ Diagnostic failed:');
    console.error(`   ${err.name}: ${err.message}`);
    console.error(`   Stack: ${err.stack}\n`);
    process.exit(1);
  }
}

diagnoseCredentials();
