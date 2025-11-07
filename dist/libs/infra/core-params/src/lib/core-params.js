/**
 * SSM Parameter Store paths for EMC Notary core infrastructure
 * These parameters are created by the core stack and consumed by the instance stack
 */
export const CORE_PARAM_PREFIX = '/emcnotary/core';
/** Domain Name */
export const P_DOMAIN_NAME = `${CORE_PARAM_PREFIX}/domainName`;
/** S3 Backup Bucket Name */
export const P_BACKUP_BUCKET = `${CORE_PARAM_PREFIX}/backupBucket`;
/** S3 Nextcloud Bucket Name */
export const P_NEXTCLOUD_BUCKET = `${CORE_PARAM_PREFIX}/nextcloudBucket`;
/** SNS Alarms Topic ARN */
export const P_ALARMS_TOPIC = `${CORE_PARAM_PREFIX}/alarmsTopicArn`;
/** SES Email Identity ARN */
export const P_SES_IDENTITY_ARN = `${CORE_PARAM_PREFIX}/sesIdentityArn`;
//# sourceMappingURL=core-params.js.map