#!/usr/bin/env ts-node

import {
  CloudFormationClient,
  DescribeStacksCommand,
} from '@aws-sdk/client-cloudformation';
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
Usage: test-core-deployed.cli.ts [OPTIONS]

Validates that the Mailserver core stack exists and is fully deployed.

Options:
  --app-path PATH          App path used for domain/stack resolution (default: apps/cdk-emc-notary/core)
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

async function main(): Promise<void> {
  const cli = parseArgs();

  const appPath = cli.appPath || process.env.APP_PATH || 'apps/cdk-emc-notary/core';
  const region =
    cli.region ||
    process.env.AWS_REGION ||
    process.env.CDK_DEFAULT_REGION ||
    'us-east-1';
  const profile = cli.profile || process.env.AWS_PROFILE || process.env.PROFILE || 'hepe-admin-mfa';

  const domain =
    cli.domain ||
    process.env.DOMAIN ||
    resolveDomain(appPath) ||
    'emcnotary.com';

  const stackName = resolveStackName(domain, appPath, cli.stackName || process.env.STACK_NAME, 'core');

  const credentials = fromIni({ profile });
  const cfClient = new CloudFormationClient({ region, credentials });

  console.log('🧪 Core stack prerequisite test');
  console.log(`   App Path: ${appPath}`);
  console.log(`   Domain: ${domain}`);
  console.log(`   Stack: ${stackName}`);
  console.log(`   Region: ${region}`);
  console.log(`   Profile: ${profile}`);

  const resp = await cfClient.send(new DescribeStacksCommand({ StackName: stackName }));
  const stack = resp.Stacks?.[0];
  if (!stack) {
    console.error(`\n❌ Core stack not found: ${stackName}`);
    process.exit(1);
  }

  if (!isCompleteStackStatus(stack.StackStatus)) {
    console.error(`\n❌ Core stack is not in a ready state: ${stack.StackStatus ?? 'UNKNOWN'}`);
    console.error('   Expected: CREATE_COMPLETE or UPDATE_COMPLETE');
    process.exit(1);
  }

  const outputs = new Map<string, string>();
  for (const o of stack.Outputs ?? []) {
    if (o.OutputKey && o.OutputValue) {
      outputs.set(o.OutputKey, o.OutputValue);
    }
  }

  const requiredOutputs = [
    // SES + DNS
    'DkimDNSTokenName1',
    'DkimDNSTokenValue1',
    'DkimDNSTokenName2',
    'DkimDNSTokenValue2',
    'DkimDNSTokenName3',
    'DkimDNSTokenValue3',
    'MailFromDomain',
    'MailFromMXRecord',
    'MailFromTXTRecord',
    // EIP / infra glue
    'ElasticIPAddress',
    'ElasticIPAllocationId',
    // Backups/alerts
    'BackupBucketName',
    'AlertTopicArn',
  ] as const;

  const missing = requiredOutputs.filter((k) => !outputs.get(k));
  if (missing.length > 0) {
    console.error('\n❌ Core stack is missing required outputs:');
    for (const k of missing) console.error(`   - ${k}`);
    console.error(`\n   Available outputs: ${[...outputs.keys()].sort().join(', ') || 'none'}`);
    process.exit(1);
  }

  console.log('\n✅ Core stack is deployed and required outputs are present');
}

if (require.main === module) {
  main().catch((error: unknown) => {
    console.error('\n❌ Core stack prerequisite test failed:');
    console.error(`   ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  });
}



