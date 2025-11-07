/**
 * Gets the SSH key file path for a stack
 * Ensures the key is set up if it doesn't exist
 */
export declare function getSshKeyPath(config: {
    appPath?: string;
    stackName?: string;
    domain?: string;
    region?: string;
    profile?: string;
    ensureSetup?: boolean;
}): Promise<string | null>;
/**
 * Gets SSH connection details for a stack
 */
export declare function getSshConnectionInfo(config: {
    appPath?: string;
    stackName?: string;
    domain?: string;
    region?: string;
    profile?: string;
}): Promise<{
    keyPath: string | null;
    host: string;
    user: string;
    sshCommand: string;
} | null>;
