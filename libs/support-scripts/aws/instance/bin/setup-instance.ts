#!/usr/bin/env ts-node

import { runMiaBSetupForDomain } from '../src/lib/setup';

const domain = process.env.DOMAIN || 'emcnotary.com';
const region = process.env.CDK_DEFAULT_REGION || 'us-east-1';

runMiaBSetupForDomain(domain, region).catch((e) => {
  console.error(e);
  process.exit(1);
});
