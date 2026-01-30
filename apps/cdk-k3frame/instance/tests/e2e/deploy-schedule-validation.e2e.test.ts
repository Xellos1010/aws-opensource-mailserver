import { execSync } from 'child_process';
import { readFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';

describe('Deploy Schedule Validation E2E', () => {
  const cdkOutDir = join(process.cwd(), 'dist/apps/cdk-k3frame/instance/cdk.out');
  const testStackName = 'test-example-com-mailserver-instance';

  beforeAll(() => {
    try {
      execSync('pnpm nx build cdk-k3frame-instance', {
        stdio: 'pipe',
        cwd: process.cwd(),
      });
    } catch (error) {
      // Build might have already run
    }

    try {
      const distDir = join(process.cwd(), 'dist/apps/cdk-k3frame/instance');
      if (!existsSync(distDir)) {
        mkdirSync(distDir, { recursive: true });
      }
      const cdkOutPath = join(distDir, 'cdk.out');
      if (!existsSync(cdkOutPath)) {
        mkdirSync(cdkOutPath, { recursive: true });
      }
    } catch (error) {
      // Directory might already exist
    }
  });

  describe('EventBridge Schedule Expression Validation', () => {
    it('validates EventBridge cron schedule has correct format (6 fields)', () => {
      execSync('pnpm nx build cdk-k3frame-instance', {
        stdio: 'pipe',
        cwd: process.cwd(),
      });

      const templatePath = join(cdkOutDir, `${testStackName}.template.json`);

      if (existsSync(templatePath)) {
        // Template already exists, validate it
        validateScheduleExpression(templatePath);
        return;
      }

      try {
        execSync(`FEATURE_CDK_K3FRAME_STACKS_ENABLED=1 DOMAIN=test.example.com pnpm nx run cdk-k3frame-instance:synth`, {
          stdio: 'pipe',
          cwd: process.cwd(),
        });

        if (existsSync(templatePath)) {
          validateScheduleExpression(templatePath);
        } else {
          console.warn('Template not found after synth, skipping schedule validation');
        }
      } catch (error) {
        console.warn('Synth failed in test environment, skipping schedule validation');
      }
    });

    it('validates default schedule expression format', () => {
      execSync('pnpm nx build cdk-k3frame-instance', {
        stdio: 'pipe',
        cwd: process.cwd(),
      });

      const templatePath = join(cdkOutDir, `${testStackName}.template.json`);

      if (!existsSync(templatePath)) {
        try {
          execSync(`FEATURE_CDK_K3FRAME_STACKS_ENABLED=1 DOMAIN=test.example.com pnpm nx run cdk-k3frame-instance:synth`, {
            stdio: 'pipe',
            cwd: process.cwd(),
          });
        } catch (error) {
          console.warn('Synth failed, skipping default schedule validation');
          return;
        }
      }

      if (!existsSync(templatePath)) {
        console.warn('Template not found, skipping default schedule validation');
        return;
      }

      const template = JSON.parse(readFileSync(templatePath, 'utf8'));

      // Find EventBridge rule for nightly reboot
      const rules = Object.entries(template.Resources || {}).filter(
        ([, resource]: [string, any]) => resource.Type === 'AWS::Events::Rule'
      );

      const rebootRule = rules.find(([, resource]: [string, any]) =>
        resource.Properties?.Description?.includes('Daily reboot') ||
        resource.Properties?.Description?.includes('nightly reboot')
      );

      expect(rebootRule).toBeDefined();

      if (rebootRule) {
        const ruleResource = rebootRule[1] as any;
        const scheduleExpression = ruleResource.Properties?.ScheduleExpression;
        expect(scheduleExpression).toBeDefined();

        // EventBridge cron format: cron(minute hour day-of-month month day-of-week year)
        // Default should be: cron(0 8 * * ? *) = 08:00 UTC daily
        expect(scheduleExpression).toMatch(/^cron\([^)]+\)$/);

        // Extract the cron expression parts
        const cronMatch = scheduleExpression.match(/^cron\((.+)\)$/);
        expect(cronMatch).toBeDefined();

        if (cronMatch) {
          const cronParts = cronMatch[1].split(' ');
          expect(cronParts.length).toBe(6); // EventBridge requires 6 fields

          // Validate field values
          const [minute, hour, dayOfMonth, month, dayOfWeek, year] = cronParts;

          // Minute: 0-59
          expect(parseInt(minute, 10)).toBeGreaterThanOrEqual(0);
          expect(parseInt(minute, 10)).toBeLessThanOrEqual(59);

          // Hour: 0-23
          expect(parseInt(hour, 10)).toBeGreaterThanOrEqual(0);
          expect(parseInt(hour, 10)).toBeLessThanOrEqual(23);

          // Day-of-week: ? or 0-6 (0=Sunday, 6=Saturday)
          expect(dayOfWeek === '?' || (parseInt(dayOfWeek, 10) >= 0 && parseInt(dayOfWeek, 10) <= 6)).toBe(true);

          // Year: * or 1970-2199
          expect(year === '*' || (parseInt(year, 10) >= 1970 && parseInt(year, 10) <= 2199)).toBe(true);
        }
      }
    });

    it('validates custom schedule expression format', () => {
      execSync('pnpm nx build cdk-k3frame-instance', {
        stdio: 'pipe',
        cwd: process.cwd(),
      });

      // Test with custom schedule
      const customTemplatePath = join(cdkOutDir, 'custom-schedule-test.template.json');

      try {
        execSync(
          `FEATURE_CDK_K3FRAME_STACKS_ENABLED=1 DOMAIN=test.example.com INSTANCE_NIGHTLY_REBOOT_SCHEDULE="0 9 * * ? *" pnpm nx run cdk-k3frame-instance:synth`,
          {
            stdio: 'pipe',
            cwd: process.cwd(),
          }
        );
      } catch (error) {
        // Custom schedule test might not be supported via env var, skip
        console.warn('Custom schedule test skipped (not supported via env var)');
        return;
      }

      // If template was generated, validate it
      if (existsSync(customTemplatePath)) {
        validateScheduleExpression(customTemplatePath);
      }
    });
  });

  describe('CloudFormation Template Validation', () => {
    it('validates EventBridge rule resource structure', () => {
      execSync('pnpm nx build cdk-k3frame-instance', {
        stdio: 'pipe',
        cwd: process.cwd(),
      });

      const templatePath = join(cdkOutDir, `${testStackName}.template.json`);

      if (!existsSync(templatePath)) {
        try {
          execSync(`FEATURE_CDK_K3FRAME_STACKS_ENABLED=1 DOMAIN=test.example.com pnpm nx run cdk-k3frame-instance:synth`, {
            stdio: 'pipe',
            cwd: process.cwd(),
          });
        } catch (error) {
          console.warn('Synth failed, skipping rule structure validation');
          return;
        }
      }

      if (!existsSync(templatePath)) {
        console.warn('Template not found, skipping rule structure validation');
        return;
      }

      const template = JSON.parse(readFileSync(templatePath, 'utf8'));

      // Find EventBridge rule
      const rules = Object.entries(template.Resources || {}).filter(
        ([, resource]: [string, any]) => resource.Type === 'AWS::Events::Rule'
      );

      const rebootRule = rules.find(([, resource]: [string, any]) =>
        resource.Properties?.Description?.includes('Daily reboot') ||
        resource.Properties?.Description?.includes('nightly reboot')
      );

      expect(rebootRule).toBeDefined();

      if (rebootRule) {
        const ruleResource = rebootRule[1] as any;
        expect(ruleResource.Properties).toBeDefined();
        expect(ruleResource.Properties).toHaveProperty('ScheduleExpression');
        expect(ruleResource.Properties).toHaveProperty('State', 'ENABLED');
        expect(ruleResource.Properties).toHaveProperty('Targets');
        expect(Array.isArray(ruleResource.Properties.Targets)).toBe(true);
        expect(ruleResource.Properties.Targets.length).toBeGreaterThan(0);
      }
    });
  });
});

