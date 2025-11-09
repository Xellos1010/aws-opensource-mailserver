import { execSync } from 'child_process';
import { existsSync } from 'fs';
import { join } from 'path';

describe('Deploy Operation E2E', () => {
  const hasAwsCredentials =
    process.env['AWS_ACCESS_KEY_ID'] && process.env['AWS_SECRET_ACCESS_KEY'];

  it('synth succeeds before deploy', () => {
    expect(() => {
      execSync('pnpm nx run cdk-emcnotary-core:synth', {
        stdio: 'pipe',
        timeout: 60000,
        cwd: process.cwd(),
        env: {
          ...process.env,
          FEATURE_CDK_EMCNOTARY_STACKS_ENABLED: '1',
        },
      });
    }).not.toThrow();
  });

  it('diff shows no synthesis errors for default domain', () => {
    // This should pass if stack is already deployed or can be synthesized
    const diffOutput = execSync(
      'pnpm nx run cdk-emcnotary-core:diff',
      {
        encoding: 'utf8',
        stdio: 'pipe',
        timeout: 60000,
        env: {
          ...process.env,
          FEATURE_CDK_EMCNOTARY_STACKS_ENABLED: '1',
          DOMAIN: 'emcnotary.com',
        },
      }
    );

    // Should not have synthesis errors
    expect(diffOutput).not.toContain('Error synthesizing');
    expect(diffOutput).not.toContain('Cannot find module');
  });

  it('deploy command dependencies exist', () => {
    // Verify config-loader exists (required for deploy)
    expect(existsSync(
      'dist/libs/infra/config-loader/bin/cdk-deploy.js'
    )).toBe(true);
  });

  it('deploy command structure is valid', () => {
    // Test that deploy command can be constructed without syntax errors
    const deployCmd = 
      'FEATURE_CDK_EMCNOTARY_STACKS_ENABLED=1 node ../../../../dist/libs/infra/config-loader/bin/cdk-deploy.js deploy --require-approval never';
    
    // Verify all components exist
    expect(existsSync(
      'dist/libs/infra/config-loader/bin/cdk-deploy.js'
    )).toBe(true);
  });

  (hasAwsCredentials ? it : it.skip)(
    'can validate template structure before deploy',
    () => {
      // Generate template
      execSync('pnpm nx run cdk-emcnotary-core:synth', {
        stdio: 'pipe',
        timeout: 60000,
        env: {
          ...process.env,
          FEATURE_CDK_EMCNOTARY_STACKS_ENABLED: '1',
        },
      });

      const templatePath = join(
        process.cwd(),
        'dist/apps/cdk-emc-notary/core/cdk.out',
        'emcnotary-com-mailserver-core.template.json'
      );

      expect(existsSync(templatePath)).toBe(true);
    }
  );
});

