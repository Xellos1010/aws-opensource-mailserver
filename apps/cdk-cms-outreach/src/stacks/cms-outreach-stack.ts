import * as cdk from 'aws-cdk-lib';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as rds from 'aws-cdk-lib/aws-rds';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import { Construct } from 'constructs';

export interface CmsOutreachStackProps extends cdk.StackProps {
  readonly domainName: string;
}

export class CmsOutreachStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: CmsOutreachStackProps) {
    super(scope, id, props);

    const vpc = new ec2.Vpc(this, 'CmsVpc', {
      maxAzs: 2,
      natGateways: 1,
    });

    const cluster = new ecs.Cluster(this, 'CmsCluster', {
      vpc,
      containerInsights: true,
      clusterName: `${props.domainName}-cms-cluster`,
    });

    const artifactsBucket = new s3.Bucket(this, 'ArtifactsBucket', {
      encryption: s3.BucketEncryption.S3_MANAGED,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
      lifecycleRules: [
        {
          id: 'raw-artifacts-retention',
          expiration: cdk.Duration.days(90),
          prefix: 'raw/',
        },
      ],
    });

    const dlq = new sqs.Queue(this, 'WorkerDlq', {
      retentionPeriod: cdk.Duration.days(14),
      encryption: sqs.QueueEncryption.SQS_MANAGED,
    });

    const jobQueue = new sqs.Queue(this, 'WorkerQueue', {
      visibilityTimeout: cdk.Duration.minutes(5),
      retentionPeriod: cdk.Duration.days(7),
      encryption: sqs.QueueEncryption.SQS_MANAGED,
      deadLetterQueue: {
        maxReceiveCount: 5,
        queue: dlq,
      },
    });

    const dbSecurityGroup = new ec2.SecurityGroup(this, 'DbSecurityGroup', {
      vpc,
      description: 'Security group for CMS Postgres',
      allowAllOutbound: true,
    });

