import * as child_process from 'child_process';
import { promisify } from 'util';

const exec = promisify(child_process.exec);

/**
 * Check if SSH agent is running and has keys loaded
 */
export async function isSshAgentAvailable(): Promise<boolean> {
  try {
    // Check if SSH_AUTH_SOCK is set
    if (!process.env['SSH_AUTH_SOCK']) {
      return false;
    }

    // Check if ssh-agent is running
    const { stdout } = await exec('ssh-add -l 2>&1');
    
    // ssh-add -l returns 0 if agent has keys, 1 if no keys, 2 if no agent
    // We check for "The agent has no identities" which means agent exists but no keys
    if (stdout.includes('The agent has no identities')) {
      return false; // Agent exists but no keys loaded
    }
    
    // If we get here and stdout has content, agent has keys
    return stdout.trim().length > 0;
  } catch (error) {
    // ssh-add -l returns non-zero if no agent or no keys
    return false;
  }
}

/**
 * Get SSH agent socket path
 */
export function getSshAgentSocket(): string | null {
  return process.env['SSH_AUTH_SOCK'] || null;
}

/**
 * Build SSH command arguments that use SSH agent if available
 * Falls back to key file if agent not available
 */
export async function buildSshArgs(
  keyPath: string | null,
  host: string,
  user: string = 'ubuntu'
): Promise<string[]> {
  const useAgent = await isSshAgentAvailable();
  
  const baseArgs = [
    '-o',
    'StrictHostKeyChecking=no',
    '-o',
    'UserKnownHostsFile=/dev/null',
    '-o',
    'ConnectTimeout=30',
  ];

  if (useAgent) {
    // Use SSH agent - no -i flag needed
    return [
      ...baseArgs,
      `${user}@${host}`,
    ];
  } else if (keyPath) {
    // Fall back to key file
    return [
      '-i',
      keyPath,
      ...baseArgs,
      `${user}@${host}`,
    ];
  } else {
    // No key and no agent - will fail but let SSH handle it
    return [
      ...baseArgs,
      `${user}@${host}`,
    ];
  }
}

/**
 * Get SSH connection info with agent preference
 */
export async function getSshConnectionInfoWithAgent(
  keyPath: string | null,
  host: string,
  user: string = 'ubuntu'
): Promise<{
  useAgent: boolean;
  sshArgs: string[];
  description: string;
}> {
  const useAgent = await isSshAgentAvailable();
  
  const sshArgs = await buildSshArgs(keyPath, host, user);
  
  return {
    useAgent,
    sshArgs,
    description: useAgent
      ? `Using SSH agent (${process.env['SSH_AUTH_SOCK']})`
      : keyPath
        ? `Using SSH key file: ${keyPath}`
        : 'No SSH key or agent available',
  };
}

