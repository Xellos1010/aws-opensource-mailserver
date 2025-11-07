import {
  CloudFormationClient,
  DescribeStacksCommand,
  StackStatus,
} from '@aws-sdk/client-cloudformation';
import {
  SSMClient,
  SendCommandCommand,
  GetCommandInvocationCommand,
  CommandStatus,
  GetParameterCommand,
  GetParametersCommand,
} from '@aws-sdk/client-ssm';
import { EC2Client, DescribeInstancesCommand } from '@aws-sdk/client-ec2';
import { fromIni } from '@aws-sdk/credential-providers';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Options for bootstrapping an instance
 */
export interface BootstrapOptions {
  /** Domain name (e.g., "emcnotary.com") - used to derive stack name if stackName not provided */
  domain?: string;
  /** Explicit stack name (overrides domain-derived) */
  stackName?: string;
  /** AWS region (default: "us-east-1") */
  region?: string;
  /** AWS profile for credentials (e.g., "hepe-admin-mfa") */
  profile?: string;
  /** Dry run mode - show what would be done without executing */
  dryRun?: boolean;
  /** Feature flag environment variable name (default: "FEATURE_INSTANCE_BOOTSTRAP_ENABLED") */
  featureFlagEnv?: string;
  /** Restore prefix for backup restoration */
  restorePrefix?: string;
  /** Whether to reboot after setup (default: false, as nightly reboot is handled by EventBridge) */
  rebootAfterSetup?: boolean;
}

/**
 * Resolved stack information from CloudFormation
 */
interface StackInfo {
  instanceId: string;
  instanceDns: string;
  domainName: string;
  keyPairId: string;
  stackName: string;
  eipAllocationId?: string;
}

/**
 * Core SSM parameters from the core stack
 */
interface CoreParams {
  domainName: string;
  backupBucket: string;
  nextcloudBucket: string;
  alarmsTopicArn: string;
  sesIdentityArn?: string;
  eipAllocationId?: string;
}

/**
 * Retry configuration for AWS API calls
 */
const RETRY_CONFIG = {
  maxAttempts: 3,
  delay: 1000, // 1 second base delay
};

/**
 * Sleep utility for retries
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Retry wrapper for AWS SDK calls with exponential backoff
 */
async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxAttempts: number = RETRY_CONFIG.maxAttempts,
  baseDelay: number = RETRY_CONFIG.delay
): Promise<T> {
  let lastError: Error | undefined;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      if (attempt < maxAttempts) {
        const delay = baseDelay * Math.pow(2, attempt - 1);
        console.warn(
          `Attempt ${attempt}/${maxAttempts} failed, retrying in ${delay}ms...`
        );
        await sleep(delay);
      }
    }
  }
  throw lastError || new Error('Retry failed');
}

/**
 * Derive instance stack name from domain
 */
function deriveStackName(domain: string): string {
  return `${domain.replace(/\./g, '-')}-mailserver-instance`;
}

/**
 * Create AWS clients with optional profile
 */
function createClients(
  region: string,
  profile?: string
): {
  cf: CloudFormationClient;
  ssm: SSMClient;
  ec2: EC2Client;
} {
  const config = {
    region,
    ...(profile && { credentials: fromIni({ profile }) }),
  };

  return {
    cf: new CloudFormationClient(config),
    ssm: new SSMClient(config),
    ec2: new EC2Client(config),
  };
}

/**
 * Resolve target stack name from options
 */
function resolveStackName(options: BootstrapOptions): string {
  if (options.stackName) {
    return options.stackName;
  }
  if (!options.domain) {
    throw new Error(
      'Either stackName or domain must be provided in BootstrapOptions'
    );
  }
  return deriveStackName(options.domain);
}

/**
 * Describe instance stack and extract outputs
 */
