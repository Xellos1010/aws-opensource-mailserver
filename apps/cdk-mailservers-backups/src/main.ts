#!/usr/bin/env node

import * as cdk from 'aws-cdk-lib';
import { MailserversBackupsStack } from './stacks/backups-stack';

const app = new cdk.App();

// Central backup stack for all mailserver deployments
// This is a shared stack that should be deployed once and referenced by all mailserver stacks
const stackName = 'mailservers-backups';

new MailserversBackupsStack(app, stackName, {
  env: {
    account: process.env['CDK_DEFAULT_ACCOUNT'],
    region: process.env['CDK_DEFAULT_REGION'] || 'us-east-1',
  },
  description:
    'Central backup infrastructure for all mailserver deployments (S3 backup bucket)',
});

app.synth();

