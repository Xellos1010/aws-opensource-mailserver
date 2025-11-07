#!/usr/bin/env node

import * as cdk from 'aws-cdk-lib';
import { EmcNotaryCoreStack } from './stacks/core-stack';

const app = new cdk.App();

new EmcNotaryCoreStack(app, 'emcnotary-mailserver-core', {
  env: {
    account: process.env['CDK_DEFAULT_ACCOUNT'],
    region: process.env['CDK_DEFAULT_REGION'] || 'us-east-1',
  },
  description:
    'EMC Notary Mailserver – Core stack (SES/S3/SNS/CloudWatch/SSM params)',
});

app.synth();

