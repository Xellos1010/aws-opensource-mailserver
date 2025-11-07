import { SSMClient, GetParameterCommand } from '@aws-sdk/client-ssm';
import { fromIni } from '@aws-sdk/credential-providers';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { execSync } from 'node:child_process';

export type SshSetupConfig = {
  keyPairId: string;
  instanceKeyName: string;
  instanceIp: string;
  domain?: string;
  region?: string;
  profile?: string;
  sshDir?: string; // Default: ~/.ssh
};

export type SshSetupResult = {
  keyFilePath: string;
  sshConfigEntry?: string;
  success: boolean;
  errors: string[];
};

const log = (
  level: 'info' | 'warn' | 'error',
  msg: string,
  meta: Record<string, unknown> = {}
) =>
  console.log(
    JSON.stringify({ ts: new Date().toISOString(), level, msg, ...meta })
  );

/**
 * Retrieves SSH private key from SSM Parameter Store and stores it locally
 */
export async function setupSshKey(
  config: SshSetupConfig
): Promise<SshSetupResult> {
  const errors: string[] = [];
  const region = config.region || process.env['AWS_REGION'] || 'us-east-1';
  const profile = config.profile || process.env['AWS_PROFILE'] || 'hepe-admin-mfa';
  const sshDir = config.sshDir || path.join(os.homedir(), '.ssh');

  // Ensure .ssh directory exists
  fs.mkdirSync(sshDir, { recursive: true, mode: 0o700 });

  const keyFilePath = path.join(sshDir, `${config.instanceKeyName}.pem`);

  // Check if key file already exists
  if (fs.existsSync(keyFilePath)) {
    log('info', 'SSH key file already exists', { keyFilePath });
    
    // Verify existing key format
    try {
      execSync(`ssh-keygen -l -f "${keyFilePath}"`, { stdio: 'ignore' });
      log('info', 'Existing key file is valid', { keyFilePath });
      
      // Ensure correct permissions
      fs.chmodSync(keyFilePath, 0o400);
      
      return {
        keyFilePath,
        success: true,
        errors: [],
      };
    } catch (err) {
      log('warn', 'Existing key file is invalid, will re-download', {
        keyFilePath,
        error: String(err),
      });
      // Continue to download new key
    }
  }

  // Retrieve private key from SSM Parameter Store
  log('info', 'Retrieving SSH key from SSM', {
    keyPairId: config.keyPairId,
    ssmPath: `/ec2/keypair/${config.keyPairId}`,
  });

  try {
    const credentials = fromIni({ profile });
    const ssmClient = new SSMClient({ region, credentials });

    const ssmResp = await ssmClient.send(
      new GetParameterCommand({
        Name: `/ec2/keypair/${config.keyPairId}`,
        WithDecryption: true,
      })
    );

    if (!ssmResp.Parameter?.Value) {
      throw new Error('SSM parameter value is empty');
    }

    // Write key file
    fs.writeFileSync(keyFilePath, ssmResp.Parameter.Value, { mode: 0o400 });
    log('info', 'SSH key retrieved and saved', { keyFilePath });

    // Verify key format
    try {
      execSync(`ssh-keygen -l -f "${keyFilePath}"`, { stdio: 'ignore' });
      log('info', 'SSH key format verified', { keyFilePath });
    } catch (err) {
      const errorMsg = `SSH key format verification failed: ${err}`;
      log('error', errorMsg);
      errors.push(errorMsg);
      // Don't fail - key might still work
    }
  } catch (err) {
    const errorMsg = `Failed to retrieve SSH key from SSM: ${err}`;
    log('error', errorMsg);
    errors.push(errorMsg);
    return {
      keyFilePath,
      success: false,
      errors,
    };
  }

  // Add to known_hosts
  try {
    const knownHostsFile = path.join(sshDir, 'known_hosts');
    const knownHostsContent = fs.existsSync(knownHostsFile)
      ? fs.readFileSync(knownHostsFile, 'utf-8')
      : '';

    if (!knownHostsContent.includes(config.instanceIp)) {
      log('info', 'Adding host to known_hosts', { instanceIp: config.instanceIp });
      try {
        const keyscanOutput = execSync(
          `ssh-keyscan -H ${config.instanceIp}`,
          { encoding: 'utf-8', timeout: 5000 }
        );
        fs.appendFileSync(knownHostsFile, keyscanOutput);
        log('info', 'Host added to known_hosts');
      } catch (err) {
        log('warn', 'Could not add host to known_hosts (may be unreachable)', {
          error: String(err),
        });
      }
    }
  } catch (err) {
    log('warn', 'Could not update known_hosts', { error: String(err) });
  }

  // Generate SSH config entry
  let sshConfigEntry: string | undefined;
  if (config.domain) {
    sshConfigEntry = `Host ${config.domain}
    HostName ${config.instanceIp}
    User ubuntu
    IdentityFile ${keyFilePath}
    StrictHostKeyChecking no`;
  }

  return {
    keyFilePath,
    sshConfigEntry,
    success: errors.length === 0,
    errors,
  };
}

/**
 * Sets up SSH access for a stack using stack info
 */
export async function setupSshForStack(stackInfo: {
  keyPairId?: string;
  instanceKeyName?: string;
  instancePublicIp?: string;
  domain: string;
  stackName?: string;
  region?: string;
  profile?: string;
}): Promise<SshSetupResult> {
  if (!stackInfo.keyPairId) {
    throw new Error('KeyPairId not found in stack info');
  }

  if (!stackInfo.instancePublicIp) {
    throw new Error('Instance public IP not found in stack info');
  }

  // Derive key name if not provided
  let instanceKeyName = stackInfo.instanceKeyName;
  if (!instanceKeyName) {
    // Try to derive from stack name or domain
    if (stackInfo.stackName) {
      // Extract key name from stack name (e.g., "emcnotary-com-mailserver" -> "emcnotary-com-mailserver-keypair")
      instanceKeyName = `${stackInfo.stackName.replace(/-mailserver$/, '')}-keypair`;
    } else {
      // Fallback: use domain-based naming
      instanceKeyName = `${stackInfo.domain.replace(/\./g, '-')}-keypair`;
    }
    log('warn', 'Instance key name not found, using derived name', {
      derivedKeyName: instanceKeyName,
    });
  }

  return setupSshKey({
    keyPairId: stackInfo.keyPairId,
    instanceKeyName,
    instanceIp: stackInfo.instancePublicIp,
    domain: stackInfo.domain,
    region: stackInfo.region,
    profile: stackInfo.profile,
  });
}

