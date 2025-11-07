#!/usr/bin/env node

import * as cdk from 'aws-cdk-lib';
import { EmcNotaryCoreStack } from './stacks/core-stack';

const app = new cdk.App();

// Default domain for EMC Notary
const defaultDomain = 'emcnotary.com';
const domain = process.env['DOMAIN'] || defaultDomain;

// Create stack name in format: {domain-tld}-mailserver-core
// e.g., emcnotary.com -> emcnotary-com-mailserver-core
const domainName = domain.replace(/\./g, '-');
const stackName = `${domainName}-mailserver-core`;

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

