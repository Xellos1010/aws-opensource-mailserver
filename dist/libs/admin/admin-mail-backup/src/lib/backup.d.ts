type Cfg = {
    host: string;
    port: number;
    secure: boolean;
    user: string;
    pass: string;
    s3Bucket?: string;
    s3Prefix?: string;
    includeMailboxes?: string[];
    excludeMailboxes?: string[];
    domain?: string;
    outputDir?: string;
};
export declare function backupMailbox(cfg: Cfg): Promise<{
    outDir: string;
    tarPath: string;
    s3Uri: string;
} | {
    outDir: string;
    tarPath: string;
    s3Uri?: undefined;
}>;
export {};
