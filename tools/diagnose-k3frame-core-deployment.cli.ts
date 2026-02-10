#!/usr/bin/env ts-node

/**
 * Diagnostic script to identify resources causing CloudFormation early validation failures
 * 
 * This script checks for all resources that the k3frame core stack would create
 * and reports which ones already exist, causing deployment conflicts.
 */

import {
  CloudFormationClient,
  DescribeStacksCommand,
  ValidateTemplateCommand,
} from '@aws-sdk/client-cloudformation';
import {
  IAMClient,
  GetRoleCommand,
  ListRolesCommand,
} from '@aws-sdk/client-iam';
import {
  LambdaClient,
  GetFunctionCommand,
  ListFunctionsCommand,
} from '@aws-sdk/client-lambda';
import {
  S3Client,
  HeadBucketCommand,
  ListBucketsCommand,
} from '@aws-sdk/client-s3';
import {
  SSMClient,
  GetParameterCommand,
  GetParametersByPathCommand,
} from '@aws-sdk/client-ssm';
import {
  CloudWatchLogsClient,
  DescribeLogGroupsCommand,
} from '@aws-sdk/client-cloudwatch-logs';
import {
  SNSClient,
  ListTopicsCommand,
} from '@aws-sdk/client-sns';
import {
  SESClient,
  GetIdentityVerificationAttributesCommand,
  ListIdentitiesCommand,
} from '@aws-sdk/client-ses';
import {
  EC2Client,
  DescribeAddressesCommand,
} from '@aws-sdk/client-ec2';
import { fromIni } from '@aws-sdk/credential-providers';
import { readFileSync } from 'fs';
import { join } from 'path';

const STACK_NAME = 'k3frame-com-mailserver-core';
const DOMAIN = 'k3frame.com';
const REGION = process.env['AWS_REGION'] || 'us-east-1';
const PROFILE = process.env['AWS_PROFILE'] || 'k3frame';

interface ResourceCheck {
  type: string;
  name: string;
  exists: boolean;
  details?: string;
  error?: string;
}

const findings: ResourceCheck[] = [];

async function checkResource(
  type: string,
  name: string,
  checkFn: () => Promise<boolean | string>
): Promise<void> {
  try {
    const result = await checkFn();
    if (result === true || (typeof result === 'string' && result.length > 0)) {
      findings.push({
        type,
        name,
        exists: true,
        details: typeof result === 'string' ? result : undefined,
      });
    } else {
      findings.push({
        type,
        name,
        exists: false,
      });
    }
  } catch (error: any) {
    findings.push({
      type,
      name,
      exists: false,
      error: error.message || String(error),
    });
  }
}

