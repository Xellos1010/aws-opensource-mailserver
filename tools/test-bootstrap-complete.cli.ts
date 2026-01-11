#!/usr/bin/env ts-node

import { DescribeInstancesCommand, EC2Client } from '@aws-sdk/client-ec2';
import { SSMClient, GetParameterCommand } from '@aws-sdk/client-ssm';
import { fromIni } from '@aws-sdk/credential-providers';
import { getStackInfoFromApp } from '@mm/admin-stack-info';

type CliOptions = {
  appPath?: string;
  domain?: string;
  region?: string;
  profile?: string;
};

function parseArgs(): CliOptions {
  const args = process.argv.slice(2);
  const options: CliOptions = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const nextArg = args[i + 1];

    switch (arg) {
      case '--app-path': {
        if (nextArg && !nextArg.startsWith('--')) {
          options.appPath = nextArg;
          i++;
        }
        break;
      }
      case '--domain': {
        if (nextArg && !nextArg.startsWith('--')) {
          options.domain = nextArg;
          i++;
        }
        break;
      }
      case '--region': {
        if (nextArg && !nextArg.startsWith('--')) {
          options.region = nextArg;
          i++;
        }
        break;
      }
      case '--profile': {
        if (nextArg && !nextArg.startsWith('--')) {
          options.profile = nextArg;
          i++;
        }
        break;
      }
      case '--help':
      case '-h': {
        printHelp();
        process.exit(0);
      }
    }
  }

  return options;
}

function printHelp(): void {
  console.log(`
Usage: test-bootstrap-complete.cli.ts [OPTIONS]

Validates that MIAB bootstrap has completed by checking for the admin password SSM parameter.

Options:
  --app-path PATH          App path used for stack resolution (default: apps/cdk-emc-notary/instance)
  --domain DOMAIN          Domain name (default: derived from app path; fallback emcnotary.com)
  --region REGION          AWS region (default: us-east-1)
  --profile PROFILE        AWS profile (default: hepe-admin-mfa)
  --help, -h               Show this help message

Environment Variables:
  APP_PATH                 Same as --app-path
  DOMAIN                   Same as --domain
  AWS_REGION               Same as --region
  AWS_PROFILE              Same as --profile
`);
}

function looksLikeInstanceId(v: string | undefined): v is string {
  return typeof v === 'string' && v.startsWith('i-') && v.length > 2;
}

async function main(): Promise<void> {
  const cli = parseArgs();

  const appPath =
    cli.appPath || process.env.APP_PATH || 'apps/cdk-emc-notary/instance';
  const region =
    cli.region ||
    process.env.AWS_REGION ||
    process.env.CDK_DEFAULT_REGION ||
    'us-east-1';
  const profile =
    cli.profile || process.env.AWS_PROFILE || process.env.PROFILE || 'hepe-admin-mfa';

  const domain = cli.domain || process.env.DOMAIN;

  console.log('🧪 Bootstrap prerequisite test');
  console.log(`   App Path: ${appPath}`);
  console.log(`   Domain: ${domain ?? '(derived)'}`);
  console.log(`   Region: ${region}`);
  console.log(`   Profile: ${profile}`);

  const stackInfo = await getStackInfoFromApp(appPath, {
    domain,
    region,
    profile,
  });

  const stackName = stackInfo.stackName;
  const resolvedDomain = stackInfo.domain;
  const adminPasswordParamName = `/MailInABoxAdminPassword-${stackName}`;

  const credentials = fromIni({ profile });
  const ssmClient = new SSMClient({ region, credentials });

  console.log(`   Resolved Domain: ${resolvedDomain}`);
  console.log(`   Instance Stack: ${stackName}`);
  console.log(`   SSM Param: ${adminPasswordParamName}`);

  try {
    const resp = await ssmClient.send(
      new GetParameterCommand({
        Name: adminPasswordParamName,
        WithDecryption: true,
      })
    );

    const adminPassword = resp.Parameter?.Value;
    if (!adminPassword) {
      console.error('\n❌ Bootstrap appears incomplete: Admin password parameter is empty');
      process.exit(1);
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('\n❌ Bootstrap appears incomplete: Admin password parameter not found/readable');
    console.error(`   ${message}`);
    console.error('\n   Next step: run bootstrap (or check bootstrap logs/status):');
    console.error(`   - pnpm nx run cdk-emcnotary-instance:admin:bootstrap-miab-ec2-instance -- --domain ${resolvedDomain}`);
    console.error(`   - pnpm nx run cdk-emcnotary-instance:admin:bootstrap:status -- --domain ${resolvedDomain}`);
    process.exit(1);
  }

  // Optional lightweight sanity check: instance exists and is running (for fast feedback).
  const instanceId = stackInfo.instanceId;
  if (looksLikeInstanceId(instanceId)) {
    const ec2Client = new EC2Client({ region, credentials });
    const instResp = await ec2Client.send(
      new DescribeInstancesCommand({ InstanceIds: [instanceId] })
    );
    const instance = instResp.Reservations?.[0]?.Instances?.[0];
    const state = instance?.State?.Name;
    if (state && state !== 'running') {
      console.error(`\n❌ Bootstrap prerequisites not met: EC2 instance is not running (${state})`);
      process.exit(1);
    }
  }

  console.log('\n✅ Bootstrap appears complete (admin password parameter present)');
}

if (require.main === module) {
  main().catch((error: unknown) => {
    console.error('\n❌ Bootstrap prerequisite test failed:');
    console.error(`   ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  });
}



