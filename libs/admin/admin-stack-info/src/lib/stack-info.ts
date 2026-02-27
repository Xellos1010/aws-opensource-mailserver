import {
  CloudFormationClient,
  DescribeStacksCommand,
} from '@aws-sdk/client-cloudformation';
import { SSMClient, GetParameterCommand } from '@aws-sdk/client-ssm';
import { EC2Client, DescribeInstancesCommand } from '@aws-sdk/client-ec2';
import { fromIni } from '@aws-sdk/credential-providers';
import {
  toMailserverCoreStackName,
  toMailserverInstanceStackName,
  toMailserverObservabilityMaintenanceStackName,
  parseDomainFromMailserverStack,
} from '@mm/infra-naming';

export type StackOutputs = {
  InstancePublicIp?: string;
  AdminPassword?: string;
  KeyPairId?: string;
  RestorePrefix?: string; // Actually the InstanceId
  InstanceId?: string;
  HostedZoneId?: string;
  DkimDNSTokenName1?: string;
  DkimDNSTokenValue1?: string;
  DkimDNSTokenName2?: string;
  DkimDNSTokenValue2?: string;
  DkimDNSTokenName3?: string;
  DkimDNSTokenValue3?: string;
  MailFromDomain?: string;
  MailFromMXRecord?: string;
  MailFromTXTRecord?: string;
  BackupS3Bucket?: string;
  [key: string]: string | undefined;
};

export type StackInfo = {
  stackName: string;
  domain: string;
  region: string;
  outputs: StackOutputs;
  instanceId?: string;
  instancePublicIp?: string;
  instanceKeyName?: string;
  keyPairId?: string;
  adminPassword?: string;
  hostedZoneId?: string;
};

export type StackInfoConfig = {
  stackName?: string;
  domain?: string;
  appPath?: string; // e.g., "apps/cdk-emc-notary"
  region?: string;
  profile?: string;
};

/**
 * Resolves domain name from app path or stack name
 * Examples:
 * - "apps/cdk-emc-notary" -> "emcnotary.com"
 * - "cdk-emc-notary" -> "emcnotary.com"
 * - "emcnotary-com-mailserver-core" -> "emcnotary.com"
 * 
 * @deprecated Prefer using parseDomainFromMailserverStack for canonical stack names
 */
export function resolveDomain(
  appPath?: string,
  stackName?: string
): string | null {
  if (appPath) {
    // Extract domain from app path: 
    // "apps/cdk-emc-notary/core" -> "emcnotary"
    // "apps/cdk-emc-notary/instance" -> "emcnotary"
    // "apps/cdk-emc-notary" -> "emcnotary"
    const parts = appPath.split('/');
    // Get the app directory name (second-to-last if last is 'core' or 'instance')
    let appName = parts[parts.length - 1];
    
    // If last part is a stack type folder, use the parent app directory.
    if (
      appName === 'core' ||
      appName === 'instance' ||
      appName === 'observability-maintenance'
    ) {
      appName = parts[parts.length - 2] || appName;
    }
    
    // Remove "cdk-" prefix if present
    let domainPart = appName.replace(/^cdk-/, '');
    
    // Remove stack-type suffixes if present.
    domainPart = domainPart.replace(/-core$/, '');
    domainPart = domainPart.replace(/-instance$/, '');
    domainPart = domainPart.replace(/-observability-maintenance$/, '');
    
    // Convert kebab-case to domain: "emc-notary" -> "emcnotary.com"
    // Domain mapping for known apps
    const domainMap: Record<string, string> = {
      'emc-notary': 'emcnotary.com',
      'emcnotary': 'emcnotary.com',
      'askdaokapra': 'askdaokapra.com',
      'k3frame': 'k3frame.com',
      'k3-frame': 'k3frame.com',
    };

    return domainMap[domainPart] || `${domainPart.replace(/-/g, '')}.com`;
  }
  
  if (stackName) {
    // Try parsing as canonical stack name first
    try {
      return parseDomainFromMailserverStack(stackName);
    } catch {
      // Fallback to legacy parsing for non-canonical names
      // "emcnotary-com-mailserver" or "emcnotary-com-mailserver-core" -> "emcnotary.com"
      const withoutSuffix = stackName.replace(
        /-mailserver(-core|-instance|-observability-maintenance)?$/,
        ''
      );
      return withoutSuffix.replace(/-/g, '.');
    }
  }
  
  return null;
}

/**
 * Resolves stack name from domain or app path
 * Examples:
 * - "emcnotary.com" + "core" -> "emcnotary-com-mailserver-core"
 * - "emcnotary.com" + "instance" -> "emcnotary-com-mailserver-instance"
 * - "apps/cdk-emc-notary/core" -> "emcnotary-com-mailserver-core"
 * 
 * @param domain - Domain name (e.g., "emcnotary.com")
 * @param appPath - App path (e.g., "apps/cdk-emc-notary/core")
 * @param explicitStackName - Explicit stack name (takes precedence)
 * @param stackType - Stack type: "core" | "instance" | "observability-maintenance" | undefined (auto-detect from appPath)
 */
