export type SetSesDnsRecordsConfig = {
    domain: string;
    region?: string;
    profile?: string;
    stackName?: string;
    miabAdminEmail?: string;
    dryRun?: boolean;
};
export type SesDnsResult = {
    success: boolean;
    records?: {
        dkim1: {
            name: string;
            value: string;
            type: 'CNAME';
        };
        dkim2: {
            name: string;
            value: string;
            type: 'CNAME';
        };
        dkim3: {
            name: string;
            value: string;
            type: 'CNAME';
        };
        mailFromMx: {
            name: string;
            value: string;
            type: 'MX';
        };
        mailFromTxt: {
            name: string;
            value: string;
            type: 'TXT';
        };
    };
    error?: string;
};
/**
 * Sets SES DNS records via Mail-in-a-Box admin API
 * Ports logic from archive/administration/set-ses-dns-records.sh
 */
export declare function setSesDnsRecords(config: SetSesDnsRecordsConfig): Promise<SesDnsResult>;
