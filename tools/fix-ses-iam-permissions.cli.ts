#!/usr/bin/env ts-node

/**
 * Fix SES IAM Permissions
 *
 * Ensures the SMTP IAM user has proper permissions to send via SES
 */

import { IAMClient, ListAttachedUserPoliciesCommand, PutUserPolicyCommand, GetUserPolicyCommand, ListUserPoliciesCommand } from '@aws-sdk/client-iam';
import { fromIni } from '@aws-sdk/credential-providers';

async function fixSesIamPermissions(): Promise<void> {
  const profile = process.env.AWS_PROFILE || 'hepe-admin-mfa';
  const region = process.env.AWS_REGION || 'us-east-1';
  const userName = 'ses-smtp-user-emcnotary-com-mailserver-core';
  const accountId = '413988044972';

  console.log('🔐 Fixing SES IAM Permissions\n');
  console.log(`   IAM User: ${userName}`);
  console.log(`   Account: ${accountId}`);
  console.log(`   Region: ${region}\n`);

  const credentials = fromIni({ profile });
  const iam = new IAMClient({ region, credentials });

  // Check current attached policies
  console.log('1️⃣  Checking attached managed policies...');
  const attached = await iam.send(new ListAttachedUserPoliciesCommand({ UserName: userName }));
  console.log(`   Found ${attached.AttachedPolicies?.length || 0} attached policies:`);
  attached.AttachedPolicies?.forEach(p => console.log(`     - ${p.PolicyName}`));
  console.log('');

  // Check current inline policies
  console.log('2️⃣  Checking inline policies...');
  const inline = await iam.send(new ListUserPoliciesCommand({ UserName: userName }));
  console.log(`   Found ${inline.PolicyNames?.length || 0} inline policies:`);
  inline.PolicyNames?.forEach(p => console.log(`     - ${p}`));
  console.log('');

  // Create comprehensive inline policy
  console.log('3️⃣  Creating comprehensive SES sending policy...');

  const policy = {
    Version: '2012-10-17',
    Statement: [
      {
        Sid: 'AllowSendFromEmcNotaryDomain',
        Effect: 'Allow',
        Action: [
          'ses:SendRawEmail',
          'ses:SendEmail'
        ],
        Resource: [
          `arn:aws:ses:${region}:${accountId}:identity/emcnotary.com`,
          `arn:aws:ses:${region}:${accountId}:identity/*@emcnotary.com`
        ]
      }
    ]
  };

  await iam.send(new PutUserPolicyCommand({
    UserName: userName,
    PolicyName: 'SES-SendEmail-emcnotary-com',
    PolicyDocument: JSON.stringify(policy, null, 2)
  }));

  console.log('   ✅ Inline policy created: SES-SendEmail-emcnotary-com\n');

  // Verify the policy was created
  console.log('4️⃣  Verifying policy...');
  const verification = await iam.send(new GetUserPolicyCommand({
    UserName: userName,
    PolicyName: 'SES-SendEmail-emcnotary-com'
  }));

  console.log('   ✅ Policy verified!\n');
  console.log('📋 Policy Document:');
  console.log(JSON.stringify(JSON.parse(decodeURIComponent(verification.PolicyDocument!)), null, 2));
  console.log('');

  console.log('✅ IAM permissions fixed successfully!\n');
  console.log('💡 The IAM user can now:');
  console.log('   - Send emails from emcnotary.com');
  console.log('   - Send emails from any @emcnotary.com address');
  console.log('   - Use both SendRawEmail and SendEmail actions\n');
  console.log('⏳ Note: IAM policy changes may take a few seconds to propagate');
  console.log('   Wait 5-10 seconds before retrying email sending\n');
}

if (require.main === module) {
  fixSesIamPermissions().catch((error) => {
    console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  });
}

export { fixSesIamPermissions };
