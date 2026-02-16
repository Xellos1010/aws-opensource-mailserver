#!/usr/bin/env ts-node

/**
 * Create SES SMTP Credentials
 *
 * Generates SMTP credentials for SES and stores them in SSM Parameter Store.
 * This tool replicates what the core stack's SMTP Lambda should have done during deployment.
 */

import { IAMClient, CreateAccessKeyCommand, ListUsersCommand, CreateUserCommand } from '@aws-sdk/client-iam';
import { SSMClient, PutParameterCommand } from '@aws-sdk/client-ssm';
import { fromIni } from '@aws-sdk/credential-providers';
import * as crypto from 'crypto';

const SMTP_REGIONS = [
  'us-east-2', 'us-east-1', 'us-west-2', 'ap-south-1',
  'ap-northeast-2', 'ap-southeast-1', 'ap-southeast-2',
  'ap-northeast-1', 'ca-central-1', 'eu-central-1',
  'eu-west-1', 'eu-west-2', 'us-gov-west-1'
];

const DATE = '11111111';
const SERVICE = 'ses';
const MESSAGE = 'SendRawEmail';
const TERMINAL = 'aws4_request';
const VERSION = 0x04;

function sign(key: Buffer, msg: string): Buffer {
  return crypto.createHmac('sha256', key).update(msg, 'utf8').digest();
}

function calculateSmtpPassword(secretAccessKey: string, region: string): string {
  if (!SMTP_REGIONS.includes(region)) {
    throw new Error(`The ${region} Region doesn't have an SMTP endpoint.`);
  }

  let signature = sign(Buffer.from(`AWS4${secretAccessKey}`, 'utf8'), DATE);
  signature = sign(signature, region);
  signature = sign(signature, SERVICE);
  signature = sign(signature, TERMINAL);
  signature = sign(signature, MESSAGE);

  const signatureAndVersion = Buffer.concat([Buffer.from([VERSION]), signature]);
  return signatureAndVersion.toString('base64');
}

interface Options {
  region?: string;
  profile?: string;
  smtpRegion?: string;
  stackName?: string;
  userName?: string;
  dryRun?: boolean;
}

