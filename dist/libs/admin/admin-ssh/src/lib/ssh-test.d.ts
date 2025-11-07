export type SshTestConfig = {
    keyFilePath: string;
    instanceIp: string;
    user?: string;
    timeout?: number;
    port?: number;
};
export type SshTestResult = {
    success: boolean;
    error?: string;
    duration: number;
};
/**
 * Tests SSH connection with countdown timer
 * Shows pending connection timeout countdown on the same line
 */
export declare function testSshConnection(config: SshTestConfig): Promise<SshTestResult>;
/**
 * Tests SSH connection using stack info
 */
export declare function testSshForStack(stackInfo: {
    instancePublicIp?: string;
    domain: string;
    instanceKeyName?: string;
    region?: string;
    profile?: string;
}): Promise<SshTestResult>;
