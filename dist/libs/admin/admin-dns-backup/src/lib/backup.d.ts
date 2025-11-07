type Cfg = {
    bucket?: string;
    prefix?: string;
    zones?: string[];
};
export declare function backupDns(cfg?: Cfg): Promise<string>;
export {};
