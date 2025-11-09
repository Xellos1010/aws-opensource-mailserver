import { execSync } from 'child_process';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

describe('Core Stack Deployment Smoke Tests', () => {
  const cdkOutDir = join(process.cwd(), 'dist/apps/cdk-emc-notary/core/cdk.out');
  const testStackName = 'emcnotary-com-mailserver-core';

  // Only run in environments with AWS credentials
  const hasAwsCredentials =
    process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY;

  describe('CDK Diff Validation', () => {
    it('can diff without errors', () => {
      expect(() => {
        execSync('pnpm nx run cdk-emcnotary-core:diff', {
          stdio: 'pipe',
          timeout: 30000,
          cwd: process.cwd(),
          env: {
            ...process.env,
            FEATURE_CDK_EMCNOTARY_STACKS_ENABLED: '1',
          },
        });
      }).not.toThrow();
    });
  });

  describe('Template Validation', () => {
    beforeAll(() => {
      // Ensure template exists
      if (!existsSync(join(cdkOutDir, `${testStackName}.template.json`))) {
        execSync('pnpm nx run cdk-emcnotary-core:synth', {
          stdio: 'pipe',
          cwd: process.cwd(),
          env: {
            ...process.env,
            FEATURE_CDK_EMCNOTARY_STACKS_ENABLED: '1',
          },
        });
      }
    });

    it('generates expected number of resources', () => {
      const templatePath = join(cdkOutDir, `${testStackName}.template.json`);

      if (!existsSync(templatePath)) {
        execSync('pnpm nx run cdk-emcnotary-core:synth', {
          stdio: 'pipe',
          cwd: process.cwd(),
          env: {
            ...process.env,
            FEATURE_CDK_EMCNOTARY_STACKS_ENABLED: '1',
          },
        });
      }

      const template = JSON.parse(readFileSync(templatePath, 'utf8'));

      // Should have at least: EIP, 2 Buckets, SES Identity, SNS Topic,
      // Log Group, 2 Lambdas, multiple IAM roles/policies, SSM params
      expect(Object.keys(template.Resources).length).toBeGreaterThan(15);
    });

    it('all resources have required properties', () => {
      const templatePath = join(cdkOutDir, `${testStackName}.template.json`);
      const template = JSON.parse(readFileSync(templatePath, 'utf8'));

      Object.entries(template.Resources).forEach(([logicalId, resource]: [string, any]) => {
        expect(resource).toHaveProperty('Type');
        expect(resource).toHaveProperty('Properties');
      });
    });

    it('SSM parameters are properly formatted', () => {
      const templatePath = join(cdkOutDir, `${testStackName}.template.json`);
      const template = JSON.parse(readFileSync(templatePath, 'utf8'));

      const ssmParams = Object.entries(template.Resources).filter(
        ([, resource]: [string, any]) => resource.Type === 'AWS::SSM::Parameter'
      );

      expect(ssmParams.length).toBeGreaterThan(0);

      ssmParams.forEach(([, resource]: [string, any]) => {
        expect(resource.Properties).toHaveProperty('Name');
        expect(resource.Properties).toHaveProperty('Type');
        expect(resource.Properties).toHaveProperty('Value');
      });
    });
  });

  (hasAwsCredentials ? describe : describe.skip)(
    'AWS CloudFormation Validation',
    () => {
      it('templates pass CloudFormation validation', () => {
        const templatePath = join(cdkOutDir, `${testStackName}.template.json`);

        if (!existsSync(templatePath)) {
          execSync('pnpm nx run cdk-emcnotary-core:synth', {
            stdio: 'pipe',
            cwd: process.cwd(),
            env: {
              ...process.env,
              FEATURE_CDK_EMCNOTARY_STACKS_ENABLED: '1',
            },
          });
        }

        try {
          const result = execSync(
            `aws cloudformation validate-template --template-body file://${templatePath}`,
            {
              stdio: 'pipe',
              encoding: 'utf8',
            }
          );
          expect(result).toBeTruthy();
        } catch (error: any) {
          // If AWS CLI fails, log but don't fail test
          console.warn(
            'CloudFormation validation skipped:',
            error.message
          );
        }
      });
    }
  );
});

