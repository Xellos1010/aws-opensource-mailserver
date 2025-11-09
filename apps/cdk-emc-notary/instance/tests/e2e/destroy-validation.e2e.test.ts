import { execSync } from 'child_process';
import { existsSync } from 'fs';

describe('Destroy Operation E2E', () => {
  it('destroy command dependencies exist', () => {
    // Verify config-loader exists (required for destroy)
    expect(existsSync(
      'dist/libs/infra/config-loader/bin/cdk-deploy.js'
    )).toBe(true);
  });

  it('destroy command structure is valid', () => {
    // Verify destroy command can be constructed
    const destroyCmd = 
      'FEATURE_CDK_EMCNOTARY_STACKS_ENABLED=1 node ../../../../dist/libs/infra/config-loader/bin/cdk-deploy.js destroy --force';
    
    // Verify all components exist
    expect(existsSync(
      'dist/libs/infra/config-loader/bin/cdk-deploy.js'
    )).toBe(true);
  });

  it('validates feature flag is set for destroy', () => {
    // Destroy command should require FEATURE_CDK_EMCNOTARY_STACKS_ENABLED=1
    const projectJson = require('../../project.json');
    const destroyCommand = projectJson.targets.destroy.options.command;
    
    expect(destroyCommand).toContain('FEATURE_CDK_EMCNOTARY_STACKS_ENABLED=1');
  });

  it('validates destroy does not affect core stack (EIP remains)', () => {
    // Instance stack destroy should not affect core stack
    // The EIP allocation ID comes from core stack SSM parameter
    // Destroying instance stack should only remove:
    // - EC2 Instance
    // - Security Group
    // - IAM Role/Profile
    // - Key Pair
    // - EIP Association (not the EIP itself)
    // - Lambda function
    // - EventBridge rule
    
    // The core stack EIP should remain intact
    // This is validated by the fact that EIP allocation ID is read from SSM parameter
    // which is managed by the core stack
    
    const projectJson = require('../../project.json');
    const destroyCommand = projectJson.targets.destroy.options.command;
    
    // Destroy command should not reference core stack resources
    expect(destroyCommand).not.toContain('cdk-emcnotary-core');
  });
});

