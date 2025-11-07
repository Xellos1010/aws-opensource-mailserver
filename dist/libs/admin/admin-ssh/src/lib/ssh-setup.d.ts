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
 */
export declare function setupSshForStack(stackInfo: {
    keyPairId?: string;
    instanceKeyName?: string;
    instancePublicIp?: string;
    domain: string;
    stackName?: string;
    region?: string;
    profile?: string;
}): Promise<SshSetupResult>;