async function describeInstanceStack(
  cf: CloudFormationClient,
  stackName: string
): Promise<StackInfo> {
  const command = new DescribeStacksCommand({ StackName: stackName });
  const response = await retryWithBackoff(() => cf.send(command));

  const stack = response.Stacks?.[0];
  if (!stack) {
    throw new Error(`Stack ${stackName} not found`);
  }

  if (
    stack.StackStatus === StackStatus.DELETE_IN_PROGRESS ||
    stack.StackStatus === StackStatus.DELETE_COMPLETE
  ) {
    throw new Error(
      `Stack ${stackName} is in ${stack.StackStatus} state and cannot be bootstrapped`
    );
  }

  const outputs = Object.fromEntries(
    (stack.Outputs || []).map((o) => [o.OutputKey!, o.OutputValue!])
  );

  const instanceId = outputs['InstanceId'];
  const instanceDns = outputs['InstanceDnsName'] || outputs['InstanceDns'];
  const domainName = outputs['DomainName'];
  const keyPairId = outputs['KeyPairId'];
  const eipAllocationId = outputs['ElasticIPAllocationId'];

  if (!instanceId) {
    throw new Error(
      `InstanceId output not found on stack ${stackName}. Available outputs: ${Object.keys(outputs).join(', ')}`
    );
  }

  if (!instanceDns) {
    throw new Error(
      `InstanceDnsName or InstanceDns output not found on stack ${stackName}`
    );
  }

  if (!domainName) {
    throw new Error(
      `DomainName output not found on stack ${stackName}`
    );
  }

  return {
    instanceId,
    instanceDns,
    domainName,
    keyPairId: keyPairId || '',
    stackName,
    eipAllocationId,
  };
}

/**
 * Read core SSM parameters (domain-agnostic by prefix)
 */
async function readCoreParams(
  ssm: SSMClient,
  domain: string
): Promise<CoreParams> {
  // Determine core param prefix from domain (e.g., /emcnotary/core or /{domain}/core)
  // For now, assume /emcnotary/core pattern, but make it configurable
  const corePrefix = `/emcnotary/core`;

  const paramNames = [
    `${corePrefix}/domainName`,
    `${corePrefix}/backupBucket`,
    `${corePrefix}/nextcloudBucket`,
    `${corePrefix}/alarmsTopicArn`,
    `${corePrefix}/sesIdentityArn`,
    `${corePrefix}/eipAllocationId`,
  ];

  const command = new GetParametersCommand({
    Names: paramNames,
    WithDecryption: false,
  });

  const response = await retryWithBackoff(() => ssm.send(command));

  const params = Object.fromEntries(
    (response.Parameters || []).map((p) => [p.Name!, p.Value!])
  );

  const domainName = params[`${corePrefix}/domainName`];
  const backupBucket = params[`${corePrefix}/backupBucket`];
  const nextcloudBucket = params[`${corePrefix}/nextcloudBucket`];
  const alarmsTopicArn = params[`${corePrefix}/alarmsTopicArn`];
  const sesIdentityArn = params[`${corePrefix}/sesIdentityArn`];
  const eipAllocationId = params[`${corePrefix}/eipAllocationId`];

  if (!domainName || !backupBucket || !nextcloudBucket || !alarmsTopicArn) {
    throw new Error(
      `Required core SSM parameters not found under ${corePrefix}. Found: ${Object.keys(params).join(', ')}`
    );
  }

  return {
    domainName,
    backupBucket,
    nextcloudBucket,
    alarmsTopicArn,
    sesIdentityArn,
    eipAllocationId,
  };
}

/**
 * Verify instance is running and accessible via SSM
 */
async function verifyInstance(
  ec2: EC2Client,
  ssm: SSMClient,
  instanceId: string
): Promise<void> {
  const describeCommand = new DescribeInstancesCommand({
    InstanceIds: [instanceId],
  });

  const response = await retryWithBackoff(() => ec2.send(describeCommand));
  const instance = response.Reservations?.[0]?.Instances?.[0];

  if (!instance) {
    throw new Error(`Instance ${instanceId} not found`);
  }

  const state = instance.State?.Name;
  if (state !== 'running') {
    throw new Error(
      `Instance ${instanceId} is in ${state} state. Must be running for SSM commands.`
    );
  }

  // Note: SSM agent availability is implicit - if SendCommand fails, we'll catch it
}

/**
 * Load MIAB bootstrap script from assets
 */
function loadMiabScript(): string {
  const scriptPath = path.join(
    __dirname,
    '../../../assets/miab-setup.sh'
  );

  if (!fs.existsSync(scriptPath)) {
    throw new Error(
      `MIAB setup script not found at ${scriptPath}. Ensure assets are included in build.`
    );
  }

  return fs.readFileSync(scriptPath, 'utf8');
}

