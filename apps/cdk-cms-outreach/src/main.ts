#!/usr/bin/env node

import * as cdk from 'aws-cdk-lib';
import { CmsOutreachStack } from './stacks/cms-outreach-stack';

const app = new cdk.App();

const domainName =
  app.node.tryGetContext('domain') || process.env['DOMAIN'] || 'emcnotary.com';

new CmsOutreachStack(app, `${domainName.replace(/\./g, '-')}-cms-outreach`, {
  domainName,
  env: {
    account: process.env['CDK_DEFAULT_ACCOUNT'],
    region: process.env['CDK_DEFAULT_REGION'] || 'us-east-1',
  },
  description:
    'CMS Outreach dedicated stack (ECS API/Worker, RDS Postgres, S3 artifacts, SQS queue, CloudWatch alarms)',
});

app.synth();
