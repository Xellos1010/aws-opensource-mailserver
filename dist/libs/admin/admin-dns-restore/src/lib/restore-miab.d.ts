export type BackupRecord = {
    qname: string;
    rtype: string;
    value: string;
    zone?: string;
    'sort-order'?: {
        created?: number;
        qname?: number;
    };
};
export type RestoreMiabConfig = {
    backupFile: string;
    appPath?: string;
    stackName?: string;
    domain?: string;
    region?: string;
    profile?: string;
    dryRun?: boolean;
};
/**
 * Restores DNS records from backup file using Mail-in-a-Box DNS API
 */
export declare function restoreDnsFromBackup(config: RestoreMiabConfig): Promise<void>;