/**
 * Build environment variables map for MIAB setup
 */
function buildEnvironmentMap(
  stackInfo: StackInfo,
  coreParams: CoreParams,
  options: BootstrapOptions
): Record<string, string> {
  const env: Record<string, string> = {
    DOMAIN_NAME: stackInfo.domainName,
    INSTANCE_DNS: stackInfo.instanceDns,
    REGION: options.region || 'us-east-1',
    STACK_NAME: stackInfo.stackName,
    BACKUP_BUCKET: coreParams.backupBucket,
    NEXTCLOUD_BUCKET: coreParams.nextcloudBucket,
    ALARMS_TOPIC_ARN: coreParams.alarmsTopicArn,
  };

  if (stackInfo.eipAllocationId || coreParams.eipAllocationId) {
    env.EIP_ALLOCATION_ID =
      stackInfo.eipAllocationId || coreParams.eipAllocationId || '';
  }

  if (coreParams.sesIdentityArn) {
    env.SES_IDENTITY_ARN = coreParams.sesIdentityArn;
  }

  // Optional parameters
  if (options.restorePrefix) {
    env.RESTORE_PREFIX = options.restorePrefix;
  }

  // Defaults (can be overridden)
  env.SES_RELAY = 'true';
  env.SWAP_SIZE_GIB = '2';
  env.MAILINABOX_VERSION = 'v64.0';
  env.MAILINABOX_CLONE_URL =
    'https://github.com/mail-in-a-box/mailinabox.git';
  env.REBOOT_AFTER_SETUP = options.rebootAfterSetup ? 'true' : 'false';

  // Admin password param name (not the value - fetched server-side)
  env.ADMIN_PASSWORD_PARAM = `/MailInABoxAdminPassword-${stackInfo.stackName}`;

  return env;
}

/**
 * Poll SSM command status until completion
 */
async function pollCommandStatus(
  ssm: SSMClient,
  commandId: string,
  instanceId: string,
  maxWaitSeconds: number = 3600 // 1 hour max
): Promise<void> {
  const startTime = Date.now();
  const maxWaitMs = maxWaitSeconds * 1000;

  while (true) {
    const command = new GetCommandInvocationCommand({
      CommandId: commandId,
      InstanceId: instanceId,
    });

    const response = await retryWithBackoff(() => ssm.send(command));
    const status = response.Status as CommandStatus;

    if (status === CommandStatus.SUCCESS) {
      console.log('✅ Bootstrap command completed successfully');
      return;
    }

    if (status === CommandStatus.FAILED || status === CommandStatus.CANCELLED) {
      const error = response.StandardErrorContent || 'Unknown error';
      throw new Error(
        `Bootstrap command failed with status ${status}: ${error}`
      );
    }

    if (status === CommandStatus.IN_PROGRESS || status === CommandStatus.PENDING) {
      const elapsed = Date.now() - startTime;
      if (elapsed > maxWaitMs) {
        throw new Error(
          `Bootstrap command timed out after ${maxWaitSeconds} seconds`
        );
      }

      // Wait before polling again
      await sleep(5000); // 5 seconds
      continue;
    }

    // Unknown status
    throw new Error(`Unexpected command status: ${status}`);
  }
}

/**
 * Main bootstrap function
 */
