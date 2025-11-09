import * as cdk from 'aws-cdk-lib';
import { coreParamPrefix } from '@mm/infra-naming';
import { toMailserverInstanceStackName } from '@mm/infra-naming';

describe('CDK App Entry Point', () => {
  beforeEach(() => {
    // Clean up environment variables
    delete process.env['DOMAIN'];
    delete process.env['INSTANCE_DNS'];
    delete process.env['CORE_PARAM_PREFIX'];
  });

  describe('Domain Resolution', () => {
    it('uses default domain when no context provided', () => {
      const app = new cdk.App();
      const domain = app.node.tryGetContext('domain') || 
                     process.env['DOMAIN'] || 
                     'emcnotary.com';
      
      expect(domain).toBe('emcnotary.com');
    });

    it('uses CDK context domain when provided', () => {
      const app = new cdk.App();
      app.node.setContext('domain', 'test.example.com');
      const domain = app.node.tryGetContext('domain') || 
                     process.env['DOMAIN'] || 
                     'emcnotary.com';
      
      expect(domain).toBe('test.example.com');
    });

    it('uses environment variable domain when provided', () => {
      process.env['DOMAIN'] = 'env.example.com';
      const app = new cdk.App();
      const domain = app.node.tryGetContext('domain') || 
                     process.env['DOMAIN'] || 
                     'emcnotary.com';
      
      expect(domain).toBe('env.example.com');
      delete process.env['DOMAIN'];
    });

    it('prefers CDK context over environment variable', () => {
      process.env['DOMAIN'] = 'env.example.com';
      const app = new cdk.App();
      app.node.setContext('domain', 'context.example.com');
      const domain = app.node.tryGetContext('domain') || 
                     process.env['DOMAIN'] || 
                     'emcnotary.com';
      
      expect(domain).toBe('context.example.com');
      delete process.env['DOMAIN'];
    });
  });

  describe('InstanceDns Resolution', () => {
    it('uses default instanceDns when no context provided', () => {
      const app = new cdk.App();
      const instanceDns = app.node.tryGetContext('instanceDns') || 
                         process.env['INSTANCE_DNS'] || 
                         'box';
      
      expect(instanceDns).toBe('box');
    });

    it('uses CDK context instanceDns when provided', () => {
      const app = new cdk.App();
      app.node.setContext('instanceDns', 'mail');
      const instanceDns = app.node.tryGetContext('instanceDns') || 
                         process.env['INSTANCE_DNS'] || 
                         'box';
      
      expect(instanceDns).toBe('mail');
    });

    it('uses environment variable instanceDns when provided', () => {
      process.env['INSTANCE_DNS'] = 'server';
      const app = new cdk.App();
      const instanceDns = app.node.tryGetContext('instanceDns') || 
                         process.env['INSTANCE_DNS'] || 
                         'box';
      
      expect(instanceDns).toBe('server');
      delete process.env['INSTANCE_DNS'];
    });
  });

  describe('CoreParamPrefix Resolution', () => {
    it('derives coreParamPrefix from domain when not provided', () => {
      const app = new cdk.App();
      app.node.setContext('domain', 'test.example.com');
      const domain = app.node.tryGetContext('domain') || 
                     process.env['DOMAIN'] || 
                     'emcnotary.com';
      const coreParamPrefixValue =
        app.node.tryGetContext('coreParamPrefix') || coreParamPrefix(domain);
      
      // coreParamPrefix uses only the first part of the domain (before the dot)
      expect(coreParamPrefixValue).toBe('/test/core');
    });

    it('uses provided coreParamPrefix when set', () => {
      const app = new cdk.App();
      app.node.setContext('coreParamPrefix', '/custom/core');
      const coreParamPrefixValue =
        app.node.tryGetContext('coreParamPrefix') || coreParamPrefix('test.example.com');
      
      expect(coreParamPrefixValue).toBe('/custom/core');
    });

    it('uses default coreParamPrefix for emcnotary.com', () => {
      const app = new cdk.App();
      const domain = 'emcnotary.com';
      const coreParamPrefixValue = coreParamPrefix(domain);
      
      expect(coreParamPrefixValue).toBe('/emcnotary/core');
    });
  });

  describe('Stack Name Derivation', () => {
    it('derives stack name from domain', () => {
      const app = new cdk.App();
      app.node.setContext('domain', 'test.example.com');
      const domain = app.node.tryGetContext('domain') || 
                     process.env['DOMAIN'] || 
                     'emcnotary.com';
      const stackName =
        app.node.tryGetContext('stackName') || toMailserverInstanceStackName(domain);
      
      expect(stackName).toBe('test-example-com-mailserver-instance');
    });

    it('uses provided stackName when set', () => {
      const app = new cdk.App();
      app.node.setContext('stackName', 'custom-stack-name');
      const stackName =
        app.node.tryGetContext('stackName') || toMailserverInstanceStackName('test.example.com');
      
      expect(stackName).toBe('custom-stack-name');
    });

    it('derives correct stack name for emcnotary.com', () => {
      const stackName = toMailserverInstanceStackName('emcnotary.com');
      expect(stackName).toBe('emcnotary-com-mailserver-instance');
    });
  });

  describe('InstanceConfig Resolution', () => {
    it('creates instanceConfig from context', () => {
      const app = new cdk.App();
      app.node.setContext('instanceType', 't3.small');
      app.node.setContext('instanceDns', 'mail');
      app.node.setContext('sesRelay', 'true');
      app.node.setContext('swapSizeGiB', '2');
      
      const instanceConfig = {
        instanceType: app.node.tryGetContext('instanceType'),
        instanceDns: app.node.tryGetContext('instanceDns'),
        sesRelay: app.node.tryGetContext('sesRelay') !== 'false',
        swapSizeGiB: app.node.tryGetContext('swapSizeGiB'),
      };
      
      expect(instanceConfig.instanceType).toBe('t3.small');
      expect(instanceConfig.instanceDns).toBe('mail');
      expect(instanceConfig.sesRelay).toBe(true);
      expect(instanceConfig.swapSizeGiB).toBe('2');
    });

    it('defaults sesRelay to true when not set', () => {
      const app = new cdk.App();
      const sesRelay = app.node.tryGetContext('sesRelay') !== 'false';
      
      expect(sesRelay).toBe(true);
    });

    it('sets sesRelay to false when explicitly set', () => {
      const app = new cdk.App();
      app.node.setContext('sesRelay', 'false');
      const sesRelay = app.node.tryGetContext('sesRelay') !== 'false';
      
      expect(sesRelay).toBe(false);
    });
  });
});

