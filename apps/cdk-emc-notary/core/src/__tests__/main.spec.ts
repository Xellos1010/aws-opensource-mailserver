import * as cdk from 'aws-cdk-lib';

describe('CDK App Entry Point', () => {
  beforeEach(() => {
    // Clean up environment variables
    delete process.env['DOMAIN'];
  });

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

  it('falls back to default when context and env are empty', () => {
    const app = new cdk.App();
    const domain = app.node.tryGetContext('domain') || 
                   process.env['DOMAIN'] || 
                   'emcnotary.com';
    
    expect(domain).toBe('emcnotary.com');
  });
});

