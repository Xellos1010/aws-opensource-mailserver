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
};

const env = {
  account: process.env['CDK_DEFAULT_ACCOUNT'],
  region: process.env['CDK_DEFAULT_REGION'] || 'us-east-1',
};

// Derive stack names from domain using canonical naming utilities
const instanceStackName =
  app.node.tryGetContext('stackName') || toMailserverInstanceStackName(domain);

const domainConfig: DomainConfig = {
  domainName: domain,
  instanceDns,
  coreParamPrefix: coreParamPrefixValue,
  stackName: instanceStackName,
};

// ── Stack 1: Instance ────────────────────────────────────────────────────────
// Contains EC2, SG, EIP, key pair, IAM profile, SSM params.
// RARELY deployed — any change here risks replacing the EC2 instance.
// Use `deploy:instance` target explicitly (not the default `deploy`).
if (domain === 'emcnotary.com') {
  new EmcNotaryInstanceStack(app, instanceStackName, {
    env,
    description: `${domain} Mailserver – Instance stack (EC2/SG/EIP/InstanceProfile). CAUTION: changes may replace the EC2 instance.`,
  });
} else {
  new MailServerInstanceStack(app, instanceStackName, {
    domainConfig,
    instanceConfig,
    env,
    description: `${domain} Mailserver – Instance stack (EC2/SG/EIP/InstanceProfile). CAUTION: changes may replace the EC2 instance.`,
  });
}

app.synth();