export function resolveStackName(
  domain?: string,
  appPath?: string,
  explicitStackName?: string,
  stackType?: 'core' | 'instance' | 'observability-maintenance'
): string {
  if (explicitStackName) {
    return explicitStackName;
  }
  
  // Auto-detect stack type from appPath if not provided
  if (!stackType && appPath) {
    const pathParts = appPath.split('/');
    const lastPart = pathParts[pathParts.length - 1] || '';
    if (lastPart === 'core' || lastPart.includes('-core')) {
      stackType = 'core';
    } else if (
      lastPart === 'observability-maintenance' ||
      lastPart.includes('-observability-maintenance')
    ) {
      stackType = 'observability-maintenance';
    } else if (lastPart === 'instance' || lastPart.includes('-instance')) {
      stackType = 'instance';
    }
  }
  
  if (domain) {
    if (stackType === 'core') {
      return toMailserverCoreStackName(domain);
    } else if (stackType === 'observability-maintenance') {
      return toMailserverObservabilityMaintenanceStackName(domain);
    } else if (stackType === 'instance') {
      return toMailserverInstanceStackName(domain);
    }
    // Legacy: default to instance if type not specified
    return toMailserverInstanceStackName(domain);
  }
  
  const resolvedDomain = resolveDomain(appPath);
  if (resolvedDomain) {
    if (stackType === 'core') {
      return toMailserverCoreStackName(resolvedDomain);
    } else if (stackType === 'observability-maintenance') {
      return toMailserverObservabilityMaintenanceStackName(resolvedDomain);
    } else if (stackType === 'instance') {
      return toMailserverInstanceStackName(resolvedDomain);
    }
    // Legacy: default to instance if type not specified
    return toMailserverInstanceStackName(resolvedDomain);
  }
  
  throw new Error(
    'Cannot resolve stack name. Provide domain, appPath, or explicit stackName'
  );
}

/**
 * Gets CloudFormation stack information
 */
