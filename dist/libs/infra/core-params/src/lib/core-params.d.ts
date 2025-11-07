/**
 * SSM Parameter Store paths for EMC Notary core infrastructure
 * These parameters are created by the core stack and consumed by the instance stack
 */
export declare const CORE_PARAM_PREFIX = "/emcnotary/core";
/** Domain Name */
export declare const P_DOMAIN_NAME = "/emcnotary/core/domainName";
/** S3 Backup Bucket Name */
export declare const P_BACKUP_BUCKET = "/emcnotary/core/backupBucket";
/** S3 Nextcloud Bucket Name */
export declare const P_NEXTCLOUD_BUCKET = "/emcnotary/core/nextcloudBucket";
/** SNS Alarms Topic ARN */
export declare const P_ALARMS_TOPIC = "/emcnotary/core/alarmsTopicArn";
/** SES Email Identity ARN */
export declare const P_SES_IDENTITY_ARN = "/emcnotary/core/sesIdentityArn";
