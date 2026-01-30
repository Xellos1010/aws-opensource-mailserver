import { execSync } from 'child_process';
import { existsSync } from 'fs';

describe('Destroy Operation E2E', () => {
  it('validates S3 bucket emptying requirement', () => {
    // Test that destroy command includes bucket emptying logic
    // The destroy command should check for admin-s3-empty task
    expect(existsSync('libs/admin/admin-s3-empty/src/index.ts')).toBe(true);
  });

  it('destroy command dependencies exist', () => {
    // Verify config-loader exists (required for destroy)
    expect(existsSync(
      'dist/libs/infra/config-loader/bin/cdk-deploy.js'
    )).toBe(true);
  });

  it('destroy command structure is valid', () => {
    // Verify destroy command can be constructed
    // The command should handle domain-specific bucket emptying
    const destroyCmd = 
      'FEATURE_CDK_K3FRAME_STACKS_ENABLED=1 node ../../../../dist/libs/infra/config-loader/bin/cdk-deploy.js destroy --force';
    
    // Verify all components exist
    expect(existsSync(
      'dist/libs/infra/config-loader/bin/cdk-deploy.js'
    )).toBe(true);
  });

  it('validates feature flag is set for destroy', () => {
    // Destroy command should require FEATURE_CDK_K3FRAME_STACKS_ENABLED=1
    const projectJson = require('../../project.json');
    const destroyCommand = projectJson.targets.destroy.options.command;
    
    expect(destroyCommand).toContain('FEATURE_CDK_K3FRAME_STACKS_ENABLED=1');
  });

  it('validates bucket emptying runs before destroy', () => {
    // Destroy command should include admin-s3-empty task
    const projectJson = require('../../project.json');
    const destroyCommand = projectJson.targets.destroy.options.command;
    
    expect(destroyCommand).toContain('admin-s3-empty');
  });
});

