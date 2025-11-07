export type SshSetupConfig = {
    keyPairId: string;
    instanceKeyName: string;
    instanceIp: string;
    domain?: string;
    region?: string;
    profile?: string;
    sshDir?: string;
};
export type SshSetupResult = {
    keyFilePath: string;
    sshConfigEntry?: string;
    success: boolean;
    errors: string[];
};
/**
 * Retrieves SSH private key from SSM Parameter Store and stores it locally
 */
export declare function setupSshKey(config: SshSetupConfig): Promise<SshSetupResult>;
/**
 * Sets up SSH access for a stack using stack info
 * Follows the same flow as setup-ssh-access.sh:
 * 1. Get KeyPairId from stack outputs
 * 2. Get instance ID from RestorePrefix output
 * 3. Get instance public IP and key name from EC2
 * 4. Retrieve key from SSM Parameter Store
 * 5. Store key with proper permissions
 * 6. Verify key format
 * 7. Update known_hosts
 * 8. Generate SSH config entry
 */
export declare function setupSshForStack(stackInfo: {
    keyPairId?: string;
    instanceKeyName?: string;
    instancePublicIp?: string;
    instanceId?: string;
    domain: string;
    stackName?: string;
    region?: string;
    profile?: string;
}): Promise<SshSetupResult>;
