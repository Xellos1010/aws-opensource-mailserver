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
export function createInstanceRole(
  scope: Construct,
  id: string,
  props: InstanceRoleProps
): { role: iam.Role; profile: iam.CfnInstanceProfile } {
  const { domainConfig, backupBucket, nextcloudBucket, stackName, region, account } = props;

  const role = new iam.Role(scope, id, {
    roleName: `MailInABoxInstanceRole-${stackName}`,
    assumedBy: new iam.ServicePrincipal('ec2.amazonaws.com'),
    description: 'IAM role for Mail-in-a-Box instance',
    managedPolicies: [
      // CRITICAL: Required for SSM Session Manager and Run Command
      // This allows the instance to register with Systems Manager and execute commands
      iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonSSMManagedInstanceCore'),
    ],
  });

  // S3 bucket access policies
  role.addToPolicy(
    new iam.PolicyStatement({
      sid: 'BackupS3BucketAccessMIAB',
      actions: ['s3:*'],
      resources: [
        `arn:aws:s3:::${backupBucket}/*`,
        `arn:aws:s3:::${backupBucket}`,
      ],
    })
  );

  role.addToPolicy(
    new iam.PolicyStatement({
      sid: 'NextCloudS3Policy',
      actions: ['s3:*'],
      resources: [
        `arn:aws:s3:::${nextcloudBucket}/*`,
        `arn:aws:s3:::${nextcloudBucket}`,
      ],
    })
  );

  // SSM parameter access for SMTP credentials
  role.addToPolicy(
    new iam.PolicyStatement({
      sid: 'SsmParameterAccessSmtpCredentials',
      actions: ['ssm:GetParameter'],
      resources: [
        `arn:aws:ssm:${region}:${account}:parameter/smtp-username-${stackName}`,
        `arn:aws:ssm:${region}:${account}:parameter/smtp-password-${stackName}`,
      ],
    })
  );

  // SSM parameter access for core parameters
  role.addToPolicy(
    new iam.PolicyStatement({
      actions: ['ssm:GetParameter', 'ssm:GetParameters'],
      resources: [
        `arn:aws:ssm:${region}:${account}:parameter${domainConfig.coreParamPrefix}/*`,
      ],
    })
  );

  // Allow the instance to read/write the MIAB admin pw and read SES SMTP creds
  role.addToPrincipalPolicy(
    new iam.PolicyStatement({
      actions: ['ssm:GetParameter', 'ssm:GetParameters', 'ssm:PutParameter'],
      resources: [
        `arn:aws:ssm:${region}:${account}:parameter/smtp-username-*`,
        `arn:aws:ssm:${region}:${account}:parameter/smtp-password-*`,
        `arn:aws:ssm:${region}:${account}:parameter/MailInABoxAdminPassword-*`,
      ],
    })
  );

  const profile = new iam.CfnInstanceProfile(scope, `${id}Profile`, {
    instanceProfileName: `MailInABoxInstanceProfile-${stackName}`,
    roles: [role.roleName],
  });

  return { role, profile };
}
