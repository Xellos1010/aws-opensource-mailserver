#!/usr/bin/env ts-node

/**
 * Comprehensive verification and setup script for EMC Notary mailserver
 * 
 * This script verifies:
 * 1. Recovery system (Lambda functions, alarms, health checks)
 * 2. SES configuration (SMTP relay, DNS records)
 * 3. Provides guidance on mailbox restoration
 */

import { getStackInfoFromApp } from '@mm/admin-stack-info';
import { fromIni } from '@aws-sdk/credential-providers';

interface VerifyOptions {
  domain?: string;
  appPath?: string;
  region?: string;
  profile?: string;
}

async function verifyRecoverySystem(options: VerifyOptions): Promise<void> {
  const region = options.region || process.env.AWS_REGION || 'us-east-1';
  const profile = options.profile || process.env.AWS_PROFILE || 'hepe-admin-mfa';
  const appPath = options.appPath || process.env.APP_PATH || 'apps/cdk-emc-notary/instance';
  const domain = options.domain || process.env.DOMAIN;

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🔍 Step 1: Verifying Recovery System');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const stackInfo = await getStackInfoFromApp(appPath, {
    domain,
    region,
    profile,
  });

  const stackName = stackInfo.stackName;
  if (!stackName) {
    throw new Error('Stack name not found');
  }

  // Import AWS SDK clients dynamically
  const { LambdaClient, InvokeCommand, GetFunctionCommand } = await import('@aws-sdk/client-lambda').catch(() => {
    throw new Error('@aws-sdk/client-lambda not installed. Run: pnpm add -D @aws-sdk/client-lambda');
  });
  const { CloudWatchClient, DescribeAlarmsCommand } = await import('@aws-sdk/client-cloudwatch').catch(() => {
    throw new Error('@aws-sdk/client-cloudwatch not installed. Run: pnpm add -D @aws-sdk/client-cloudwatch');
  });

  const lambdaClient = new LambdaClient({
    region,
    credentials: fromIni({ profile }),
  });

  const cwClient = new CloudWatchClient({
    region,
    credentials: fromIni({ profile }),
  });

  // Expected Lambda functions
  const expectedLambdas = [
    `mail-health-check-${stackName}`,
    `service-restart-${stackName}`,
    `system-reset-${stackName}`,
    `stop-start-helper-${stackName}`,
    `mail-recovery-orchestrator-${stackName}`,
    `system-stats-${stackName}`,
  ];

  console.log('📋 Checking Lambda Functions:\n');
  const lambdaResults: Array<{ name: string; exists: boolean; error?: string }> = [];

  for (const lambdaName of expectedLambdas) {
    try {
      const response = await lambdaClient.send(
        new GetFunctionCommand({ FunctionName: lambdaName })
      );
      lambdaResults.push({ name: lambdaName, exists: true });
      console.log(`   ✅ ${lambdaName}`);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      lambdaResults.push({ name: lambdaName, exists: false, error: errorMsg });
      console.log(`   ❌ ${lambdaName} - ${errorMsg}`);
    }
  }

  // Check CloudWatch Alarms
  console.log('\n📋 Checking CloudWatch Alarms:\n');
  const alarmResults: Array<{ name: string; state: string }> = [];

  // Get instance ID from stack outputs
  let instanceId: string | undefined;
  try {
    const { CloudFormationClient, DescribeStacksCommand } = await import('@aws-sdk/client-cloudformation');
    const cfClient = new CloudFormationClient({
      region,
      credentials: fromIni({ profile }),
    });
    const stackResponse = await cfClient.send(
      new DescribeStacksCommand({ StackName: stackName })
    );
    const stack = stackResponse.Stacks?.[0];
    instanceId = stack?.Outputs?.find(o => o.OutputKey === 'InstanceId')?.OutputValue;
  } catch {
    // Instance ID not found, will search by stack name prefix
  }

  try {
    // Search by instance ID prefix if available, otherwise by stack name
    const alarmNamePrefix = instanceId ? `InstanceStatusCheck-${instanceId}`.substring(0, 20) : stackName;
    const alarmResponse = await cwClient.send(
      new DescribeAlarmsCommand({
        AlarmNamePrefix: instanceId ? undefined : stackName, // Search all alarms if instance ID found
      })
    );

    const alarms = alarmResponse.MetricAlarms || [];
    
    // Filter alarms related to this instance/stack
    const relevantAlarms = instanceId
      ? alarms.filter(a => 
          a.AlarmName?.includes(instanceId) || 
          a.AlarmName?.includes(stackName) ||
          a.AlarmName?.startsWith('InstanceStatusCheck-') ||
          a.AlarmName?.startsWith('SystemStatusCheck-') ||
          a.AlarmName?.startsWith('OOMKillDetected-') ||
          a.AlarmName?.startsWith('HttpsUnhealthy-')
        )
      : alarms.filter(a => a.AlarmName?.includes(stackName));

    for (const alarm of relevantAlarms) {
      const state = alarm.StateValue || 'UNKNOWN';
      const icon = state === 'OK' ? '✅' : state === 'ALARM' ? '🔴' : '⚠️';
      alarmResults.push({ name: alarm.AlarmName || 'Unknown', state });
      console.log(`   ${icon} ${alarm.AlarmName} - ${state}`);
    }

    if (relevantAlarms.length === 0) {
      console.log(`   ⚠️  No alarms found for instance/stack`);
      if (instanceId) {
        console.log(`      Searched for instance: ${instanceId}`);
      }
      console.log(`      Searched for stack: ${stackName}`);
    }
  } catch (error) {
    console.log(`   ❌ Error checking alarms: ${error instanceof Error ? error.message : String(error)}`);
  }

  // Test Mail Health Check Lambda
  console.log('\n📋 Testing Mail Health Check Lambda:\n');
  const healthCheckLambda = `mail-health-check-${stackName}`;
  try {
    const healthCheckExists = lambdaResults.find(r => r.name === healthCheckLambda && r.exists);
    if (healthCheckExists) {
      const invokeResponse = await lambdaClient.send(
        new InvokeCommand({
          FunctionName: healthCheckLambda,
          InvocationType: 'RequestResponse',
        })
      );

      const payload = JSON.parse(
        new TextDecoder().decode(invokeResponse.Payload)
      );
      const body = typeof payload.body === 'string' ? JSON.parse(payload.body) : payload.body;

      if (body.healthy) {
        console.log(`   ✅ Mail services are HEALTHY`);
        console.log(`      Reason: ${body.health_reason || 'Unknown'}`);
      } else {
        console.log(`   ⚠️  Mail services are UNHEALTHY`);
        console.log(`      Reason: ${body.health_reason || 'Unknown'}`);
      }
    } else {
      console.log(`   ⚠️  Health check Lambda not found`);
    }
  } catch (error) {
    console.log(`   ❌ Error testing health check: ${error instanceof Error ? error.message : String(error)}`);
  }

  // Summary
  const existingLambdas = lambdaResults.filter(r => r.exists).length;
  const totalLambdas = expectedLambdas.length;
  const okAlarms = alarmResults.filter(a => a.state === 'OK').length;
  const totalAlarms = alarmResults.length;

  console.log('\n📊 Recovery System Summary:\n');
  console.log(`   Lambda Functions: ${existingLambdas}/${totalLambdas} found`);
  console.log(`   CloudWatch Alarms: ${okAlarms}/${totalAlarms} in OK state`);

  if (existingLambdas === totalLambdas && okAlarms === totalAlarms && totalAlarms > 0) {
    console.log('\n   ✅ Recovery system is fully configured and operational\n');
  } else {
    console.log('\n   ⚠️  Recovery system needs attention\n');
    if (existingLambdas < totalLambdas) {
      console.log('   💡 Missing Lambda functions - ensure stack is fully deployed');
    }
    if (okAlarms < totalAlarms) {
      console.log('   💡 Some alarms are not in OK state - check CloudWatch console');
    }
  }
}