async function main(): Promise<void> {
  console.log('🔍 K3Frame Core Stack Deployment Diagnostic');
  console.log('═'.repeat(60));
  console.log(`Stack: ${STACK_NAME}`);
  console.log(`Domain: ${DOMAIN}`);
  console.log(`Region: ${REGION}`);
  console.log(`Profile: ${PROFILE}`);
  console.log('═'.repeat(60));

  const credentials = fromIni({ profile: PROFILE });

  // Check CloudFormation Stack
  console.log('\n📋 Step 1: Checking CloudFormation Stack');
  console.log('─'.repeat(60));
  const cfClient = new CloudFormationClient({ region: REGION, credentials });
  try {
    const cmd = new DescribeStacksCommand({ StackName: STACK_NAME });
    const stack = await cfClient.send(cmd);
    if (stack.Stacks && stack.Stacks.length > 0) {
      const status = stack.Stacks[0].StackStatus;
      await checkResource('CloudFormation Stack', STACK_NAME, async () => {
        return `Status: ${status}`;
      });
    }
  } catch (error: any) {
    await checkResource('CloudFormation Stack', STACK_NAME, async () => false);
  }

  // Check IAM Roles
  console.log('\n📋 Step 2: Checking IAM Roles');
  console.log('─'.repeat(60));
  const iamClient = new IAMClient({ credentials });
  const roleNames = [
    `ReverseDnsLambdaExecutionRole-${STACK_NAME}`,
    `SMTPLambdaExecutionRole-${STACK_NAME}`,
  ];

  for (const roleName of roleNames) {
    await checkResource('IAM Role', roleName, async () => {
      const cmd = new GetRoleCommand({ RoleName: roleName });
      await iamClient.send(cmd);
      return true;
    });
  }

  // Check Lambda Functions
  console.log('\n📋 Step 3: Checking Lambda Functions');
  console.log('─'.repeat(60));
  const lambdaClient = new LambdaClient({ region: REGION, credentials });
  const functionNames = [
    `ReverseDnsLambdaFunction-${STACK_NAME}`,
    `SMTPCredentialsLambdaFunction-${STACK_NAME}`,
  ];

  for (const functionName of functionNames) {
    await checkResource('Lambda Function', functionName, async () => {
      const cmd = new GetFunctionCommand({ FunctionName: functionName });
      const result = await lambdaClient.send(cmd);
      return result.Configuration?.FunctionArn || true;
    });
  }

  // Check S3 Buckets
  console.log('\n📋 Step 4: Checking S3 Buckets');
  console.log('─'.repeat(60));
  const s3Client = new S3Client({ region: REGION, credentials });
  const bucketNames = [`${DOMAIN}-backup`, `${DOMAIN}-nextcloud`];

  for (const bucketName of bucketNames) {
    await checkResource('S3 Bucket', bucketName, async () => {
      try {
        const cmd = new HeadBucketCommand({ Bucket: bucketName });
        await s3Client.send(cmd);
        return true;
      } catch (error: any) {
        // Also check if bucket exists in any region by listing all buckets
        const listCmd = new ListBucketsCommand({});
        const buckets = await s3Client.send(listCmd);
        const exists = buckets.Buckets?.some((b) => b.Name === bucketName);
        return exists ? `Found in bucket list` : false;
      }
    });
  }

  // Check SSM Parameters
  console.log('\n📋 Step 5: Checking SSM Parameters');
  console.log('─'.repeat(60));
  const ssmClient = new SSMClient({ region: REGION, credentials });
  const paramPaths = [
    '/k3frame/core/domainName',
    '/k3frame/core/backupBucket',
    '/k3frame/core/nextcloudBucket',
    '/k3frame/core/alarmsTopicArn',
    '/k3frame/core/sesIdentityArn',
    '/k3frame/core/eipAllocationId',
    `/cwagent-linux-${STACK_NAME}`,
    `smtp-username-${STACK_NAME}`,
    `smtp-password-${STACK_NAME}`,
  ];

  for (const paramPath of paramPaths) {
    await checkResource('SSM Parameter', paramPath, async () => {
      const cmd = new GetParameterCommand({ Name: paramPath });
      const result = await ssmClient.send(cmd);
      return result.Parameter?.Value || true;
    });
  }

  // Check CloudWatch Log Groups
  console.log('\n📋 Step 6: Checking CloudWatch Log Groups');
  console.log('─'.repeat(60));
  const logsClient = new CloudWatchLogsClient({ region: REGION, credentials });
  const logGroupNames = [
    `/ec2/syslog-${STACK_NAME}`,
    `/aws/lambda/ReverseDnsLambdaFunction-${STACK_NAME}`,
    `/aws/lambda/SMTPCredentialsLambdaFunction-${STACK_NAME}`,
  ];

  for (const logGroupName of logGroupNames) {
    await checkResource('CloudWatch Log Group', logGroupName, async () => {
      const cmd = new DescribeLogGroupsCommand({ logGroupNamePrefix: logGroupName });
      const result = await logsClient.send(cmd);
      return result.logGroups?.some((lg) => lg.logGroupName === logGroupName) || false;
    });
  }

  // Check SNS Topics
  console.log('\n📋 Step 7: Checking SNS Topics');
  console.log('─'.repeat(60));
  const snsClient = new SNSClient({ region: REGION, credentials });
  const topicName = `ec2-memory-events-${STACK_NAME}`;
  await checkResource('SNS Topic', topicName, async () => {
    const cmd = new ListTopicsCommand({});
    const result = await snsClient.send(cmd);
    const topic = result.Topics?.find((t) => t.TopicArn?.includes(topicName));
    return topic?.TopicArn || false;
  });

  // Check SES Domain Identity
  console.log('\n📋 Step 8: Checking SES Domain Identity');
  console.log('─'.repeat(60));
  const sesClient = new SESClient({ region: REGION, credentials });
  await checkResource('SES Domain Identity', DOMAIN, async () => {
    const cmd = new GetIdentityVerificationAttributesCommand({ Identities: [DOMAIN] });
    const result = await sesClient.send(cmd);
    const attrs = result.VerificationAttributes?.[DOMAIN];
    return attrs ? `VerificationStatus: ${attrs.VerificationStatus}` : false;
  });

  // Check Elastic IPs
  console.log('\n📋 Step 9: Checking Elastic IPs');
  console.log('─'.repeat(60));
  const ec2Client = new EC2Client({ region: REGION, credentials });
  await checkResource('Elastic IP', `tagged MAILSERVER=${DOMAIN}`, async () => {
    const cmd = new DescribeAddressesCommand({});
    const result = await ec2Client.send(cmd);
    const eips = result.Addresses?.filter(
      (addr) => addr.Tags?.some((tag) => tag.Key === 'MAILSERVER' && tag.Value === DOMAIN)
    );
    return eips && eips.length > 0 ? `${eips.length} EIP(s) found` : false;
  });

  // Summary
  console.log('\n📊 Diagnostic Summary');
  console.log('═'.repeat(60));
  const existing = findings.filter((f) => f.exists);
  const notFound = findings.filter((f) => !f.exists && !f.error);
  const errors = findings.filter((f) => f.error);

  if (existing.length > 0) {
    console.log('\n⚠️  EXISTING RESOURCES (May cause conflicts):');
    console.log('─'.repeat(60));
    for (const finding of existing) {
      console.log(`  ❌ ${finding.type}: ${finding.name}`);
      if (finding.details) {
        console.log(`     ${finding.details}`);
      }
    }
  }

  if (notFound.length > 0) {
    console.log(`\n✅ Not Found (Safe): ${notFound.length} resources`);
  }

  if (errors.length > 0) {
    console.log(`\n⚠️  Errors during check: ${errors.length}`);
    for (const finding of errors) {
      console.log(`  ${finding.type}: ${finding.name} - ${finding.error}`);
    }
  }

  console.log(`\n📦 Total Resources Checked: ${findings.length}`);
  console.log(`   ✅ Safe: ${notFound.length}`);
  console.log(`   ❌ Existing: ${existing.length}`);
  console.log(`   ⚠️  Errors: ${errors.length}`);

  if (existing.length > 0) {
    console.log('\n💡 Recommendation: Run cleanup script to remove existing resources');
    process.exit(1);
  } else {
    console.log('\n✅ No conflicting resources found. Deployment should proceed.');
    process.exit(0);
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}




