export type UsersBackupConfig = {
    appPath?: string;
    stackName?: string;
    domain?: string;
    region?: string;
    profile?: string;
    outputDir?: string;
};
export type MailUser = {
    email: string;
    privileges?: string[];
    status?: string;
    mailbox?: string;
    [key: string]: unknown;
};
/**
 * Backs up Mail-in-a-Box users via API
 */
export declare function backupUsers(config: UsersBackupConfig): Promise<{
    outputDir: string;
    userCount: number;
}>;
