#!/usr/bin/env ts-node

import { runMiaBSetupForDomain } from '../libs/support-scripts/aws/instance/src/lib/setup';

const domain = process.env.DOMAIN;
const region = process.env.CDK_DEFAULT_REGION || 'us-east-1';

if (!domain) {
  console.error('Error: DOMAIN environment variable is required');
  console.error('Usage: DOMAIN=emcnotary.com pnpm exec tsx tools/instance-setup.cli.ts');
  process.exit(1);
}

runMiaBSetupForDomain(domain, region).catch((e) => {
  console.error(e);
  process.exit(1);
});