async function verifySesConfiguration(options: VerifyOptions): Promise<void> {
  const region = options.region || process.env.AWS_REGION || 'us-east-1';
  const profile = options.profile || process.env.AWS_PROFILE || 'hepe-admin-mfa';
  const appPath = options.appPath || process.env.APP_PATH || 'apps/cdk-emc-notary/instance';
  const domain = options.domain || process.env.DOMAIN;

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📧 Step 2: Verifying SES Configuration');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const stackInfo = await getStackInfoFromApp(appPath, {
    domain,
    region,
    profile,
  });

  const domainName = domain || stackInfo.domainName;
  if (!domainName) {
    throw new Error('Domain name not found');
  }

  const { SESClient, GetIdentityVerificationAttributesCommand, GetIdentityDkimAttributesCommand } = await import('@aws-sdk/client-ses').catch(() => {
    throw new Error('@aws-sdk/client-ses not installed. Run: pnpm add -D @aws-sdk/client-ses');
  });

  const sesClient = new SESClient({
    region,
    credentials: fromIni({ profile }),
  });

  // Check domain verification
  const verificationCommand = new GetIdentityVerificationAttributesCommand({
    Identities: [domainName],
  });
  const verificationResponse = await sesClient.send(verificationCommand);
  const verificationAttrs = verificationResponse.VerificationAttributes?.[domainName];

  // Check DKIM
  const dkimCommand = new GetIdentityDkimAttributesCommand({
    Identities: [domainName],
  });
  const dkimResponse = await sesClient.send(dkimCommand);
  const dkimAttrs = dkimResponse.DkimAttributes?.[domainName];

  const verificationStatus = verificationAttrs?.VerificationStatus || 'NotStarted';
  const dkimStatus = dkimAttrs?.DkimVerificationStatus || 'NotStarted';
  const dkimEnabled = dkimAttrs?.DkimEnabled || false;

  console.log('📊 SES Status:\n');
  console.log(`   Domain Verification: ${verificationStatus === 'Success' ? '✅' : '❌'} ${verificationStatus}`);
  console.log(`   DKIM Status: ${dkimStatus === 'Success' ? '✅' : '❌'} ${dkimStatus}`);
  console.log(`   DKIM Enabled: ${dkimEnabled ? 'Yes' : 'No'}`);

  if (dkimAttrs?.DkimTokens && dkimAttrs.DkimTokens.length > 0) {
    console.log(`   DKIM Tokens: ${dkimAttrs.DkimTokens.length} token(s)`);
  }

  // Check SSM parameters for SMTP credentials
  console.log('\n📋 Checking SMTP Relay Configuration:\n');
  try {
    const { SSMClient, GetParameterCommand } = await import('@aws-sdk/client-ssm');
    const ssmClient = new SSMClient({
      region,
      credentials: fromIni({ profile }),
    });

    const stackName = stackInfo.stackName;
    const smtpUsernameParam = `/smtp-username-${stackName}`;
    const smtpPasswordParam = `/smtp-password-${stackName}`;

    try {
      await ssmClient.send(
        new GetParameterCommand({ Name: smtpUsernameParam, WithDecryption: true })
      );
      console.log(`   ✅ SMTP Username: Configured`);
    } catch {
      console.log(`   ❌ SMTP Username: Not found`);
    }

    try {
      await ssmClient.send(
        new GetParameterCommand({ Name: smtpPasswordParam, WithDecryption: true })
      );
      console.log(`   ✅ SMTP Password: Configured`);
    } catch {
      console.log(`   ❌ SMTP Password: Not found`);
    }
  } catch (error) {
    console.log(`   ⚠️  Could not check SMTP credentials: ${error instanceof Error ? error.message : String(error)}`);
  }

  // Summary
  console.log('\n📊 SES Configuration Summary:\n');
  const allVerified = verificationStatus === 'Success' && dkimStatus === 'Success';

  if (allVerified) {
    console.log('   ✅ SES is fully configured and verified\n');
  } else {
    console.log('   ⚠️  SES configuration needs attention\n');
    if (verificationStatus !== 'Success') {
      console.log('   💡 Domain verification failed - set DNS records:');
      console.log(`      nx run cdk-emcnotary-instance:admin:ses-dns\n`);
    }
    if (dkimStatus !== 'Success') {
      console.log('   💡 DKIM verification failed - ensure DKIM CNAME records are set\n');
    }
  }
}

