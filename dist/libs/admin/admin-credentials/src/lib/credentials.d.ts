export type AdminCredentials = {
    email: string;
    password: string;
    domain: string;
    adminUrl: string;
};
export type GetCredentialsConfig = {
    appPath?: string;
    stackName?: string;
    domain?: string;
    region?: string;
    profile?: string;
};
/**
 * Gets admin credentials for a Mail-in-a-Box stack
 */
export declare function getAdminCredentials(config: GetCredentialsConfig): Promise<AdminCredentials>;
