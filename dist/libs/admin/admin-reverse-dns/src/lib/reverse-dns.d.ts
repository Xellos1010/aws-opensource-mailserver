export type SetReverseDnsConfig = {
    appPath?: string;
    stackName?: string;
    domain?: string;
    region?: string;
    profile?: string;
    ptrRecord?: string;
};
export type ReverseDnsResult = {
    success: boolean;
    elasticIp?: string;
    allocationId?: string;
    ptrRecord?: string;
    error?: string;
};
/**
 * Sets reverse DNS (PTR record) for Elastic IP address
 */
export declare function setReverseDns(config: SetReverseDnsConfig): Promise<ReverseDnsResult>;
