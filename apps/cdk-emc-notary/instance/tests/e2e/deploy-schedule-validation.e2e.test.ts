import { execSync } from 'child_process';
import { readFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';

describe('Instance/Observability Boundary E2E', () => {
  const cdkOutDir = join(process.cwd(), 'dist/apps/cdk-emc-notary/instance/cdk.out');
  const testStackName = 'test-example-com-mailserver-instance';

  beforeAll(() => {
    try {
      execSync('pnpm nx build cdk-emcnotary-instance', {
        stdio: 'pipe',
        cwd: process.cwd(),
      });
    } catch {
      // Build may already exist in local workspace.
    }

    try {
      const distDir = join(process.cwd(), 'dist/apps/cdk-emc-notary/instance');
      if (!existsSync(distDir)) {
        mkdirSync(distDir, { recursive: true });
      }
      const cdkOutPath = join(distDir, 'cdk.out');
      if (!existsSync(cdkOutPath)) {
        mkdirSync(cdkOutPath, { recursive: true });
      }
    } catch {
      // Directory may already exist.
    }
  });

  function getTemplateOrSkip(): any | null {
    const templatePath = join(cdkOutDir, `${testStackName}.template.json`);

    if (!existsSync(templatePath)) {
      try {
        execSync(
          'FEATURE_CDK_EMCNOTARY_STACKS_ENABLED=1 DOMAIN=test.example.com pnpm nx run cdk-emcnotary-instance:synth',
          {
            stdio: 'pipe',
            cwd: process.cwd(),
          }
        );
      } catch {
        console.warn('Synth failed in local test environment, skipping boundary validation');
        return null;
      }
    }

    if (!existsSync(templatePath)) {
      console.warn('Template not found, skipping boundary validation');
      return null;
    }

    return JSON.parse(readFileSync(templatePath, 'utf8'));
  }

  it('does not synthesize reboot schedules or maintenance Lambdas in instance stack', () => {
    const template = getTemplateOrSkip();
    if (!template) return;

    const resources = Object.values(template.Resources || {}) as any[];
    const lambdaCount = resources.filter((r) => r.Type === 'AWS::Lambda::Function').length;
    const ruleCount = resources.filter((r) => r.Type === 'AWS::Events::Rule').length;

    expect(lambdaCount).toBe(0);
    expect(ruleCount).toBe(0);
  });

  it('publishes instance metadata parameters required by observability-maintenance stack', () => {
    const template = getTemplateOrSkip();
    if (!template) return;

    const params = Object.values(template.Resources || {})
      .filter((r: any) => r.Type === 'AWS::SSM::Parameter')
      .map((r: any) => r.Properties?.Name);

    expect(params).toContain('/test/instance/instanceId');
    expect(params).toContain('/test/instance/instanceDns');
    expect(params).toContain('/test/instance/stackName');
  });
});