export async function getStackInfo(
  config: StackInfoConfig
): Promise<StackInfo> {
  const region = config.region || process.env['AWS_REGION'] || 'us-east-1';
  const profile = config.profile || process.env['AWS_PROFILE'] || 'hepe-admin-mfa';
  
  // Resolve domain and stack name
  let domain =
    config.domain ||
    resolveDomain(config.appPath, config.stackName);
  
  if (!domain && !config.stackName) {
    throw new Error(
      'Cannot resolve domain or stack name. Provide domain, appPath, or explicit stackName'
    );
  }
  
  // Determine stack type from appPath or stackName
  let stackType: 'core' | 'instance' | 'observability-maintenance' | undefined;
  if (config.appPath) {
    const pathParts = config.appPath.split('/');
    const lastPart = pathParts[pathParts.length - 1] || '';
    if (lastPart === 'core' || lastPart.includes('-core')) {
      stackType = 'core';
    } else if (
      lastPart === 'observability-maintenance' ||
      lastPart.includes('-observability-maintenance')
    ) {
      stackType = 'observability-maintenance';
    } else if (lastPart === 'instance' || lastPart.includes('-instance')) {
      stackType = 'instance';
    }
  } else if (config.stackName) {
    if (config.stackName.includes('-mailserver-core')) {
      stackType = 'core';
    } else if (config.stackName.includes('-mailserver-observability-maintenance')) {
      stackType = 'observability-maintenance';
    } else if (config.stackName.includes('-mailserver-instance')) {
      stackType = 'instance';
    }
  }
  
  let stackName = resolveStackName(
    config.domain,
    config.appPath,
    config.stackName,
    stackType
  );
  
  // Ensure domain is resolved from stack name if not already resolved
  if (!domain && stackName) {
    domain = resolveDomain(undefined, stackName);
  }
  
  if (!domain) {
    throw new Error(
      `Cannot resolve domain from stack name ${stackName}. Provide domain explicitly.`
    );
  }
  
  // Create AWS clients
  const credentials = fromIni({ profile });
  const cfClient = new CloudFormationClient({ region, credentials });
  const ssmClient = new SSMClient({ region, credentials });
  const ec2Client = new EC2Client({ region, credentials });
  
  // Get stack outputs - try the resolved stack name first
  let stackResp;
  try {
    stackResp = await cfClient.send(
      new DescribeStacksCommand({ StackName: stackName })
    );
  } catch (err: unknown) {
    // Legacy fallback: if stack not found and legacy flag enabled, try without TLD
    const error = err as { name?: string };
    const legacyFlagEnabled =
      process.env['FEATURE_LEGACY_NAME_RESOLVE'] === '1';
    
    if (
      error?.name === 'ValidationError' &&
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
      try {
        stackResp = await cfClient.send(
          new DescribeStacksCommand({ StackName: fallbackStackName })
        );
        // Update stackName to the actual found stack name
        stackName = fallbackStackName;
        const canonicalName = domain ? toMailserverInstanceStackName(domain) : 'canonical stack name';
        console.warn(
          `⚠️  Found legacy stack ${fallbackStackName}. Please migrate to canonical name ${canonicalName}`
        );
      } catch (fallbackErr) {
        throw new Error(
          `Stack ${stackName} or ${fallbackStackName} not found`
        );
      }
    } else {
      throw err;
    }
  }
  
  if (!stackResp.Stacks || stackResp.Stacks.length === 0) {
    throw new Error(`Stack ${stackName} not found`);
  }
  
  const stack = stackResp.Stacks[0];
  const outputs: StackOutputs = {};
  
  // Parse outputs into a map
  if (stack.Outputs) {
    for (const output of stack.Outputs) {
      if (output.OutputKey && output.OutputValue) {
        outputs[output.OutputKey] = output.OutputValue;
      }
    }
  }
  
  // Get instance ID (from RestorePrefix output or InstanceId)
  const instanceId =
    outputs.RestorePrefix || outputs.InstanceId || outputs.InstancePublicIp;
  
  // Get instance details if not in outputs
  let instancePublicIp = outputs.InstancePublicIp;
  let instanceKeyName: string | undefined;
  
  // Try to get instance details by instance ID first
  if (instanceId && instanceId.startsWith('i-')) {
    try {
      const instancesResp = await ec2Client.send(
        new DescribeInstancesCommand({
          InstanceIds: [instanceId],
        })
      );
      
      const instance = instancesResp.Reservations?.[0]?.Instances?.[0];
      if (instance) {
        if (!instancePublicIp && instance.PublicIpAddress) {
          instancePublicIp = instance.PublicIpAddress;
        }
        if (instance.KeyName) {
          instanceKeyName = instance.KeyName;
        }
      }
    } catch (err) {
      // Instance might not exist, try finding by stack tag
    }
  }
  
  // If we still don't have key name or IP, try finding instance by stack tag
  if ((!instanceKeyName || !instancePublicIp) && stackName) {
    try {
      const instancesResp = await ec2Client.send(
        new DescribeInstancesCommand({
          Filters: [
            {
              Name: 'tag:aws:cloudformation:stack-name',
              Values: [stackName],
            },
            {
              Name: 'instance-state-name',
              Values: ['running', 'stopped'],
            },
          ],
        })
      );
      
      const instance = instancesResp.Reservations?.[0]?.Instances?.[0];
      if (instance) {
        if (!instancePublicIp && instance.PublicIpAddress) {
          instancePublicIp = instance.PublicIpAddress;
        }
        if (!instanceKeyName && instance.KeyName) {
          instanceKeyName = instance.KeyName;
        }
      }
    } catch (err) {
      // Ignore errors - instance might not exist or IP might not be available
    }
  }
  
  // Get admin password from SSM if not in outputs
  let adminPassword = outputs.AdminPassword;
  
  // If AdminPassword output is just the parameter name, fetch the actual value
  if (adminPassword && adminPassword.startsWith('/MailInABoxAdminPassword-')) {
    try {
      const ssmResp = await ssmClient.send(
        new GetParameterCommand({
          Name: adminPassword,
          WithDecryption: true,
        })
      );
      adminPassword = ssmResp.Parameter?.Value;
    } catch (err) {
      // Ignore errors - try fallback
    }
  }
  
  // If still no password, try fetching from SSM using stack name
  if (!adminPassword) {
    try {
      const ssmParamName = `/MailInABoxAdminPassword-${stackName}`;
      const ssmResp = await ssmClient.send(
        new GetParameterCommand({
          Name: ssmParamName,
          WithDecryption: true,
        })
      );
      adminPassword = ssmResp.Parameter?.Value;
    } catch (err) {
      // Ignore errors - password might not be in SSM
    }
  }
  
  return {
    stackName,
    domain,
    region,
    outputs,
    instanceId,
    instancePublicIp,
    instanceKeyName,
    keyPairId: outputs.KeyPairId,
    adminPassword,
    hostedZoneId: outputs.HostedZoneId,
  };
}

/**
 * Gets stack info from app directory path
 * Example: "apps/cdk-emc-notary" -> StackInfo
 */
export async function getStackInfoFromApp(
  appPath: string,
  config?: Omit<StackInfoConfig, 'appPath'>
): Promise<StackInfo> {
  return getStackInfo({ ...config, appPath });
}
