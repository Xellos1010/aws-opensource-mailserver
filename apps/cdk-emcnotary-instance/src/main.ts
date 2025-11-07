#!/usr/bin/env node

import * as cdk from 'aws-cdk-lib';
import { EmcNotaryInstanceStack } from './stacks/instance-stack';

const app = new cdk.App();

new EmcNotaryInstanceStack(app, 'emcnotary-mailserver-instance', {
  env: {
    account: process.env['CDK_DEFAULT_ACCOUNT'],
    region: process.env['CDK_DEFAULT_REGION'] || 'us-east-1',
  },
  description:
    'EMC Notary Mailserver – Instance stack (EC2/SG/EIP/InstanceProfile/userData)',
});

app.synth();

