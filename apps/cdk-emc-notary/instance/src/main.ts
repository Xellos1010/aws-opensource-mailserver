#!/usr/bin/env node

import * as cdk from 'aws-cdk-lib';
import { MailServerInstanceStack, EmcNotaryInstanceStack } from './stacks/instance-stack';
import { DomainConfig, InstanceConfig } from '@mm/infra-instance-constructs';
import {
  toMailserverInstanceStackName,
  coreParamPrefix,
} from '@mm/infra-naming';

const app = new cdk.App();

// Domain configuration can be provided via CDK context or environment variables
// Default to emcnotary.com for backward compatibility
const domain = app.node.tryGetContext('domain') || process.env['DOMAIN'] || 'emcnotary.com';
const instanceDns = app.node.tryGetContext('instanceDns') || process.env['INSTANCE_DNS'] || 'box';
const coreParamPrefixValue =
  app.node.tryGetContext('coreParamPrefix') || coreParamPrefix(domain);

// Instance configuration from context
const instanceConfig: InstanceConfig = {
  instanceType: app.node.tryGetContext('instanceType'),
  instanceDns: app.node.tryGetContext('instanceDns'),
  sesRelay: app.node.tryGetContext('sesRelay') !== 'false',
  swapSizeGiB: app.node.tryGetContext('swapSizeGiB'),
  mailInABoxVersion: app.node.tryGetContext('mailInABoxVersion'),
  mailInABoxCloneUrl: app.node.tryGetContext('mailInABoxCloneUrl'),
  nightlyRebootSchedule: app.node.tryGetContext('nightlyRebootSchedule'),
  nightlyRebootDescription: app.node.tryGetContext('nightlyRebootDescription'),
};

// Derive stack name from domain using canonical naming utility
const stackName =
  app.node.tryGetContext('stackName') || toMailserverInstanceStackName(domain);

const domainConfig: DomainConfig = {
  domainName: domain,
  instanceDns,
  coreParamPrefix: coreParamPrefixValue,
  stackName,
};

// Use generic MailServerInstanceStack for multi-domain support
// EmcNotaryInstanceStack is kept for backward compatibility
if (domain === 'emcnotary.com') {
  new EmcNotaryInstanceStack(app, stackName, {
    env: {
      account: process.env['CDK_DEFAULT_ACCOUNT'],
      region: process.env['CDK_DEFAULT_REGION'] || 'us-east-1',
    },
    description: `${domain} Mailserver – Instance stack (EC2/SG/EIP/InstanceProfile/SSM Bootstrap Ready)`,
  });
} else {
  new MailServerInstanceStack(app, stackName, {
    domainConfig,
    instanceConfig,
    env: {
      account: process.env['CDK_DEFAULT_ACCOUNT'],
      region: process.env['CDK_DEFAULT_REGION'] || 'us-east-1',
    },
    description: `${domain} Mailserver – Instance stack (EC2/SG/EIP/InstanceProfile/SSM Bootstrap Ready)`,
  });
}

app.synth();

