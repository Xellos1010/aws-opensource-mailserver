import { getStackInfo, getStackInfoFromApp } from '@mm/admin-stack-info';
import { setupSshForStack } from './ssh-setup';
import * as path from 'node:path';
import * as os from 'node:os';
import * as fs from 'node:fs';

/**
 * Gets the SSH key file path for a stack
 * Ensures the key is set up if it doesn't exist
 */
export async function getSshKeyPath(
  config: {
    appPath?: string;
    stackName?: string;
    domain?: string;
    region?: string;
    profile?: string;
    ensureSetup?: boolean; // If true, sets up SSH if key doesn't exist
  }
): Promise<string | null> {
  const { ensureSetup = true } = config;

  // Get stack information
  let stackInfo;
  if (config.appPath) {
    stackInfo = await getStackInfoFromApp(config.appPath, {
      region: config.region,
      profile: config.profile,
    });
  } else {
    stackInfo = await getStackInfo({
      stackName: config.stackName,
      domain: config.domain,
      region: config.region,
      profile: config.profile,
    });
  }

  if (!stackInfo.instanceKeyName) {
    return null;
  }

  const sshDir = path.join(os.homedir(), '.ssh');
  const keyFilePath = path.join(sshDir, `${stackInfo.instanceKeyName}.pem`);

  // Check if key exists
  if (fs.existsSync(keyFilePath)) {
    return keyFilePath;
  }

  // Setup SSH if requested and key doesn't exist
  if (ensureSetup && stackInfo.keyPairId && stackInfo.instancePublicIp) {
    try {
      const result = await setupSshForStack({
        keyPairId: stackInfo.keyPairId,
        instanceKeyName: stackInfo.instanceKeyName,
        instancePublicIp: stackInfo.instancePublicIp,
        domain: stackInfo.domain,
        region: stackInfo.region,
        profile: config.profile,
      });

      if (result.success) {
        return result.keyFilePath;
      }
    } catch (err) {
      console.warn(`Failed to setup SSH key: ${err}`);
    }
  }

  return null;
}

/**
 * Gets SSH connection details for a stack
 */
export async function getSshConnectionInfo(
  config: {
    appPath?: string;
    stackName?: string;
    domain?: string;
    region?: string;
    profile?: string;
  }
): Promise<{
  keyPath: string | null;
  host: string;
  user: string;
  sshCommand: string;
} | null> {
  // Get stack information
  let stackInfo;
  if (config.appPath) {
    stackInfo = await getStackInfoFromApp(config.appPath, {
      region: config.region,
      profile: config.profile,
    });
  } else {
    stackInfo = await getStackInfo({
      stackName: config.stackName,
      domain: config.domain,
      region: config.region,
      profile: config.profile,
    });
  }

  if (!stackInfo.instancePublicIp) {
    return null;
  }

  const keyPath = await getSshKeyPath({
    ...config,
    ensureSetup: true,
  });

  const user = 'ubuntu';
  const host = stackInfo.instancePublicIp;
  const sshCommand = keyPath
    ? `ssh -i ${keyPath} ${user}@${host}`
    : `ssh ${user}@${host}`;

  return {
    keyPath,
    host,
    user,
    sshCommand,
  };
}

