export type BackupBridgeConfig = {
    appPath?: string;
    stackName?: string;
    domain?: string;
    region?: string;
    profile?: string;
    skipDns?: boolean;
    skipMail?: boolean;
    dnsBucket?: string;
    dnsPrefix?: string;
    mailBucket?: string;
    mailPrefix?: string;
    mailInclude?: string[];
    mailExclude?: string[];
};
export type BackupBridgeResult = {
    timestamp: string;
    stackInfo: {
        stackName: string;
        domain: string;
        instancePublicIp?: string;
    };
    dnsBackup?: {
        outputDir: string;
    };
    mailBackup?: {
        outDir: string;
        tarPath: string;
        s3Uri?: string;
    };
    summary: {
        dnsSuccess: boolean;
        mailSuccess: boolean;
        errors: string[];
    };
};
/**
 * Bridge script that backs up both DNS and mail server for a given stack
 */
export declare function backupBridge(config: BackupBridgeConfig): Promise<BackupBridgeResult>;
