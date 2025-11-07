import { aws_iam as iam } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { DomainConfig } from './domain-config';
export interface InstanceRoleProps {
    /** Domain configuration */
    domainConfig: DomainConfig;
    /** Backup bucket name */
    backupBucket: string;
    /** Nextcloud bucket name */
    nextcloudBucket: string;
    /** Stack name for resource naming */
    stackName: string;
    /** AWS region */
    region: string;
    /** AWS account ID */
    account: string;
}
/**
 * Creates IAM role and instance profile for Mail-in-a-Box instances
 */
export declare function createInstanceRole(scope: Construct, id: string, props: InstanceRoleProps): {
    role: iam.Role;
    profile: iam.CfnInstanceProfile;
};