    const db = new rds.DatabaseInstance(this, 'CmsDatabase', {
      engine: rds.DatabaseInstanceEngine.postgres({
        version: rds.PostgresEngineVersion.VER_16_3,
      }),
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      allocatedStorage: 50,
      maxAllocatedStorage: 200,
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.T4G, ec2.InstanceSize.MEDIUM),
      securityGroups: [dbSecurityGroup],
      backupRetention: cdk.Duration.days(7),
      cloudwatchLogsExports: ['postgresql'],
      deletionProtection: true,
      removalPolicy: cdk.RemovalPolicy.SNAPSHOT,
      credentials: rds.Credentials.fromGeneratedSecret('cms_admin'),
      databaseName: 'cms',
    });

    const appSecret = new secretsmanager.Secret(this, 'CmsAppSecret', {
      generateSecretString: {
        secretStringTemplate: JSON.stringify({
          CMS_JWT_SECRET: 'replace-me',
          CMS_PASSWORD_SALT: 'replace-me',
        }),
        generateStringKey: 'placeholder',
        excludePunctuation: true,
      },
    });

    const apiLogs = new logs.LogGroup(this, 'ApiLogGroup', {
      retention: logs.RetentionDays.ONE_MONTH,
    });

    const workerLogs = new logs.LogGroup(this, 'WorkerLogGroup', {
      retention: logs.RetentionDays.ONE_MONTH,
    });

    const apiTaskDefinition = new ecs.FargateTaskDefinition(this, 'ApiTaskDefinition', {
      cpu: 512,
      memoryLimitMiB: 1024,
    });

    apiTaskDefinition.addContainer('ApiContainer', {
      image: ecs.ContainerImage.fromRegistry('public.ecr.aws/docker/library/node:20-alpine'),
      command: ['node', '-e', 'console.log("replace api container image before deploy")'],
      logging: ecs.LogDrivers.awsLogs({
        streamPrefix: 'cms-api',
        logGroup: apiLogs,
      }),
      environment: {
        CMS_RETENTION_DAYS: '90',
        CMS_STATE_BACKEND: 'postgres',
      },
      secrets: {
        CMS_SECRET_BUNDLE: ecs.Secret.fromSecretsManager(appSecret),
        CMS_DATABASE_URL: ecs.Secret.fromSecretsManager(db.secret!, 'url'),
      },
      portMappings: [{ containerPort: 4010 }],
    });

    const workerTaskDefinition = new ecs.FargateTaskDefinition(this, 'WorkerTaskDefinition', {
      cpu: 512,
      memoryLimitMiB: 1024,
    });

    workerTaskDefinition.addContainer('WorkerContainer', {
      image: ecs.ContainerImage.fromRegistry('public.ecr.aws/docker/library/node:20-alpine'),
      command: ['node', '-e', 'console.log("replace worker container image before deploy")'],
      logging: ecs.LogDrivers.awsLogs({
        streamPrefix: 'cms-worker',
        logGroup: workerLogs,
      }),
      environment: {
        CMS_RETENTION_DAYS: '90',
      },
      secrets: {
        CMS_SECRET_BUNDLE: ecs.Secret.fromSecretsManager(appSecret),
        CMS_DATABASE_URL: ecs.Secret.fromSecretsManager(db.secret!, 'url'),
      },
    });

    const apiServiceSecurityGroup = new ec2.SecurityGroup(this, 'ApiServiceSecurityGroup', {
      vpc,
      allowAllOutbound: true,
    });

    const apiService = new ecs.FargateService(this, 'ApiService', {
      cluster,
      taskDefinition: apiTaskDefinition,
      desiredCount: 2,
      assignPublicIp: false,
      securityGroups: [apiServiceSecurityGroup],
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
    });

    const workerService = new ecs.FargateService(this, 'WorkerService', {
      cluster,
      taskDefinition: workerTaskDefinition,
      desiredCount: 1,
      assignPublicIp: false,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
    });

    db.connections.allowDefaultPortFrom(apiService, 'Allow API service access to Postgres');
    db.connections.allowDefaultPortFrom(workerService, 'Allow worker service access to Postgres');

    artifactsBucket.grantReadWrite(apiTaskDefinition.taskRole);
    artifactsBucket.grantReadWrite(workerTaskDefinition.taskRole);
    jobQueue.grantConsumeMessages(workerTaskDefinition.taskRole);
    jobQueue.grantSendMessages(apiTaskDefinition.taskRole);

    const alb = new elbv2.ApplicationLoadBalancer(this, 'ApiAlb', {
      vpc,
      internetFacing: false,
      vpcSubnets: {
        subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
      },
    });

    const listener = alb.addListener('ApiListener', {
      port: 80,
      open: false,
    });

    listener.addTargets('ApiTarget', {
      protocol: elbv2.ApplicationProtocol.HTTP,
      port: 4010,
      targets: [apiService],
      healthCheck: {
        path: '/health',
        healthyHttpCodes: '200',
      },
    });

    new cloudwatch.Alarm(this, 'QueueDepthAlarm', {
      metric: jobQueue.metricApproximateNumberOfMessagesVisible(),
      threshold: 100,
      evaluationPeriods: 2,
      datapointsToAlarm: 2,
      alarmDescription: 'CMS worker queue depth is high',
    });

    new cloudwatch.Alarm(this, 'ApiCpuAlarm', {
      metric: apiService.metricCpuUtilization(),
      threshold: 80,
      evaluationPeriods: 3,
      datapointsToAlarm: 2,
      alarmDescription: 'CMS API CPU utilization exceeded 80%',
    });

    new cdk.CfnOutput(this, 'CmsApiAlbDnsName', {
      value: alb.loadBalancerDnsName,
      description: 'Private ALB DNS for API routing from edge/reverse proxy.',
    });

    new cdk.CfnOutput(this, 'CmsArtifactsBucketName', {
      value: artifactsBucket.bucketName,
    });

    new cdk.CfnOutput(this, 'CmsJobQueueUrl', {
      value: jobQueue.queueUrl,
    });

    new cdk.CfnOutput(this, 'CmsDatabaseSecretArn', {
      value: db.secret!.secretArn,
    });
  }
}
