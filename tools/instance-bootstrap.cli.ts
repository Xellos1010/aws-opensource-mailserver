#!/usr/bin/env ts-node

import { bootstrapInstance, BootstrapOptions } from '../libs/support-scripts/aws/instance-bootstrap/src/lib/bootstrap';

/**
 * Parse command line arguments
 */
function parseArgs(): Partial<BootstrapOptions> {
  const args = process.argv.slice(2);
  const options: Partial<BootstrapOptions> = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const nextArg = args[i + 1];

    switch (arg) {
      case '--domain':
        if (nextArg && !nextArg.startsWith('--')) {
          options.domain = nextArg;
          i++;
        }
        break;
      case '--stack':
      case '--stack-name':
        if (nextArg && !nextArg.startsWith('--')) {
          options.stackName = nextArg;
          i++;
        }
        break;
      case '--region':
        if (nextArg && !nextArg.startsWith('--')) {
          options.region = nextArg;
          i++;
        }
        break;
      case '--profile':
        if (nextArg && !nextArg.startsWith('--')) {
          options.profile = nextArg;
          i++;
        }
        break;
      case '--dry-run':
        options.dryRun = true;
        break;
      case '--restore-prefix':
        if (nextArg && !nextArg.startsWith('--')) {
          options.restorePrefix = nextArg;
          i++;
        }
        break;
      case '--reboot':
        options.rebootAfterSetup = true;
        break;
      case '--no-reboot':
        options.rebootAfterSetup = false;
        break;
      case '--help':
      case '-h':
        printHelp();
        process.exit(0);
        break;
    }
  }

  return options;
}

/**
 * Print help message
 */
function printHelp(): void {
  console.log(`
Usage: instance-bootstrap.cli.ts [OPTIONS]

Bootstrap a Mail-in-a-Box instance via SSM RunCommand.

Options:
  --domain DOMAIN          Domain name (e.g., "emcnotary.com")
                           Used to derive stack name if --stack not provided
  --stack STACK_NAME       Explicit CloudFormation stack name
                           Overrides domain-derived stack name
  --region REGION          AWS region (default: us-east-1)
  --profile PROFILE        AWS profile for credentials (e.g., "hepe-admin-mfa")
  --dry-run                Show what would be done without executing
  --restore-prefix PREFIX  S3 prefix for backup restoration
  --reboot                 Reboot instance after setup (default: false)
  --no-reboot              Explicitly disable reboot after setup
  --help, -h               Show this help message

Environment Variables:
  DOMAIN                   Same as --domain
  STACK                    Same as --stack
  CDK_DEFAULT_REGION      Same as --region
  PROFILE                  Same as --profile
  DRY_RUN                  Same as --dry-run (set to "1")
  FEATURE_INSTANCE_BOOTSTRAP_ENABLED  Feature flag (default: enabled unless set to "0")

Examples:
  # Bootstrap emcnotary.com instance
  DOMAIN=emcnotary.com pnpm nx run ops-runner:instance:bootstrap

  # Dry run for different domain
  DOMAIN=askdaokapra.com pnpm nx run ops-runner:instance:bootstrap -- --dry-run

  # Explicit stack name
  STACK=my-alt-instance-stack pnpm nx run ops-runner:instance:bootstrap

  # With restore prefix
  DOMAIN=emcnotary.com pnpm nx run ops-runner:instance:bootstrap -- --restore-prefix i-1234567890abcdef0
`);
}

/**
 * Main entry point
 */
async function main(): Promise<void> {
  try {
    // Parse CLI args
    const cliOptions = parseArgs();

    // Merge with environment variables and defaults
    const options: BootstrapOptions = {
      domain: cliOptions.domain || process.env.DOMAIN || 'emcnotary.com',
      stackName: cliOptions.stackName || process.env.STACK,
      region: cliOptions.region || process.env.CDK_DEFAULT_REGION || 'us-east-1',
      profile: cliOptions.profile || process.env.PROFILE,
      dryRun: cliOptions.dryRun || process.env.DRY_RUN === '1',
      restorePrefix: cliOptions.restorePrefix || process.env.RESTORE_PREFIX,
      rebootAfterSetup: cliOptions.rebootAfterSetup !== undefined
        ? cliOptions.rebootAfterSetup
        : process.env.REBOOT_AFTER_SETUP === '1',
      featureFlagEnv: 'FEATURE_INSTANCE_BOOTSTRAP_ENABLED',
    };

    // Validate required options
    if (!options.domain && !options.stackName) {
      console.error('Error: Either --domain or --stack must be provided');
      console.error('Use --help for usage information');
      process.exit(1);
    }

    // Validate feature flag
    if (process.env[options.featureFlagEnv || 'FEATURE_INSTANCE_BOOTSTRAP_ENABLED'] === '0') {
      console.error(`Error: ${options.featureFlagEnv} is set to 0. Bootstrap is disabled.`);
      console.error(`Set ${options.featureFlagEnv}=1 to enable.`);
      process.exit(1);
    }

    // Execute bootstrap
    await bootstrapInstance(options);

    console.log('\n✅ Bootstrap operation completed successfully');
  } catch (error) {
    console.error('\n❌ Bootstrap failed:');
    if (error instanceof Error) {
      console.error(`   ${error.message}`);
      if (process.env.DEBUG === '1') {
        console.error('\nStack trace:');
        console.error(error.stack);
      }
    } else {
      console.error(`   ${String(error)}`);
    }
    process.exit(1);
  }
}

// Run if executed directly
if (require.main === module) {
  main().catch((error) => {
    console.error('Unhandled error:', error);
    process.exit(1);
  });
}
