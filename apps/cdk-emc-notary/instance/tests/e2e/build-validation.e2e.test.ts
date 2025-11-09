import { execSync } from 'child_process';
import { existsSync } from 'fs';
import { join } from 'path';

describe('Build Operation E2E', () => {
  const distDir = join(process.cwd(), 'dist/apps/cdk-emc-notary/instance');

  it('builds without errors', () => {
    expect(() => {
      execSync('pnpm nx build cdk-emcnotary-instance', {
        stdio: 'pipe',
        timeout: 60000,
        cwd: process.cwd(),
      });
    }).not.toThrow();
  });

  it('generates required output files', () => {
    execSync('pnpm nx build cdk-emcnotary-instance', {
      stdio: 'pipe',
      cwd: process.cwd(),
    });

    const distDir = join(process.cwd(), 'dist/apps/cdk-emc-notary/instance');
    expect(existsSync(join(distDir, 'main.cjs'))).toBe(true);
    expect(existsSync(join(distDir, 'cdk.json'))).toBe(true);
    expect(existsSync(join(distDir, 'package.json'))).toBe(true);
  });

  it('builds dependencies before instance stack', () => {
    // Verify build dependencies are resolved
    const buildOutput = execSync('pnpm nx build cdk-emcnotary-instance', {
      encoding: 'utf8',
      stdio: 'pipe',
      cwd: process.cwd(),
    });

    // Should not have module resolution errors
    expect(buildOutput).not.toContain('Cannot find module');
    expect(buildOutput).not.toContain('Module not found');
  });

  it('build output includes all required dependencies', () => {
    execSync('pnpm nx build cdk-emcnotary-instance', {
      stdio: 'pipe',
      cwd: process.cwd(),
    });

    // Verify critical dependencies are built
    expect(existsSync('dist/libs/infra/instance-constructs/src/index.js')).toBe(true);
    expect(existsSync('dist/libs/infra/shared-constructs/src/index.js')).toBe(true);
    expect(existsSync('dist/libs/infra/naming/src/index.js')).toBe(true);
  });
});

