import { execSync } from 'child_process';
import { readFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';

describe('CDK Synthesis E2E', () => {
  const cdkOutDir = join(process.cwd(), 'dist/apps/cdk-emc-notary/core/cdk.out');
  const testStackName = 'emcnotary-com-mailserver-core';

  beforeAll(() => {
    // Ensure directories exist
    try {
      mkdirSync(join(process.cwd(), 'dist/apps/cdk-emc-notary/core'), {
        recursive: true,
      });
    } catch (error) {
      // Directory might already exist
    }

    // Build the project
    try {
      execSync('pnpm nx build cdk-emcnotary-core', {
        stdio: 'pipe',
        cwd: process.cwd(),
      });
    } catch (error) {
      // Build might have already run
    }
  });

  it('generates valid CloudFormation templates', () => {
    // Generate CloudFormation templates
    execSync('pnpm nx run cdk-emcnotary-core:synth', {
      stdio: 'pipe',
      cwd: process.cwd(),
      env: {
        ...process.env,
        FEATURE_CDK_EMCNOTARY_STACKS_ENABLED: '1',
      },
    });

    const templatePath = join(cdkOutDir, `${testStackName}.template.json`);

    expect(existsSync(templatePath)).toBe(true);

    const template = JSON.parse(readFileSync(templatePath, 'utf8'));

    // Validate required resources exist
    expect(template.Resources).toHaveProperty('SesIdentity3ED17C37');
    expect(template.Resources).toHaveProperty('BackupBucket26B8E51C');
    expect(template.Resources).toHaveProperty('NextcloudBucket8B0187A4');
    expect(template.Resources).toHaveProperty('AlertTopic2720D535');
    expect(template.Resources).toHaveProperty('ElasticIP');
    expect(template.Resources).toHaveProperty('SyslogGroup7A1B8A6E');
  });

  it('all required outputs are present', () => {
    const templatePath = join(cdkOutDir, `${testStackName}.template.json`);

    if (!existsSync(templatePath)) {
      // Generate template if it doesn't exist
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

    const outputs = template.Outputs || {};
    const requiredOutputs = [
      'DomainNameOutput',
      'SesIdentityArn',
      'BackupBucketName',
      'AlertTopicArn',
      'DkimDNSTokenName1',
      'DkimDNSTokenValue1',
      'DkimDNSTokenName2',
      'DkimDNSTokenValue2',
      'DkimDNSTokenName3',
      'DkimDNSTokenValue3',
      'MailFromDomain',
      'MailFromMXRecord',
      'MailFromTXTRecord',
      'ElasticIPAddress',
      'ElasticIPAllocationId',
    ];

    requiredOutputs.forEach((outputName) => {
      expect(outputs).toHaveProperty(outputName);
      expect(outputs[outputName]).toHaveProperty('Description');
      expect(outputs[outputName]).toHaveProperty('Value');
    });
  });

  it('template has valid CloudFormation structure', () => {
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

    // Validate CloudFormation template structure
    expect(template).toHaveProperty('AWSTemplateFormatVersion');
    expect(template).toHaveProperty('Description');
    expect(template).toHaveProperty('Parameters');
    expect(template).toHaveProperty('Resources');
    expect(template).toHaveProperty('Outputs');
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
    // Log Group, 2 Lambdas, multiple IAM roles/policies, SSM params, custom resources
    const resourceCount = Object.keys(template.Resources || {}).length;
    expect(resourceCount).toBeGreaterThan(15);
  });

  it('template parameters have correct types and defaults', () => {
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

    expect(template.Parameters).toHaveProperty('DomainName');
    expect(template.Parameters.DomainName).toHaveProperty('Type', 'String');
    expect(template.Parameters.DomainName).toHaveProperty('Default', 'emcnotary.com');
    expect(template.Parameters.DomainName).toHaveProperty('AllowedPattern');
  });
});

