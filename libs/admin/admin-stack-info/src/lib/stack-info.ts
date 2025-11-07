import {
  CloudFormationClient,
  DescribeStacksCommand,
} from '@aws-sdk/client-cloudformation';
import { SSMClient, GetParameterCommand } from '@aws-sdk/client-ssm';
import { EC2Client, DescribeInstancesCommand } from '@aws-sdk/client-ec2';
import { fromIni } from '@aws-sdk/credential-providers';

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
 * - "emcnotary-com-mailserver" -> "emcnotary.com"
 */
export function resolveDomain(
  appPath?: string,
  stackName?: string
): string | null {
  if (appPath) {
    // Extract domain from app path: "apps/cdk-emc-notary" -> "emcnotary"
    const parts = appPath.split('/');
    const appName = parts[parts.length - 1];
    
    // Remove "cdk-" prefix if present
    const domainPart = appName.replace(/^cdk-/, '');
    
    // Convert kebab-case to domain: "emc-notary" -> "emcnotary.com"
    // Domain mapping for known apps
    const domainMap: Record<string, string> = {
      'emc-notary': 'emcnotary.com',
      'emcnotary': 'emcnotary.com',
      'askdaokapra': 'askdaokapra.com',
    };
    
    return domainMap[domainPart] || `${domainPart.replace(/-/g, '')}.com`;
  }
  
  if (stackName) {
    // "emcnotary-com-mailserver" -> "emcnotary.com"
    const withoutSuffix = stackName.replace(/-mailserver$/, '');
    return withoutSuffix.replace(/-/g, '.');
  }
  
  return null;
}

/**
 * Resolves stack name from domain or app path
 * Examples:
 * - "emcnotary.com" -> "emcnotary-com-mailserver"
 * - "apps/cdk-emc-notary" -> "emcnotary-com-mailserver"
 */
export function resolveStackName(
  domain?: string,
  appPath?: string,
  explicitStackName?: string
): string {
  if (explicitStackName) {
    return explicitStackName;
  }
  
  if (domain) {
    return `${domain.replace(/\./g, '-')}-mailserver`;
  }
  
  const resolvedDomain = resolveDomain(appPath);
  if (resolvedDomain) {
    return `${resolvedDomain.replace(/\./g, '-')}-mailserver`;
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
  const domain =
    config.domain ||
    resolveDomain(config.appPath, config.stackName) ||
    'emcnotary.com'; // default fallback
  
  const stackName = resolveStackName(
    config.domain,
    config.appPath,
    config.stackName
  );
  
  // Create AWS clients
  const credentials = fromIni({ profile });
  const cfClient = new CloudFormationClient({ region, credentials });
  const ssmClient = new SSMClient({ region, credentials });
  const ec2Client = new EC2Client({ region, credentials });
  
  // Get stack outputs
  const stackResp = await cfClient.send(
    new DescribeStacksCommand({ StackName: stackName })
  );
  
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

