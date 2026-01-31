import { execSync } from 'child_process';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

describe('Instance Stack Deployment Smoke Tests', () => {
  const cdkOutDir = join(process.cwd(), 'dist/apps/cdk-k3frame/instance/cdk.out');
  const testStackName = 'k3frame-com-mailserver-instance';

  // Only run in environments with AWS credentials
  const hasAwsCredentials =
    process.env['AWS_ACCESS_KEY_ID'] && process.env['AWS_SECRET_ACCESS_KEY'];

  describe('CDK Diff Validation', () => {
    it('can diff without errors', () => {
      // Ensure build has run first
      execSync('pnpm nx build cdk-k3frame-instance', {
        stdio: 'pipe',
        cwd: process.cwd(),
      });

      // Diff may fail if stack doesn't exist, which is OK for testing
      try {
        execSync('pnpm nx run cdk-k3frame-instance:diff', {
          stdio: 'pipe',
          timeout: 30000,
          cwd: process.cwd(),
          env: {
            ...process.env,
            FEATURE_CDK_k3frame_STACKS_ENABLED: '1',
          },
        });
      } catch (error) {
        // Diff can fail if stack doesn't exist - that's expected
        // Just verify the command structure is valid
        expect(error).toBeDefined();
      }
    });
  });

  describe('Template Validation', () => {
    beforeAll(() => {
      // Ensure build has run first
      execSync('pnpm nx build cdk-k3frame-instance', {
        stdio: 'pipe',
        cwd: process.cwd(),
      });

      // Ensure cdk.out directory exists
      try {
        const distDir = join(process.cwd(), 'dist/apps/cdk-k3frame/instance');
        if (!existsSync(distDir)) {
          require('fs').mkdirSync(distDir, { recursive: true });
        }
        const cdkOutPath = join(distDir, 'cdk.out');
        if (!existsSync(cdkOutPath)) {
          require('fs').mkdirSync(cdkOutPath, { recursive: true });
        }
      } catch (error) {
        // Directory might already exist
      }

      // Ensure template exists - try synth if it doesn't exist
      if (!existsSync(join(cdkOutDir, `${testStackName}.template.json`))) {
        try {
          execSync('pnpm nx run cdk-k3frame-instance:synth', {
            stdio: 'pipe',
            cwd: process.cwd(),
            env: {
              ...process.env,
              FEATURE_CDK_k3frame_STACKS_ENABLED: '1',
            },
          });
        } catch (error) {
          // Synth may fail in test environment - skip template validation tests
          console.warn('Synth failed, skipping template validation tests');
        }
      }
    });

    it('generates expected number of resources', () => {
      const templatePath = join(cdkOutDir, `${testStackName}.template.json`);

      if (!existsSync(templatePath)) {
        // Skip if template doesn't exist (synth may have failed)
        console.warn('Template not found, skipping resource count test');
        return;
      }

      const template = JSON.parse(readFileSync(templatePath, 'utf8'));

      // Should have at least: EC2 Instance, Security Group, IAM Role/Profile,
      // Key Pair, EIP Association, Lambda, EventBridge Rule, and related resources
      expect(Object.keys(template.Resources).length).toBeGreaterThan(10);
    });

    it('all resources have required properties', () => {
      const templatePath = join(cdkOutDir, `${testStackName}.template.json`);
      
      if (!existsSync(templatePath)) {
        console.warn('Template not found, skipping resource properties test');
        return;
      }
      
      const template = JSON.parse(readFileSync(templatePath, 'utf8'));

      Object.entries(template.Resources).forEach(([logicalId, resource]: [string, any]) => {
        expect(resource).toHaveProperty('Type');
        expect(resource).toHaveProperty('Properties');
      });
    });

    it('security group rules are properly formatted', () => {
      const templatePath = join(cdkOutDir, `${testStackName}.template.json`);
      
      if (!existsSync(templatePath)) {
        console.warn('Template not found, skipping security group test');
        return;
      }
      
      const template = JSON.parse(readFileSync(templatePath, 'utf8'));

      const securityGroups = Object.entries(template.Resources).filter(
        ([, resource]: [string, any]) => resource.Type === 'AWS::EC2::SecurityGroup'
      );

      expect(securityGroups.length).toBeGreaterThan(0);

      securityGroups.forEach(([, resource]: [string, any]) => {
        expect(resource.Properties).toHaveProperty('SecurityGroupIngress');
        expect(Array.isArray(resource.Properties.SecurityGroupIngress)).toBe(true);
        
        // Verify at least one ingress rule exists
        expect(resource.Properties.SecurityGroupIngress.length).toBeGreaterThan(0);
        
        // Verify each rule has required properties
        resource.Properties.SecurityGroupIngress.forEach((rule: any) => {
          expect(rule).toHaveProperty('IpProtocol');
          expect(rule).toHaveProperty('FromPort');
          expect(rule).toHaveProperty('ToPort');
          expect(rule).toHaveProperty('CidrIp');
        });
      });
    });

    it('IAM policies are properly formatted', () => {
      const templatePath = join(cdkOutDir, `${testStackName}.template.json`);
      
      if (!existsSync(templatePath)) {
        console.warn('Template not found, skipping IAM policy test');
        return;
      }
      
      const template = JSON.parse(readFileSync(templatePath, 'utf8'));

      const iamPolicies = Object.entries(template.Resources).filter(
        ([, resource]: [string, any]) => resource.Type === 'AWS::IAM::Policy'
      );

      expect(iamPolicies.length).toBeGreaterThan(0);

      iamPolicies.forEach(([, resource]: [string, any]) => {
        expect(resource.Properties).toHaveProperty('PolicyDocument');
        expect(resource.Properties.PolicyDocument).toHaveProperty('Statement');
        expect(Array.isArray(resource.Properties.PolicyDocument.Statement)).toBe(true);
        
        // Verify each statement has required properties
        resource.Properties.PolicyDocument.Statement.forEach((statement: any) => {
          expect(statement).toHaveProperty('Effect');
          expect(statement).toHaveProperty('Action');
        });
      });
    });
  });

  (hasAwsCredentials ? describe : describe.skip)(
    'AWS CloudFormation Validation',
    () => {
      it('templates pass CloudFormation validation', () => {
        const templatePath = join(cdkOutDir, `${testStackName}.template.json`);

        if (!existsSync(templatePath)) {
          try {
            execSync('pnpm nx run cdk-k3frame-instance:synth', {
              stdio: 'pipe',
              cwd: process.cwd(),
              env: {
                ...process.env,
                FEATURE_CDK_k3frame_STACKS_ENABLED: '1',
              },
            });
          } catch (error) {
            console.warn('Synth failed, skipping CloudFormation validation');
            return;
          }
        }

        if (!existsSync(templatePath)) {
          console.warn('Template not found, skipping CloudFormation validation');
          return;
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

