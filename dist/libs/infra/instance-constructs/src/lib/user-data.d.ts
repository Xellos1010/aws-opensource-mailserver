/**
 * Creates minimal UserData placeholder for SSM bootstrap
 * The actual MIAB setup will be done via SSM RunCommand after instance launch
 */
export declare function createBootstrapPlaceholderUserData(domainName: string, instanceDns: string, stackName: string, region: string): string[];
