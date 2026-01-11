import { CloudFormationClient, DescribeStacksCommand } from '@aws-sdk/client-cloudformation';
import { EC2Client, DescribeInstancesCommand } from '@aws-sdk/client-ec2';
import { SSMClient, GetParameterCommand } from '@aws-sdk/client-ssm';
import { execSync } from 'child_process';
import { existsSync, mkdirSync, chmodSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import { resolveStackName } from '@mm/admin-stack-info';

const log = (
  level: 'info' | 'warn' | 'error',
  msg: string,
  meta: Record<string, unknown> = {}
) =>
  console.log(
    JSON.stringify({ ts: new Date().toISOString(), level, msg, ...meta })
  );

export type SetupSshAccessConfig = {
  domain?: string;
  appPath?: string;
  region?: string;
  profile?: string;
  stackName?: string; // Auto-generated if not provided
};

export type SshAccessResult = {
  success: boolean;
  host?: string;
  keyPath?: string;
  instanceId?: string;
  instanceIp?: string;
  error?: string;
};

/**
 * Sets up SSH access for a mailserver instance
 * Ports logic from archive/administration/setup-ssh-access.sh
 */
export async function setupSshAccess(
  config: SetupSshAccessConfig
): Promise<SshAccessResult> {
  const region = config.region || process.env['AWS_REGION'] || 'us-east-1';
  const profile = config.profile || process.env['AWS_PROFILE'] || 'hepe-admin-mfa';
  const domain = config.domain;
  const appPath = config.appPath || process.env['APP_PATH'];
  
  if (!config.stackName && !domain && !appPath) {
    const error = 'Cannot resolve stack name. Provide stackName, domain, or appPath';
    log('error', error);
    return { success: false, error };
  }
  
  const stackName = config.stackName || resolveStackName(domain, appPath, undefined, 'instance');

  log('info', 'Setting up SSH access', {
    domain,
    stackName,
    region,
    profile,
  });

  const cfClient = new CloudFormationClient({ region });
  const ec2Client = new EC2Client({ region });
  const ssmClient = new SSMClient({ region });

  try {
    // Get stack outputs
    const stackResp = await cfClient.send(
      new DescribeStacksCommand({
        StackName: stackName,
      })
    );

    const stack = stackResp.Stacks?.[0];
    if (!stack?.Outputs) {
      const error = `Could not retrieve stack outputs for ${stackName}`;
      log('error', error);
      return { success: false, error };
    }

    // Extract outputs
    const outputs = stack.Outputs.reduce((acc, output) => {
      acc[output.OutputKey!] = output.OutputValue!;
      return acc;
    }, {} as Record<string, string>);

    const keyPairId = outputs['KeyPairId'];
    const instanceId = outputs['RestorePrefix']; // This is actually the instance ID
    const instanceIp = outputs['PublicIp'] || outputs['ElasticIPAddress'];

    if (!keyPairId || !instanceId) {
      const error = 'Missing required outputs: KeyPairId or RestorePrefix (InstanceId)';
      log('error', error);
      return { success: false, error };
    }

    // Get instance details if IP not in outputs
    let finalInstanceIp = instanceIp;
    if (!finalInstanceIp) {
      const instanceResp = await ec2Client.send(
        new DescribeInstancesCommand({
          InstanceIds: [instanceId],
        })
      );

      const instance = instanceResp.Reservations?.[0]?.Instances?.[0];
      finalInstanceIp = instance?.PublicIpAddress;
    }

    if (!finalInstanceIp) {
      const error = 'Could not determine instance public IP';
      log('error', error);
      return { success: false, error };
    }

    // Get instance key name
    const instanceResp = await ec2Client.send(
      new DescribeInstancesCommand({
        InstanceIds: [instanceId],
      })
    );

    const instance = instanceResp.Reservations?.[0]?.Instances?.[0];
    const keyName = instance?.KeyName;

    if (!keyName) {
      const error = 'Could not determine instance key pair name';
      log('error', error);
      return { success: false, error };
    }

    log('info', 'Found instance details', {
      instanceId,
      instanceIp: finalInstanceIp,
      keyName,
      keyPairId,
    });

    // Ensure SSH directory exists
    const sshDir = join(homedir(), '.ssh');
    if (!existsSync(sshDir)) {
      mkdirSync(sshDir, { recursive: true });
    }

    // Check if key file exists, retrieve from SSM if needed
    const keyFile = join(sshDir, `${keyName}.pem`);

    if (!existsSync(keyFile)) {
      log('info', 'Retrieving private key from SSM', { keyPairId });

      const ssmResp = await ssmClient.send(
        new GetParameterCommand({
          Name: `/ec2/keypair/${keyPairId}`,
          WithDecryption: true,
        })
      );

      const privateKey = ssmResp.Parameter?.Value;
      if (!privateKey) {
        const error = 'Could not retrieve private key from SSM';
        log('error', error);
        return { success: false, error };
      }

      // Write key file
      execSync(`echo "${privateKey}" > "${keyFile}"`, { stdio: 'inherit' });

      log('info', 'Private key saved', { keyFile });
    }

    // Set correct permissions
    chmodSync(keyFile, 0o400);

    // Verify key format
    try {
      execSync(`ssh-keygen -l -f "${keyFile}" > /dev/null 2>&1`, { stdio: 'inherit' });
    } catch (error) {
      const err = `Key file is not in valid format: ${String(error)}`;
      log('error', err);
      return { success: false, error: err };
    }

    // Add to known_hosts if not present
    const knownHostsFile = join(sshDir, 'known_hosts');
    try {
      execSync(`ssh-keyscan -H "${finalInstanceIp}" >> "${knownHostsFile}" 2>/dev/null || true`, {
        stdio: 'inherit'
      });
    } catch (error) {
      log('warn', 'Could not update known_hosts', { error: String(error) });
    }

    log('info', 'SSH access setup complete', {
      host: `ubuntu@${finalInstanceIp}`,
      keyPath: keyFile,
    });

    return {
      success: true,
      host: `ubuntu@${finalInstanceIp}`,
      keyPath: keyFile,
      instanceId,
      instanceIp: finalInstanceIp,
    };

  } catch (error) {
    const err = `SSH setup failed: ${String(error)}`;
    log('error', err, { error });
    return { success: false, error: err };
  }
}