import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * Standard API key path for Mail-in-a-Box
 */
export const API_KEY_PATH = '/var/lib/mailinabox/api.key';

/**
 * Get the standard API key path
 */
export function getApiKeyPath(): string {
  return API_KEY_PATH;
}

/**
 * Check if API key exists and is readable
 * @param apiKeyPath - Optional custom path to API key (defaults to standard path)
 * @returns true if API key exists and is readable, false otherwise
 */
export function checkApiKeyAvailable(apiKeyPath?: string): boolean {
  const keyPath = apiKeyPath || API_KEY_PATH;
  try {
    // Check if file exists and is readable
    fs.accessSync(keyPath, fs.constants.R_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * Wait for API key to become available with timeout and progress indicator
 * @param options - Configuration options
 * @param options.timeoutMs - Maximum time to wait in milliseconds (default: 300000 = 5 minutes)
 * @param options.checkIntervalMs - Interval between checks in milliseconds (default: 10000 = 10 seconds)
 * @param options.apiKeyPath - Optional custom path to API key (defaults to standard path)
 * @param options.onProgress - Optional callback for progress updates
 * @returns Promise that resolves when API key is available, or rejects on timeout
 */
export async function waitForApiKey(options?: {
  timeoutMs?: number;
  checkIntervalMs?: number;
  apiKeyPath?: string;
  onProgress?: (elapsed: number, remaining: number) => void;
}): Promise<void> {
  const timeoutMs = options?.timeoutMs ?? 300000; // 5 minutes default
  const checkIntervalMs = options?.checkIntervalMs ?? 10000; // 10 seconds default
  const apiKeyPath = options?.apiKeyPath || API_KEY_PATH;
  const startTime = Date.now();

  while (Date.now() - startTime < timeoutMs) {
    if (checkApiKeyAvailable(apiKeyPath)) {
      return; // API key is available
    }

    const elapsed = Date.now() - startTime;
    const remaining = timeoutMs - elapsed;
    
    if (options?.onProgress) {
      options.onProgress(elapsed, remaining);
    }

    // Wait before next check
    await new Promise((resolve) => setTimeout(resolve, checkIntervalMs));
  }

  // Timeout reached
  throw new Error(
    `API key not available after ${timeoutMs}ms timeout. ` +
    `Expected path: ${apiKeyPath}. ` +
    `Mail-in-a-Box setup may still be running. ` +
    `Check /var/log/mailinabox_setup.log for progress.`
  );
}


