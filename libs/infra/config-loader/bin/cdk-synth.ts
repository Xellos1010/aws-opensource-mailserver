#!/usr/bin/env node

import { getCdkEnvVarsWithFallback } from '../src/lib/config';
import { execSync } from 'child_process';

/**
 * CDK synth wrapper that loads secure configuration
 * and sets up environment variables before running CDK synth.
 *
 * Supports:
 * - Environment variables (CDK_DEFAULT_ACCOUNT, CDK_DEFAULT_REGION, DOMAIN, etc.)
 * - .aws-config.local.json file
 * - AWS CLI fallback for account resolution
 * - Cross-platform (Windows, macOS, Linux)
 */
function main(): void {
  // Load configuration and get environment variables with AWS CLI fallback
  const envVars = getCdkEnvVarsWithFallback();

  // Merge with existing environment
  const env = {
    ...process.env,
    ...envVars,
  };

  // Validate account is set (required for VPC lookups)
  if (!env['CDK_DEFAULT_ACCOUNT']) {
    console.error('Error: CDK_DEFAULT_ACCOUNT is required.');
    console.error('Set it via:');
    console.error('  1. Environment variable: export CDK_DEFAULT_ACCOUNT=123456789012');
    console.error(
      `  2. .aws-config.local.json: { "cdk": { "defaultAccount": "123456789012" } }`
    );
    console.error(
      `  3. AWS CLI: Ensure AWS credentials are configured (profile: ${envVars['AWS_PROFILE']})`
    );
    process.exit(1);
  }

  // Build CDK context arguments from environment variables
  const contextArgs: string[] = [];

  if (env['DOMAIN']) {
    contextArgs.push(`--context domain=${env['DOMAIN']}`);
  }
  if (env['INSTANCE_DNS']) {
    contextArgs.push(`--context instanceDns=${env['INSTANCE_DNS']}`);
  }
  if (env['CORE_PARAM_PREFIX']) {
    contextArgs.push(`--context coreParamPrefix=${env['CORE_PARAM_PREFIX']}`);
  }
  if (env['INSTANCE_TYPE']) {
    contextArgs.push(`--context instanceType=${env['INSTANCE_TYPE']}`);
  }

  // Build full CDK command
  const fullCommand = `cdk synth ${contextArgs.join(' ')}`.trim();

  console.log('Loading deployment configuration...');
  console.log(`AWS Profile: ${envVars['AWS_PROFILE']}`);
  console.log(`AWS Region: ${envVars['AWS_REGION']}`);
  console.log(`CDK Account: ${env['CDK_DEFAULT_ACCOUNT']}`);
  console.log(`CDK Region: ${env['CDK_DEFAULT_REGION']}`);
  if (env['DOMAIN']) {
    console.log(`Domain: ${env['DOMAIN']}`);
  }
  if (env['INSTANCE_DNS']) {
    console.log(`Instance DNS: ${env['INSTANCE_DNS']}`);
  }
  console.log(`\nExecuting: ${fullCommand}\n`);

  try {
    execSync(fullCommand, {
      env,
      stdio: 'inherit',
      cwd: process.cwd(),
    });
  } catch {
    process.exit(1);
  }
}

main();