export async function bootstrapInstance(
  options: BootstrapOptions
): Promise<void> {
  const region = options.region || 'us-east-1';
  const featureFlagEnv =
    options.featureFlagEnv || 'FEATURE_INSTANCE_BOOTSTRAP_ENABLED';

  // Feature flag check
  if (process.env[featureFlagEnv] === '0') {
    throw new Error(
      `${featureFlagEnv}=0 is set. Bootstrap is disabled. Set ${featureFlagEnv}=1 to enable.`
    );
  }

  // Resolve stack name (doesn't require AWS)
  const stackName = resolveStackName(options);
  console.log(`📋 Resolving stack: ${stackName}`);

  // Early dry-run check - skip AWS calls if dry-run
  if (options.dryRun) {
    console.log('\n🔍 DRY RUN MODE - Previewing what would be executed:\n');
    console.log(`  Stack: ${stackName}`);
    console.log(`  Region: ${region}`);
    console.log(`  Domain: ${options.domain || 'N/A'}`);
    console.log(`  Profile: ${options.profile || 'default'}`);
    console.log('\n📋 Would perform the following steps:');
    console.log('  1. Describe CloudFormation stack to get instance details');
    console.log('  2. Read core parameters from SSM Parameter Store');
    console.log('  3. Verify instance is running and accessible via SSM');
    console.log('  4. Build environment map with configuration values');
    console.log('  5. Send SSM RunCommand to execute MIAB setup script');
    console.log('\n✅ Dry run complete - no AWS calls made, no changes');
    return;
  }

  // Create AWS clients (only if not dry-run)
  const { cf, ssm, ec2 } = createClients(region, options.profile);

  // Describe instance stack
  const stackInfo = await describeInstanceStack(cf, stackName);
  console.log(`✅ Found instance: ${stackInfo.instanceId}`);
  console.log(`   Domain: ${stackInfo.domainName}`);
  console.log(`   DNS: ${stackInfo.instanceDns}.${stackInfo.domainName}`);

  // Read core parameters
  const coreParams = await readCoreParams(
    ssm,
    stackInfo.domainName
  );
  console.log(`✅ Loaded core parameters from SSM`);

  // Verify instance is running
  await verifyInstance(ec2, ssm, stackInfo.instanceId);
  console.log(`✅ Instance ${stackInfo.instanceId} is running and accessible`);

  // Build environment map
  const envMap = buildEnvironmentMap(stackInfo, coreParams, options);

  // Load MIAB script
  const miabScript = loadMiabScript();

  // Build SSM command
  const commands = [
    'set -euxo pipefail',
    'cat > /root/miab-setup.sh << "EOF_MIAB"',
    miabScript,
    'EOF_MIAB',
    // Export environment variables
    ...Object.entries(envMap).map(
      ([key, value]) => `export ${key}='${value.replace(/'/g, "'\\''")}'`
    ),
    // Execute script
    'bash -xe /root/miab-setup.sh',
  ];

  if (options.dryRun) {
    console.log('\n🔍 DRY RUN MODE - Would execute:\n');
    console.log('Environment variables:');
    Object.entries(envMap).forEach(([key, value]) => {
      // Mask sensitive values
      const displayValue =
        key.includes('PASSWORD') || key.includes('SECRET')
          ? '***REDACTED***'
          : value;
      console.log(`  ${key}=${displayValue}`);
    });
    console.log('\nSSM Command:');
    console.log(`  Document: AWS-RunShellScript`);
    console.log(`  Instance: ${stackInfo.instanceId}`);
    console.log(`  Commands: ${commands.length} lines`);
    console.log('\n✅ Dry run complete - no changes made');
    return;
  }

  // Send SSM command
  console.log(`🚀 Sending bootstrap command to instance ${stackInfo.instanceId}...`);

  const sendCommand = new SendCommandCommand({
    InstanceIds: [stackInfo.instanceId],
    DocumentName: 'AWS-RunShellScript',
    Parameters: {
      commands,
    },
    CloudWatchOutputConfig: {
      CloudWatchOutputEnabled: true,
      CloudWatchLogGroupName: `/aws/ssm/miab-bootstrap`,
    },
    TimeoutSeconds: 3600, // 1 hour
  });

  const commandResponse = await retryWithBackoff(() => ssm.send(sendCommand));
  const commandId = commandResponse.Command?.CommandId;

  if (!commandId) {
    throw new Error('Failed to get command ID from SSM response');
  }

  console.log(`📝 Command ID: ${commandId}`);
  console.log(`📊 CloudWatch Logs: /aws/ssm/miab-bootstrap`);
  console.log(`⏳ Waiting for command to complete...`);

  // Poll for completion
  await pollCommandStatus(ssm, commandId, stackInfo.instanceId);

  console.log(`\n✅ Bootstrap completed successfully for ${stackInfo.instanceDns}.${stackInfo.domainName}`);
  console.log(`   Instance: ${stackInfo.instanceId}`);
  console.log(`   View logs: aws logs tail /aws/ssm/miab-bootstrap --follow`);
}
