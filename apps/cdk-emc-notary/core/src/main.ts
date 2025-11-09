#!/usr/bin/env node

import * as cdk from 'aws-cdk-lib';
import { EmcNotaryCoreStack } from './stacks/core-stack';
import { toMailserverCoreStackName } from '@mm/infra-naming';

const app = new cdk.App();

// Domain can be provided via CDK context or environment variable
// Default domain for EMC Notary
const defaultDomain = 'emcnotary.com';
const domain = app.node.tryGetContext('domain') || process.env['DOMAIN'] || defaultDomain;

// Create stack name using canonical naming utility
const stackName = toMailserverCoreStackName(domain);

new EmcNotaryCoreStack(app, stackName, {
  env: {
    account: process.env['CDK_DEFAULT_ACCOUNT'],
    region: process.env['CDK_DEFAULT_REGION'] || 'us-east-1',
  },
  description:
    'EMC Notary Mailserver – Core stack (SES/S3/SNS/CloudWatch/SSM params)',
  // Optional: Pass central backup bucket if mailservers-backups stack exists
  // This can be set via environment variable or CDK context
  // If not provided, core stack will work without it
});

app.synth();

