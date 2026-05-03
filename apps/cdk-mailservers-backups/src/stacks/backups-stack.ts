import {
  Stack,
  StackProps,
  CfnOutput,
  aws_s3 as s3,
  aws_ssm as ssm,
  aws_iam as iam,
  RemovalPolicy,
} from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { tagStack } from '@mm/infra-shared-constructs';

/**
 * Central backup stack for all mailserver deployments
 * This stack provides a shared S3 bucket for storing backups across all mailserver instances
 */
export class MailserversBackupsStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);
    tagStack(this, 'mailservers-backups');

    // Central backup bucket for all mailserver deployments
    // Stores: instance backups, DNS backups, mailbox backups, log exports
    const backupBucket = new s3.Bucket(this, 'BackupBucket', {
      bucketName: 'mailservers-backups',
      removalPolicy: RemovalPolicy.DESTROY, // Delete bucket on stack deletion
      versioned: true,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      autoDeleteObjects: true, // Auto-delete objects when stack is deleted
      lifecycleRules: [
        {
          id: 'DeleteOldBackups',
          enabled: true,
          expiration: { days: 90 }, // Keep backups for 90 days
          transitions: [
            {
              storageClass: s3.StorageClass.INFREQUENT_ACCESS,
              transitionAfter: { days: 30 },
            },
            {
              storageClass: s3.StorageClass.GLACIER,
              transitionAfter: { days: 60 },
            },
          ],
        },
      ],
    });

    // SSM Parameter to store backup bucket name for other stacks to reference
    new ssm.StringParameter(this, 'BackupBucketParam', {
      parameterName: '/mailservers/backups/bucketName',
      stringValue: backupBucket.bucketName,
      description: 'Central backup bucket name for all mailserver deployments',
    });

    // Outputs
    new CfnOutput(this, 'BackupBucketName', {
      value: backupBucket.bucketName,
      description: 'Central backup bucket name for mailserver backups',
      exportName: 'MailserversBackupBucket',
    });

    new CfnOutput(this, 'BackupBucketArn', {
      value: backupBucket.bucketArn,
      description: 'Central backup bucket ARN',
    });
  }
}

