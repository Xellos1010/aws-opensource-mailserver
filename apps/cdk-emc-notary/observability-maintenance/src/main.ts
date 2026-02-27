#!/usr/bin/env node

import * as cdk from 'aws-cdk-lib';
import {
  MailServerObservabilityMaintenanceStack,
  EmcNotaryObservabilityMaintenanceStack,
} from './stacks/observability-maintenance-stack';
import {
  coreParamPrefix,
  instanceParamPrefix,
  toMailserverObservabilityMaintenanceStackName,
} from '@mm/infra-naming';

const app = new cdk.App();

const domain = app.node.tryGetContext('domain') || process.env['DOMAIN'] || 'emcnotary.com';
const coreParamPrefixValue =
  app.node.tryGetContext('coreParamPrefix') || coreParamPrefix(domain);
const instanceParamPrefixValue =
  app.node.tryGetContext('instanceParamPrefix') || instanceParamPrefix(domain);

const stackName =
  app.node.tryGetContext('stackName') ||
  toMailserverObservabilityMaintenanceStackName(domain);

if (domain === 'emcnotary.com') {
  new EmcNotaryObservabilityMaintenanceStack(app, stackName, {
    env: {
      account: process.env['CDK_DEFAULT_ACCOUNT'],
      region: process.env['CDK_DEFAULT_REGION'] || 'us-east-1',
    },
    description: `${domain} Mailserver – Observability & maintenance stack`,
  });
} else {
  new MailServerObservabilityMaintenanceStack(app, stackName, {
    domain,
    coreParamPrefix: coreParamPrefixValue,
    instanceParamPrefix: instanceParamPrefixValue,
    env: {
      account: process.env['CDK_DEFAULT_ACCOUNT'],
      region: process.env['CDK_DEFAULT_REGION'] || 'us-east-1',
    },
    description: `${domain} Mailserver – Observability & maintenance stack`,
  });
}

app.synth();