async function provideMailboxRestoreGuidance(options: VerifyOptions): Promise<void> {
  const appPath = options.appPath || process.env.APP_PATH || 'apps/cdk-emc-notary/instance';
  const domain = options.domain || process.env.DOMAIN;

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📦 Step 3: Mailbox Restoration Guidance');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  console.log('Available restore commands:\n');
  console.log('1. Restore users and mailboxes (combined workflow):');
  console.log('   BACKUP_PATH=/path/to/backup pnpm nx run cdk-emcnotary-instance:admin:restore:users-and-mailboxes\n');
  
  console.log('2. Restore mailboxes only:');
  console.log('   BACKUP_PATH=/path/to/backup pnpm nx run cdk-emcnotary-instance:admin:mailboxes:restore\n');
  
  console.log('3. Restore aggregated mailboxes (from multiple backups):');
  console.log('   BACKUP_FOLDERS=/path1,/path2 pnpm nx run cdk-emcnotary-instance:admin:mailboxes:restore-aggregated\n');
  
  console.log('4. Discover users from backup:');
  console.log('   BACKUP_PATH=/path/to/backup pnpm nx run cdk-emcnotary-instance:admin:users:discover-from-mailboxes\n');
  
  console.log('💡 Tips:');
  console.log('   • Use DRY_RUN=1 to preview changes before restoring');
  console.log('   • Use VERIFY_AFTER_RESTORE=1 to verify restoration');
  console.log('   • Backup path can be a directory or tar.gz file\n');
}

async function main(): Promise<void> {
  const region = process.env.AWS_REGION || 'us-east-1';
  const profile = process.env.AWS_PROFILE || 'hepe-admin-mfa';
  const appPath = process.env.APP_PATH || 'apps/cdk-emc-notary/instance';
  const domain = process.env.DOMAIN || 'emcnotary.com';

  console.log('🚀 EMC Notary Mailserver Verification & Setup');
  console.log(`   Domain: ${domain}`);
  console.log(`   Region: ${region}`);
  console.log(`   Profile: ${profile}\n`);

  try {
    await verifyRecoverySystem({ domain, appPath, region, profile });
    await verifySesConfiguration({ domain, appPath, region, profile });
    await provideMailboxRestoreGuidance({ domain, appPath, region, profile });

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✅ Verification Complete');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  } catch (error) {
    console.error('\n❌ Verification failed:');
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

if (require.main === module) {
  main().catch(console.error);
}

