#!/usr/bin/env ts-node

import {
  CloudFormationClient,
  DescribeStacksCommand,
} from '@aws-sdk/client-cloudformation';
import { DescribeInstancesCommand, EC2Client } from '@aws-sdk/client-ec2';
import { fromIni } from '@aws-sdk/credential-providers';
import { resolveDomain, resolveStackName } from '@mm/admin-stack-info';

type CliOptions = {
  appPath?: string;
  domain?: string;
  stackName?: string;
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
      case '--stack':
      case '--stack-name': {
        if (nextArg && !nextArg.startsWith('--')) {
          options.stackName = nextArg;
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
Usage: test-instance-deployed.cli.ts [OPTIONS]

Validates that the Mailserver instance stack exists, is deployed, and the EC2 instance is running.

Options:
  --app-path PATH          App path used for domain/stack resolution (default: apps/cdk-emc-notary/instance)
  --domain DOMAIN          Domain name (e.g., emcnotary.com)
  --stack-name STACK       Explicit CloudFormation stack name (overrides resolution)
  --region REGION          AWS region (default: us-east-1)
  --profile PROFILE        AWS profile (default: hepe-admin-mfa)
  --help, -h               Show this help message

Environment Variables:
  APP_PATH                 Same as --app-path
  DOMAIN                   Same as --domain
  STACK_NAME               Same as --stack-name
  AWS_REGION               Same as --region
  AWS_PROFILE              Same as --profile
`);
}

function isCompleteStackStatus(status: string | undefined): boolean {
  return status === 'CREATE_COMPLETE' || status === 'UPDATE_COMPLETE';
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

  const domain = cli.domain || process.env.DOMAIN || resolveDomain(appPath);
  
  if (!domain && !cli.stackName && !process.env.STACK_NAME) {
    console.error('Error: Cannot resolve domain or stack name. Provide --domain, --stack-name, or ensure APP_PATH resolves to a domain');
    process.exit(1);
  }

  const stackName = resolveStackName(
    domain,
    appPath,
    cli.stackName || process.env.STACK_NAME,
    'instance'
  );

  const credentials = fromIni({ profile });
  const cfClient = new CloudFormationClient({ region, credentials });
  const ec2Client = new EC2Client({ region, credentials });

  console.log('🧪 Instance stack prerequisite test');
  console.log(`   App Path: ${appPath}`);
  console.log(`   Domain: ${domain}`);
  console.log(`   Stack: ${stackName}`);
  console.log(`   Region: ${region}`);
  console.log(`   Profile: ${profile}`);

  const resp = await cfClient.send(new DescribeStacksCommand({ StackName: stackName }));
  const stack = resp.Stacks?.[0];
  if (!stack) {
    console.error(`\n❌ Instance stack not found: ${stackName}`);
    process.exit(1);
  }

  if (!isCompleteStackStatus(stack.StackStatus)) {
    console.error(`\n❌ Instance stack is not in a ready state: ${stack.StackStatus ?? 'UNKNOWN'}`);
    console.error('   Expected: CREATE_COMPLETE or UPDATE_COMPLETE');
    process.exit(1);
  }

  const outputs = new Map<string, string>();
  for (const o of stack.Outputs ?? []) {
    if (o.OutputKey && o.OutputValue) {
      outputs.set(o.OutputKey, o.OutputValue);
    }
  }

  const instanceId =
    outputs.get('InstanceId') ||
    outputs.get('RestorePrefixValue') ||
    outputs.get('RestorePrefix');

  if (!looksLikeInstanceId(instanceId)) {
    console.error('\n❌ Instance stack is missing a valid instance id output');
    console.error('   Expected one of: InstanceId, RestorePrefixValue, RestorePrefix');
    console.error(`   Available outputs: ${[...outputs.keys()].sort().join(', ') || 'none'}`);
    process.exit(1);
  }

  const keyPairId = outputs.get('KeyPairId');
  if (!keyPairId) {
    console.error('\n❌ Instance stack is missing required output: KeyPairId');
    console.error(`   Available outputs: ${[...outputs.keys()].sort().join(', ') || 'none'}`);
    process.exit(1);
  }

  const instResp = await ec2Client.send(
    new DescribeInstancesCommand({ InstanceIds: [instanceId] })
  );
  const instance = instResp.Reservations?.[0]?.Instances?.[0];
  const state = instance?.State?.Name;

  if (!state) {
    console.error(`\n❌ Could not determine EC2 instance state for ${instanceId}`);
    process.exit(1);
  }

  if (state !== 'running') {
    console.error(`\n❌ EC2 instance is not running: ${state}`);
    console.error('   Most operations (SSM bootstrap, SSH, MIAB API) require the instance to be running.');
    process.exit(1);
  }

  console.log(`\n✅ Instance stack is deployed and EC2 instance is running (${instanceId})`);
}

if (require.main === module) {
  main().catch((error: unknown) => {
    console.error('\n❌ Instance stack prerequisite test failed:');
    console.error(`   ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  });
}


