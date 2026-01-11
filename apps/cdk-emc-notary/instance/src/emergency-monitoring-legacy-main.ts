#!/usr/bin/env node

import * as cdk from 'aws-cdk-lib';
import { EmergencyMonitoringLegacyStack } from './stacks/emergency-monitoring-legacy-stack';

const app = new cdk.App();

// Configuration from context or environment variables
const domain = app.node.tryGetContext('domain') || process.env['DOMAIN'] || 'hepefoundation.org';
const legacyStackName = app.node.tryGetContext('legacyStackName') || 
  process.env['LEGACY_STACK_NAME'] || 
  `${domain.replace(/\./g, '-')}-mailserver`;
const alarmsTopicArn = app.node.tryGetContext('alarmsTopicArn') || process.env['ALARMS_TOPIC_ARN'];

// Stack name
const stackName = app.node.tryGetContext('stackName') || 
  `${domain.replace(/\./g, '-')}-emergency-monitoring`;

new EmergencyMonitoringLegacyStack(app, 'EmergencyMonitoringLegacyStack', {
  stackName,
  legacyStackName,
  domainName: domain,
  alarmsTopicArn,
  env: {
    account: process.env['CDK_DEFAULT_ACCOUNT'],
    region: process.env['CDK_DEFAULT_REGION'] || 'us-east-1',
  },
});

app.synth();














