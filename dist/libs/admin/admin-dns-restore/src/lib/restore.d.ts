type RestoreConfig = {
    backupFile: string;
    hostedZoneId?: string;
    domain?: string;
    region?: string;
    profile?: string;
    dryRun?: boolean;
};
/**
 * Restores DNS records from backup file to Route53
 */
export declare function restoreDns(config: RestoreConfig): Promise<{
    changes: number;
    created: number;
    updated: number;
    skipped: number;
}>;
export {};