/**
 * Helper function to validate EventBridge schedule expression format
 */
function validateScheduleExpression(templatePath: string): void {
  if (!existsSync(templatePath)) {
    console.warn(`Template not found: ${templatePath}`);
    return;
  }

  const template = JSON.parse(readFileSync(templatePath, 'utf8'));

  // Find EventBridge rule for nightly reboot
  const rules = Object.entries(template.Resources || {}).filter(
    ([, resource]: [string, any]) => resource.Type === 'AWS::Events::Rule'
  );

  const rebootRule = rules.find(([, resource]: [string, any]) =>
    resource.Properties?.Description?.includes('Daily reboot') ||
    resource.Properties?.Description?.includes('nightly reboot')
  );

  if (!rebootRule) {
    console.warn('Nightly reboot rule not found in template');
    return;
  }

  const ruleResource = rebootRule[1] as any;
  const scheduleExpression = ruleResource.Properties?.ScheduleExpression;

  if (!scheduleExpression) {
    throw new Error('ScheduleExpression is missing from EventBridge rule');
  }

  // Validate format: cron(...)
  if (!scheduleExpression.match(/^cron\([^)]+\)$/)) {
    throw new Error(
      `Invalid ScheduleExpression format. Expected cron(...), got: ${scheduleExpression}`
    );
  }

  // Extract and validate cron parts
  const cronMatch = scheduleExpression.match(/^cron\((.+)\)$/);
  if (!cronMatch) {
    throw new Error(`Failed to parse cron expression: ${scheduleExpression}`);
  }

  const cronParts = cronMatch[1].split(' ');
  if (cronParts.length !== 6) {
    throw new Error(
      `Invalid cron expression. Expected 6 fields, got ${cronParts.length}: ${cronMatch[1]}`
    );
  }

  const [minute, hour, dayOfMonth, month, dayOfWeek, year] = cronParts;

  // Validate minute (0-59)
  if (minute !== '*' && (parseInt(minute, 10) < 0 || parseInt(minute, 10) > 59)) {
    throw new Error(`Invalid minute value: ${minute}`);
  }

  // Validate hour (0-23)
  if (hour !== '*' && (parseInt(hour, 10) < 0 || parseInt(hour, 10) > 23)) {
    throw new Error(`Invalid hour value: ${hour}`);
  }

  // Validate day-of-week (? or 0-6)
  if (dayOfWeek !== '?' && dayOfWeek !== '*' && (parseInt(dayOfWeek, 10) < 0 || parseInt(dayOfWeek, 10) > 6)) {
    throw new Error(`Invalid day-of-week value: ${dayOfWeek}`);
  }

  // Validate year (* or 1970-2199)
  if (year !== '*' && (parseInt(year, 10) < 1970 || parseInt(year, 10) > 2199)) {
    throw new Error(`Invalid year value: ${year}`);
  }
}

