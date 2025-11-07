export type StackOutputs = {
    InstancePublicIp?: string;
    AdminPassword?: string;
    KeyPairId?: string;
    RestorePrefix?: string;
    InstanceId?: string;
    HostedZoneId?: string;
    DkimDNSTokenName1?: string;
    DkimDNSTokenValue1?: string;
    DkimDNSTokenName2?: string;
    DkimDNSTokenValue2?: string;
    DkimDNSTokenName3?: string;
    DkimDNSTokenValue3?: string;
    MailFromDomain?: string;
    MailFromMXRecord?: string;
    MailFromTXTRecord?: string;
    BackupS3Bucket?: string;
    [key: string]: string | undefined;
};
export type StackInfo = {
    stackName: string;
    domain: string;
    region: string;
    outputs: StackOutputs;
    instanceId?: string;
    instancePublicIp?: string;
    instanceKeyName?: string;
    keyPairId?: string;
    adminPassword?: string;
    hostedZoneId?: string;
};
export type StackInfoConfig = {
    stackName?: string;
    domain?: string;
    appPath?: string;
    region?: string;
    profile?: string;
};
/**
 * Resolves domain name from app path or stack name
 * Examples:
 * - "apps/cdk-emc-notary" -> "emcnotary.com"
 * - "cdk-emc-notary" -> "emcnotary.com"
 * - "emcnotary-com-mailserver" -> "emcnotary.com"
 */
export declare function resolveDomain(appPath?: string, stackName?: string): string | null;
/**
 * Resolves stack name from domain or app path
 * Examples:
 * - "emcnotary.com" -> "emcnotary-com-mailserver"
 * - "apps/cdk-emc-notary" -> "emcnotary-com-mailserver"
 */
export declare function resolveStackName(domain?: string, appPath?: string, explicitStackName?: string): string;
/**
 * Gets CloudFormation stack information
 */
export declare function getStackInfo(config: StackInfoConfig): Promise<StackInfo>;
/**
 * Gets stack info from app directory path
 * Example: "apps/cdk-emc-notary" -> StackInfo
 */
export declare function getStackInfoFromApp(appPath: string, config?: Omit<StackInfoConfig, 'appPath'>): Promise<StackInfo>;
