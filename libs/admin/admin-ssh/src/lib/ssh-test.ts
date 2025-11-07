import { spawn } from 'node:child_process';
import * as path from 'node:path';
import * as os from 'node:os';
import * as fs from 'node:fs';

export type SshTestConfig = {
  keyFilePath: string;
  instanceIp: string;
  user?: string; // Default: ubuntu
  timeout?: number; // Default: 10 seconds
  port?: number; // Default: 22
};

export type SshTestResult = {
  success: boolean;
  error?: string;
  duration: number;
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
 * Tests SSH connection with countdown timer
 * Shows pending connection timeout countdown on the same line
 */
export async function testSshConnection(
  config: SshTestConfig
): Promise<SshTestResult> {
  const startTime = Date.now();
  const user = config.user || 'ubuntu';
  const timeout = config.timeout || 10;
  const port = config.port || 22;
  const keyFilePath = path.resolve(config.keyFilePath);

  // Verify key file exists
  if (!fs.existsSync(keyFilePath)) {
    return {
      success: false,
      error: `SSH key file not found: ${keyFilePath}`,
      duration: 0,
    };
  }

  log('info', 'Testing SSH connection', {
    instanceIp: config.instanceIp,
    user,
    timeout,
    keyFilePath,
  });

  // Start countdown timer (updates every second)
  let lastRemaining = timeout;
  const countdownInterval = setInterval(() => {
    const elapsed = Math.floor((Date.now() - startTime) / 1000);
    const remaining = Math.max(0, timeout - elapsed);
    
    // Only update if the remaining time changed (to avoid flicker)
    if (remaining !== lastRemaining) {
      lastRemaining = remaining;
      if (remaining > 0) {
        process.stdout.write(`\rConnecting... ${remaining}s remaining`);
      } else {
        process.stdout.write(`\rConnecting... timeout`);
      }
    }
  }, 100);

  try {
    // Test SSH connection using ssh command with timeout
    // -o ConnectTimeout: connection timeout in seconds
    // -o BatchMode=yes: disable password prompts
    // -o StrictHostKeyChecking=no: don't prompt for host key verification
    // -o UserKnownHostsFile=/dev/null: don't update known_hosts during test
    // -o LogLevel=ERROR: suppress verbose output
    // exit: just test connection and exit
    const sshCommand = [
      'ssh',
      '-i',
      keyFilePath,
      `-o`,
      `ConnectTimeout=${timeout}`,
      '-o',
      'BatchMode=yes',
      '-o',
      'StrictHostKeyChecking=no',
      '-o',
      'UserKnownHostsFile=/dev/null',
      '-o',
      'LogLevel=ERROR',
      '-p',
      String(port),
      `${user}@${config.instanceIp}`,
      'exit',
    ];

    const result = spawn('ssh', sshCommand.slice(1), {
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    // Wait for connection with timeout
    const connectionPromise = new Promise<{ success: boolean; error?: string }>(
      (resolve) => {
        let resolved = false;

        const timeoutId = setTimeout(() => {
          if (!resolved) {
            resolved = true;
            result.kill('SIGTERM');
            resolve({
              success: false,
              error: `Connection timeout after ${timeout} seconds`,
            });
          }
        }, timeout * 1000);

        result.on('close', (code) => {
          if (!resolved) {
            resolved = true;
            clearTimeout(timeoutId);
            if (code === 0) {
              resolve({ success: true });
            } else {
              resolve({
                success: false,
                error: `SSH connection failed with exit code ${code}`,
              });
            }
          }
        });

        result.on('error', (err) => {
          if (!resolved) {
            resolved = true;
            clearTimeout(timeoutId);
            resolve({
              success: false,
              error: `SSH command error: ${err.message}`,
            });
          }
        });
      }
    );

    const result_data = await connectionPromise;
    clearInterval(countdownInterval);

    const duration = (Date.now() - startTime) / 1000;

    // Clear the countdown line and show result
    process.stdout.write('\r' + ' '.repeat(50) + '\r');

    if (result_data.success) {
      console.log(`✓ SSH connection successful (${duration.toFixed(1)}s)`);
      log('info', 'SSH connection test passed', { duration });
      return {
        success: true,
        duration,
      };
    } else {
      console.log(`✗ SSH connection failed: ${result_data.error || 'Unknown error'}`);
      log('error', 'SSH connection test failed', {
        error: result_data.error,
        duration,
      });
      return {
        success: false,
        error: result_data.error,
        duration,
      };
    }
  } catch (err) {
    clearInterval(countdownInterval);
    process.stdout.write('\r' + ' '.repeat(50) + '\r');

    const duration = (Date.now() - startTime) / 1000;
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.log(`✗ SSH connection test error: ${errorMsg}`);
    log('error', 'SSH connection test error', { error: errorMsg, duration });

    return {
      success: false,
      error: errorMsg,
      duration,
    };
  }
}

/**
 * Tests SSH connection using stack info
 */
export async function testSshForStack(stackInfo: {
  instancePublicIp?: string;
  domain: string;
  instanceKeyName?: string;
  region?: string;
  profile?: string;
}): Promise<SshTestResult> {
  if (!stackInfo.instancePublicIp) {
    throw new Error('Instance public IP not found in stack info');
  }

  // Get SSH key path
  const sshDir = path.join(os.homedir(), '.ssh');
  const instanceKeyName = stackInfo.instanceKeyName || `${stackInfo.domain.replace(/\./g, '-')}-keypair`;
  const keyFilePath = path.join(sshDir, `${instanceKeyName}.pem`);

  return testSshConnection({
    keyFilePath,
    instanceIp: stackInfo.instancePublicIp,
    user: 'ubuntu',
    timeout: 10,
  });
}

