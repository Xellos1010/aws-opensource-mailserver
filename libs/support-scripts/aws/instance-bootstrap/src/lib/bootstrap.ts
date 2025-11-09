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
  DescribeInstanceInformationCommand,
} from '@aws-sdk/client-ssm';
import { EC2Client, DescribeInstancesCommand } from '@aws-sdk/client-ec2';
import { fromIni } from '@aws-sdk/credential-providers';
import * as fs from 'fs';
import * as path from 'path';
import { toMailserverInstanceStackName } from '@mm/infra-naming';

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
 * Resolve target stack name from options using canonical naming
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
  return toMailserverInstanceStackName(options.domain);
}

/**
 * Describe instance stack and extract outputs
 */
async function describeInstanceStack(
  cf: CloudFormationClient,
  stackName: string,
  ec2?: EC2Client
): Promise<StackInfo> {
  let command = new DescribeStacksCommand({ StackName: stackName });
  let response;
  
  try {
    response = await retryWithBackoff(() => cf.send(command));
  } catch (error: unknown) {
    // Legacy fallback: if stack not found and legacy flag enabled, try without TLD
    const err = error as { name?: string };
    const legacyFlagEnabled =
      process.env['FEATURE_LEGACY_NAME_RESOLVE'] === '1';
    
    if (
      err?.name === 'ValidationError' &&
      legacyFlagEnabled &&
      stackName.includes('-com-mailserver-instance')
    ) {
      const fallbackStackName = stackName.replace(
        '-com-mailserver-instance',
        '-mailserver-instance'
      );
      console.warn(
        `⚠️  Stack ${stackName} not found, trying legacy fallback: ${fallbackStackName}`
      );
      command = new DescribeStacksCommand({ StackName: fallbackStackName });
      try {
        response = await retryWithBackoff(() => cf.send(command));
        // Update stackName to the actual found stack name for consistency
        stackName = fallbackStackName;
        console.warn(
          `⚠️  Found legacy stack ${fallbackStackName}. Please migrate to canonical name ${stackName}`
        );
      } catch (fallbackError) {
        throw new Error(`Stack ${stackName} or ${fallbackStackName} not found`);
      }
    } else {
      throw error;
    }
  }

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

  // InstanceId might be in InstanceId output or RestorePrefix (legacy)
  let instanceId = outputs['InstanceId'] || outputs['RestorePrefix'];
  let instanceDns = outputs['InstanceDnsName'] || outputs['InstanceDns'];
  const domainName = outputs['DomainName'];
  const keyPairId = outputs['KeyPairId'];
  const eipAllocationId = outputs['ElasticIPAllocationId'];
  const instancePublicIp = outputs['InstancePublicIp'];

  // If still no instance ID, try to get it from EC2 using public IP
  if (!instanceId && instancePublicIp && ec2) {
    const describeCommand = new DescribeInstancesCommand({
      Filters: [
        { Name: 'ip-address', Values: [instancePublicIp] },
        { Name: 'instance-state-name', Values: ['running', 'pending', 'stopped'] },
      ],
    });
    try {
      const ec2Response = await retryWithBackoff(() => ec2.send(describeCommand));
      const reservation = ec2Response.Reservations?.[0];
      instanceId = reservation?.Instances?.[0]?.InstanceId;
    } catch (ec2Error) {
      // Continue without instanceId, will fail later with better error
    }
  }

  if (!instanceId) {
    throw new Error(
      `InstanceId not found on stack ${stackName}. Available outputs: ${Object.keys(outputs).join(', ')}. Tried: InstanceId, RestorePrefix${instancePublicIp ? ', EC2 lookup by IP' : ''}`
    );
  }

  // Default instance DNS to 'box' if not found (common default)
  if (!instanceDns) {
    instanceDns = 'box';
    console.log(`⚠️  InstanceDnsName/InstanceDns not found, using default: ${instanceDns}`);
  }

  // DomainName is required - try to derive from stack name if not found
  let resolvedDomainName = domainName;
  if (!resolvedDomainName) {
    // Try to derive from stack name: emcnotary-mailserver-instance -> emcnotary.com
    // or emcnotary-com-mailserver-instance -> emcnotary.com
    const stackNameMatch = stackName.match(/^([a-z0-9-]+)-mailserver-instance$/);
    if (stackNameMatch) {
      const domainPart = stackNameMatch[1].replace(/-/g, '.');
      // If it doesn't end with a TLD, assume .com
      if (!domainPart.match(/\.[a-z]{2,}$/)) {
        resolvedDomainName = `${domainPart}.com`;
      } else {
        resolvedDomainName = domainPart;
      }
      console.log(`⚠️  DomainName not found, derived from stack name: ${resolvedDomainName}`);
    } else {
      throw new Error(
        `DomainName output not found on stack ${stackName} and could not derive from stack name`
      );
    }
  }

  return {
    instanceId,
    instanceDns,
    domainName: resolvedDomainName,
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
 * Check SSM agent status
 */
async function checkSsmAgentStatus(
  ssm: SSMClient,
  instanceId: string
): Promise<{ online: boolean; pingStatus?: string; error?: string }> {
  try {
    const describeCommand = new DescribeInstanceInformationCommand({
      Filters: [
        { Key: 'InstanceIds', Values: [instanceId] },
      ],
    });
    
    const ssmInfo = await ssm.send(describeCommand);
    const instanceInfo = ssmInfo.InstanceInformationList?.[0];
    
    if (instanceInfo) {
      return {
        online: instanceInfo.PingStatus === 'Online',
        pingStatus: instanceInfo.PingStatus,
      };
    }
    
    return { online: false, error: 'Instance not found in SSM' };
  } catch (error: unknown) {
    const err = error as { name?: string; message?: string };
    return {
      online: false,
      error: err?.message || String(error),
    };
  }
}

/**
 * Install and start SSM agent via SSH
 */
async function installSsmAgentViaSsh(
  instanceId: string,
  instanceIp: string,
  keyPath?: string
): Promise<void> {
  console.log(`\n🔧 Attempting to install SSM agent via SSH...`);
  
  // This would require SSH access - for now, we'll provide instructions
  // In a full implementation, this would use SSH to run commands
  throw new Error(
    `SSM agent is not available. Please install it manually via SSH:\n` +
    `  ssh -i ${keyPath || '<key-file>'} ubuntu@${instanceIp}\n` +
    `  sudo snap install amazon-ssm-agent --classic\n` +
    `  sudo systemctl enable amazon-ssm-agent\n` +
    `  sudo systemctl start amazon-ssm-agent\n` +
    `Or ensure the instance has the AmazonSSMManagedInstanceCore IAM policy attached.`
  );
}

/**
 * Verify instance is running and accessible via SSM
 */
async function verifyInstance(
  ec2: EC2Client,
  ssm: SSMClient,
  instanceId: string,
  options?: { installIfMissing?: boolean; instanceIp?: string; keyPath?: string }
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

  // Check SSM agent status
  console.log(`⏳ Checking SSM agent status on instance ${instanceId}...`);
  const maxWaitTime = 300000; // 5 minutes max
  const checkInterval = 10000; // Check every 10 seconds
  const startTime = Date.now();
  let lastStatus: { online: boolean; pingStatus?: string; error?: string } | undefined;
  
  while (Date.now() - startTime < maxWaitTime) {
    lastStatus = await checkSsmAgentStatus(ssm, instanceId);
    
    if (lastStatus.online) {
      console.log(`\n✅ SSM agent is ready on instance ${instanceId} (PingStatus: ${lastStatus.pingStatus})`);
      return;
    }
    
    // If not online yet, wait and retry
    await sleep(checkInterval);
    process.stdout.write('.');
  }
  
  // SSM agent is not ready after waiting
  console.log(`\n❌ SSM agent is not ready on instance ${instanceId}`);
  if (lastStatus?.pingStatus) {
    console.log(`   PingStatus: ${lastStatus.pingStatus}`);
  }
  if (lastStatus?.error) {
    console.log(`   Error: ${lastStatus.error}`);
  }
  
  // Try to install if requested
  if (options?.installIfMissing && options.instanceIp) {
    try {
      await installSsmAgentViaSsh(instanceId, options.instanceIp, options.keyPath);
    } catch (installError) {
      throw new Error(
        `SSM agent is not available and installation failed: ${installError instanceof Error ? installError.message : String(installError)}\n` +
        `Bootstrap requires SSM agent to be running. Please ensure:\n` +
        `1. Instance has AmazonSSMManagedInstanceCore IAM policy\n` +
        `2. SSM agent is installed and running on the instance\n` +
        `3. Instance can reach SSM endpoints (check security groups and VPC routing)`
      );
    }
  } else {
    throw new Error(
      `SSM agent is not ready on instance ${instanceId} after ${maxWaitTime / 1000} seconds.\n` +
      `Bootstrap requires SSM agent to be running. Please ensure:\n` +
      `1. Instance has AmazonSSMManagedInstanceCore IAM policy\n` +
      `2. SSM agent is installed and running on the instance\n` +
      `3. Instance can reach SSM endpoints (check security groups and VPC routing)\n` +
      `Current status: ${lastStatus?.pingStatus || 'Unknown'}`
    );
  }
}

/**
 * Load MIAB bootstrap script from assets
 */
function loadMiabScript(): string {
  // Try multiple possible paths (source and built locations)
  const possiblePaths = [
    path.join(__dirname, '../assets/miab-setup.sh'), // Built location
    path.join(__dirname, '../../../assets/miab-setup.sh'), // Alternative built location
    path.join(process.cwd(), 'libs/support-scripts/aws/instance-bootstrap/assets/miab-setup.sh'), // Source location
    path.join(process.cwd(), 'dist/libs/support-scripts/aws/instance-bootstrap/assets/miab-setup.sh'), // Built from workspace root
  ];

  for (const scriptPath of possiblePaths) {
    if (fs.existsSync(scriptPath)) {
      return fs.readFileSync(scriptPath, 'utf8');
    }
  }

  throw new Error(
    `MIAB setup script not found. Tried: ${possiblePaths.join(', ')}. Ensure assets are included in build.`
  );
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

  // Create AWS clients (needed for dry-run validation)
  const { cf, ssm, ec2 } = createClients(region, options.profile);

  // Early dry-run check - validate but don't execute
  if (options.dryRun) {
    console.log('\n🔍 DRY RUN MODE - Validating bootstrap prerequisites:\n');
    console.log(`  Stack: ${stackName}`);
    console.log(`  Region: ${region}`);
    console.log(`  Domain: ${options.domain || 'N/A'}`);
    console.log(`  Profile: ${options.profile || 'default'}`);
    
    try {
      // Describe instance stack
      console.log('\n📋 Step 1: Describing CloudFormation stack...');
      const stackInfo = await describeInstanceStack(cf, stackName, ec2);
      console.log(`✅ Found instance: ${stackInfo.instanceId}`);
      console.log(`   Domain: ${stackInfo.domainName}`);
      console.log(`   DNS: ${stackInfo.instanceDns}.${stackInfo.domainName}`);
      
      // Read core parameters
      console.log('\n📋 Step 2: Reading core parameters from SSM...');
      const coreParams = await readCoreParams(ssm, stackInfo.domainName);
      console.log(`✅ Loaded core parameters from SSM`);
      
      // Verify instance and SSM agent
      console.log('\n📋 Step 3: Verifying instance and SSM agent status...');
      const instanceIp = stackInfo.instanceDns 
        ? `${stackInfo.instanceDns}.${stackInfo.domainName}`
        : undefined;
      
      // Check SSM agent status (don't wait long in dry-run)
      const ssmStatus = await checkSsmAgentStatus(ssm, stackInfo.instanceId);
      if (ssmStatus.online) {
        console.log(`✅ SSM agent is ready (PingStatus: ${ssmStatus.pingStatus})`);
      } else {
        console.log(`❌ SSM agent is NOT ready`);
        if (ssmStatus.pingStatus) {
          console.log(`   PingStatus: ${ssmStatus.pingStatus}`);
        }
        if (ssmStatus.error) {
          console.log(`   Error: ${ssmStatus.error}`);
        }
        throw new Error(
          `SSM agent is not ready on instance ${stackInfo.instanceId}.\n` +
          `Bootstrap requires SSM agent to be running. Please ensure:\n` +
          `1. Instance has AmazonSSMManagedInstanceCore IAM policy\n` +
          `2. SSM agent is installed and running on the instance\n` +
          `3. Instance can reach SSM endpoints (check security groups and VPC routing)`
        );
      }
      
      // Test SSH connectivity as part of dry-run (optional)
      console.log('\n📋 Step 4: Testing SSH connectivity (optional, for troubleshooting)...');
      try {
        const { spawn } = await import('child_process');
        const domain = options.domain || 'emcnotary.com';
        const profile = options.profile || process.env.AWS_PROFILE || 'hepe-admin-mfa';
        
        const sshTestProcess = spawn('pnpm', [
          'nx',
          'run',
          'cdk-emcnotary-instance:admin:ssh:test',
        ], {
          env: {
            ...process.env,
            AWS_PROFILE: profile,
            AWS_REGION: region,
            DOMAIN: domain,
            APP_PATH: 'apps/cdk-emc-notary/instance',
          },
          stdio: ['ignore', 'pipe', 'pipe'],
        });
        
        let stdout = '';
        let stderr = '';
        
        sshTestProcess.stdout?.on('data', (data) => {
          stdout += data.toString();
        });
        
        sshTestProcess.stderr?.on('data', (data) => {
          stderr += data.toString();
        });
        
        const exitCode = await new Promise<number>((resolve) => {
          sshTestProcess.on('close', resolve);
        });
        
        if (exitCode === 0) {
          console.log('✅ SSH test passed');
        } else {
          console.log(`⚠️  SSH test failed (exit code: ${exitCode})`);
          console.log('   Note: Bootstrap uses SSM, SSH is optional for troubleshooting');
        }
      } catch (error: unknown) {
        const err = error as { message?: string };
        console.log(`⚠️  SSH test error: ${err?.message || String(error)}`);
        console.log('   Note: Bootstrap uses SSM, SSH is optional for troubleshooting');
      }
      
      console.log('\n✅ Dry run validation complete - all prerequisites met');
      console.log('   Bootstrap is ready to execute (use without --dry-run to proceed)');
    } catch (error: unknown) {
      const err = error as { message?: string };
      console.error('\n❌ Dry run validation failed:');
      console.error(`   ${err?.message || String(error)}`);
      throw error;
    }
    return;
  }

  // Describe instance stack (non-dry-run execution)
  const stackInfo = await describeInstanceStack(cf, stackName, ec2);
  console.log(`✅ Found instance: ${stackInfo.instanceId}`);
  console.log(`   Domain: ${stackInfo.domainName}`);
  console.log(`   DNS: ${stackInfo.instanceDns}.${stackInfo.domainName}`);

  // Read core parameters
  const coreParams = await readCoreParams(
    ssm,
    stackInfo.domainName
  );
  console.log(`✅ Loaded core parameters from SSM`);

  // Verify instance is running and SSM agent is ready
  // Get instance IP for potential SSH-based SSM agent installation
  const describeCommand = new DescribeInstancesCommand({
    InstanceIds: [stackInfo.instanceId],
  });
  const instanceResponse = await retryWithBackoff(() => ec2.send(describeCommand));
  const instance = instanceResponse.Reservations?.[0]?.Instances?.[0];
  const instanceIp = instance?.PublicIpAddress || instance?.PrivateIpAddress;
  
  await verifyInstance(ec2, ssm, stackInfo.instanceId, {
    installIfMissing: false, // Don't auto-install, fail with clear error instead
    instanceIp,
  });
  console.log(`✅ Instance ${stackInfo.instanceId} is running and SSM agent is ready`);

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
