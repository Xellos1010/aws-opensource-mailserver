/**
 * SSH Command Execution Utility
 */

import { spawn } from 'child_process';

export interface SshCommandResult {
  success: boolean;
  output: string;
  error?: string;
}

export interface SshCommandOptions {
  maxRetries?: number;
  retryDelayMs?: number;
  connectTimeoutSecs?: number;
}

/**
 * Execute a single SSH command attempt
 */
async function sshCommandOnce(
  keyPath: string,
  host: string,
  command: string,
  connectTimeoutSecs: number
): Promise<SshCommandResult> {
  return new Promise((resolve) => {
    const sshArgs = [
      '-i',
      keyPath,
      '-o',
      'StrictHostKeyChecking=no',
      '-o',
      'UserKnownHostsFile=/dev/null',
      '-o',
      `ConnectTimeout=${connectTimeoutSecs}`,
      '-o',
      'ServerAliveInterval=5',
      '-o',
      'ServerAliveCountMax=3',
      `ubuntu@${host}`,
      command,
    ];

    let output = '';
    let error = '';

    const ssh = spawn('ssh', sshArgs);

    ssh.stdout.on('data', (data) => {
      output += data.toString();
    });

    ssh.stderr.on('data', (data) => {
      error += data.toString();
    });

    ssh.on('close', (code) => {
      resolve({
        success: code === 0,
        output: output.trim(),
        error: error.trim(),
      });
    });

    ssh.on('error', (err) => {
      resolve({
        success: false,
        output: '',
        error: err.message,
      });
    });
  });
}

/**
 * Execute SSH command with retry support for transient connection issues
 */
export async function sshCommand(
  keyPath: string,
  host: string,
  command: string,
  options?: SshCommandOptions
): Promise<SshCommandResult> {
  const maxRetries = options?.maxRetries ?? 3;
  const retryDelayMs = options?.retryDelayMs ?? 3000;
  const connectTimeoutSecs = options?.connectTimeoutSecs ?? 15;

  let lastResult: SshCommandResult = {
    success: false,
    output: '',
    error: 'No attempts made',
  };

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    lastResult = await sshCommandOnce(keyPath, host, command, connectTimeoutSecs);

    if (lastResult.success) {
      return lastResult;
    }

    // Check if this is a transient connection error worth retrying
    const isConnectionError =
      lastResult.error?.includes('Connection refused') ||
      lastResult.error?.includes('Connection timed out') ||
      lastResult.error?.includes('Connection reset') ||
      lastResult.error?.includes('No route to host');

    if (!isConnectionError || attempt === maxRetries) {
      // Not a connection error or final attempt, return the result
      return lastResult;
    }

    // Wait before retrying
    await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
  }

  return lastResult;
}


