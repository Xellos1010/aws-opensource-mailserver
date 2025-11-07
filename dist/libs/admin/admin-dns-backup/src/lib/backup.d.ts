type Cfg = {
    bucket?: string;
    prefix?: string;
    zones?: string[];
    domain?: string;
    outputDir?: string;
};
export declare function backupDns(cfg?: Cfg): Promise<string>;
export {};