async function createSmtpCredentials(options: Options): Promise<void> {
  const region = options.region || process.env.AWS_REGION || 'us-east-1';
  const profile = options.profile || process.env.AWS_PROFILE || 'hepe-admin-mfa';
  const smtpRegion = options.smtpRegion || region;
  const stackName = options.stackName || 'emcnotary-com-mailserver-core';
  const userName = options.userName || `ses-smtp-user-${stackName}`;
  const dryRun = options.dryRun || false;

  console.log('📧 Create SES SMTP Credentials');
  console.log(`   Region: ${region}`);
  console.log(`   SMTP Region: ${smtpRegion}`);
  console.log(`   Stack Name: ${stackName}`);
  console.log(`   IAM User Name: ${userName}`);
  console.log(`   Dry Run: ${dryRun}\n`);

  const credentials = fromIni({ profile });
  const iamClient = new IAMClient({ region, credentials });
  const ssmClient = new SSMClient({ region, credentials });

  try {
    // Step 1: Check if IAM user already exists
    console.log('1️⃣  Checking if IAM user exists...');
    const listUsersResp = await iamClient.send(new ListUsersCommand({}));
    const existingUser = listUsersResp.Users?.find(u => u.UserName === userName);

    let accessKeyId: string;
    let secretAccessKey: string;

    if (existingUser) {
      console.log(`   ⚠️  IAM user '${userName}' already exists.`);
      console.log(`   You need to provide existing credentials or delete the user first.\n`);
      console.log(`   To delete: aws iam delete-user --user-name ${userName}\n`);
      process.exit(1);
    }

    // Step 2: Create IAM user
    if (dryRun) {
      console.log(`   [DRY RUN] Would create IAM user: ${userName}`);
    } else {
      console.log(`   Creating IAM user: ${userName}...`);
      await iamClient.send(new CreateUserCommand({
        UserName: userName,
        Tags: [
          { Key: 'Purpose', Value: 'SES SMTP' },
          { Key: 'Stack', Value: stackName }
        ]
      }));
      console.log(`   ✅ IAM user created\n`);
    }

    // Step 3: Create access key
    if (dryRun) {
      console.log(`   [DRY RUN] Would create access key for user: ${userName}`);
      accessKeyId = 'AKIAIOSFODNN7EXAMPLE';
      secretAccessKey = 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY';
    } else {
      console.log('2️⃣  Creating IAM access key...');
      const createKeyResp = await iamClient.send(new CreateAccessKeyCommand({
        UserName: userName
      }));

      if (!createKeyResp.AccessKey?.AccessKeyId || !createKeyResp.AccessKey?.SecretAccessKey) {
        throw new Error('Failed to create access key - missing credentials in response');
      }

      accessKeyId = createKeyResp.AccessKey.AccessKeyId;
      secretAccessKey = createKeyResp.AccessKey.SecretAccessKey;
      console.log(`   ✅ Access key created: ${accessKeyId}\n`);
    }

    // Step 4: Calculate SMTP password
    console.log('3️⃣  Calculating SMTP password...');
    const smtpPassword = calculateSmtpPassword(secretAccessKey, smtpRegion);
    console.log(`   ✅ SMTP password calculated\n`);

    // Step 5: Store credentials in SSM
    const usernameParam = `smtp-username-${stackName}`;
    const passwordParam = `smtp-password-${stackName}`;

    if (dryRun) {
      console.log(`   [DRY RUN] Would store SSM parameters:`);
      console.log(`     - ${usernameParam}`);
      console.log(`     - ${passwordParam}\n`);
    } else {
      console.log('4️⃣  Storing credentials in SSM Parameter Store...');

      await ssmClient.send(new PutParameterCommand({
        Name: usernameParam,
        Description: `SMTP username for ${stackName}`,
        Value: accessKeyId,
        Type: 'SecureString',
        Overwrite: true,
        Tier: 'Standard'
      }));
      console.log(`   ✅ Stored: ${usernameParam}`);

      await ssmClient.send(new PutParameterCommand({
        Name: passwordParam,
        Description: `SMTP password for ${stackName}`,
        Value: smtpPassword,
        Type: 'SecureString',
        Overwrite: true,
        Tier: 'Standard'
      }));
      console.log(`   ✅ Stored: ${passwordParam}\n`);
    }

    console.log('✅ SMTP credentials created successfully!\n');
    console.log('📝 Summary:');
    console.log(`   IAM User: ${userName}`);
    console.log(`   Access Key ID: ${accessKeyId}`);
    console.log(`   SSM Parameters:`);
    console.log(`     - ${usernameParam}`);
    console.log(`     - ${passwordParam}`);
    console.log(`\n   SMTP Endpoint: email-smtp.${smtpRegion}.amazonaws.com:587\n`);

    if (!dryRun) {
      console.log('⚠️  IMPORTANT: Attach SES sending policy to IAM user:');
      console.log(`   aws iam attach-user-policy --user-name ${userName} --policy-arn arn:aws:iam::aws:policy/AmazonSESFullAccess\n`);
      console.log('   Or use a more restrictive custom policy for production.\n');
    }

  } catch (error) {
    const err = error as Error;
    console.error(`\n❌ Error: ${err.message}`);
    throw error;
  }
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const options: Options = {};

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
      case '--smtp-region':
        options.smtpRegion = args[++i];
        break;
      case '--stack-name':
        options.stackName = args[++i];
        break;
      case '--user-name':
        options.userName = args[++i];
        break;
      case '--dry-run':
        options.dryRun = true;
        break;
      case '--help':
      case '-h':
        console.log(`
Usage: create-smtp-credentials.cli.ts [options]

Creates SES SMTP credentials (IAM user + access key) and stores them in SSM Parameter Store.

Options:
  --region, -r <region>      AWS region (default: us-east-1)
  --profile <profile>        AWS profile (default: hepe-admin-mfa)
  --smtp-region <region>     SES SMTP region (default: AWS region)
  --stack-name <name>        Stack name for parameter naming (default: emcnotary-com-mailserver-core)
  --user-name <name>         IAM user name (default: ses-smtp-user-{stack-name})
  --dry-run                  Preview without creating resources
  --help, -h                 Show this help
`);
        process.exit(0);
        break;
    }
  }

  createSmtpCredentials(options).catch((error) => {
    console.error(`Fatal error: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  });
}

export { createSmtpCredentials };
