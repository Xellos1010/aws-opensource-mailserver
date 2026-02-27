import { Construct } from 'constructs';
import {
  Stack,
  aws_cloudwatch as cw,
  aws_sns as sns,
  aws_lambda as lambda,
  aws_logs as logs,
  aws_iam as iam,
  Duration,
  RemovalPolicy,
} from 'aws-cdk-lib';

export interface EmergencyAlarmsProps {
  /** EC2 instance ID to monitor */
  instanceId: string;
  /** Recovery orchestrator Lambda function */
  recoveryOrchestratorLambda: lambda.IFunction;
  /** SNS topic for alarm notifications (optional) */
  notificationTopic?: sns.ITopic;
  /** Domain name for resource naming */
  domainName: string;
  /** CloudWatch Log Group name for syslog (default: /ec2/syslog-{domain}-mailserver) */
  syslogLogGroupName?: string;
  /** Log retention in days (default: 7) */
  logRetentionDays?: number;
  /** Optional prefix to keep alarm names unique across split stacks */
  alarmNamePrefix?: string;
  /** Enable alarms from MailServer/Health custom metrics */
  enableProactiveHealthAlarms?: boolean;
  /** Namespace for proactive health metrics */
  healthMetricsNamespace?: string;
  /** Admin endpoint healthy threshold (0/1 metric) */
  adminEndpointHealthyThreshold?: number;
  /** Root disk usage critical threshold (percent) */
  diskUsageCriticalPercent?: number;
  /** Primary health threshold (0/1 metric) */
  mailPrimaryHealthyThreshold?: number;
}

/**
 * Emergency Alarms - CloudWatch alarms wired to recovery system
 *
 * Creates:
 * - InstanceStatusCheck alarm (instance-level issues)
 * - SystemStatusCheck alarm (AWS infrastructure issues)
 * - OOMKillDetected alarm (memory exhaustion)
 * - OOM Metric Filter + Log Group for syslog
 * - Alarm → Lambda invoke permissions (critical fix from hepefoundation)
 */
export class EmergencyAlarms extends Construct {
  public readonly instanceStatusAlarm: cw.Alarm;
  public readonly systemStatusAlarm: cw.Alarm;
  public readonly oomKillAlarm: cw.Alarm;
  public readonly mailboxPermissionAlarm: cw.Alarm;
  public readonly adminEndpointAlarm?: cw.Alarm;
  public readonly diskUsageCriticalAlarm?: cw.Alarm;
  public readonly mailPrimaryUnhealthyAlarm?: cw.Alarm;
  public readonly syslogLogGroup: logs.LogGroup;

  constructor(scope: Construct, id: string, props: EmergencyAlarmsProps) {
    super(scope, id);

    const {
      instanceId,
      recoveryOrchestratorLambda,
      notificationTopic,
      domainName,
      syslogLogGroupName: providedSyslogLogGroupName,
      logRetentionDays = 7,
      alarmNamePrefix,
      enableProactiveHealthAlarms = true,
      healthMetricsNamespace = 'MailServer/Health',
      adminEndpointHealthyThreshold = 1,
      diskUsageCriticalPercent = 92,
      mailPrimaryHealthyThreshold = 1,
    } = props;

    const alarmPrefix = alarmNamePrefix ? `${alarmNamePrefix}-` : '';

    // Use stack name for syslog log group if not provided (domainName is a token from SSM)
    const stack = Stack.of(this);
    const syslogLogGroupName =
      providedSyslogLogGroupName || `/ec2/syslog-${stack.stackName}-mailserver`;

    // CloudWatch Log Group for syslog (required for OOM detection)
    // Map retention days to RetentionDays enum
    const retentionDaysMap: Record<number, logs.RetentionDays> = {
      1: logs.RetentionDays.ONE_DAY,
      3: logs.RetentionDays.THREE_DAYS,
      5: logs.RetentionDays.FIVE_DAYS,
      7: logs.RetentionDays.ONE_WEEK,
      14: logs.RetentionDays.TWO_WEEKS,
      30: logs.RetentionDays.ONE_MONTH,
    };
    const retention = retentionDaysMap[logRetentionDays] || logs.RetentionDays.ONE_WEEK;

    this.syslogLogGroup = new logs.LogGroup(this, 'SyslogLogGroup', {
      logGroupName: syslogLogGroupName,
      retention,
      removalPolicy: RemovalPolicy.RETAIN, // Retain logs for compliance
    });

    // OOM Metric Filter - detects "Out of memory" messages in syslog
    // This creates a CloudWatch metric that increments when OOM kills occur
    new logs.MetricFilter(this, 'OOMMetricFilter', {
      logGroup: this.syslogLogGroup,
      filterPattern: logs.FilterPattern.literal('Out of memory'),
      metricNamespace: 'EC2',
      metricName: 'oom_kills',
      metricValue: '1',
      defaultValue: 0,
    });

    // Mailbox permission error metric filter - catches Dovecot maildir ownership failures
    // Example: mkdir(/home/user-data/mail/mailboxes/... ) failed: Permission denied
    new logs.MetricFilter(this, 'MailboxPermissionMetricFilter', {
      logGroup: this.syslogLogGroup,
      filterPattern: logs.FilterPattern.literal('"Failed to autocreate mailbox"'),
      metricNamespace: 'EC2',
      metricName: 'mailbox_permission_errors',
      metricValue: '1',
      defaultValue: 0,
    });

    // CRITICAL FIX: Create CloudWatch alarm permission manually once (before creating alarms)
    // LambdaAction.bind() creates permissions with ID "AlarmPermission" for each alarm,
    // causing conflicts when multiple alarms trigger the same Lambda.
    // By creating the permission manually first with a wildcard sourceArn, we avoid duplicates.
    recoveryOrchestratorLambda.addPermission('CloudWatchAlarmInvoke', {
      principal: new iam.ServicePrincipal('lambda.alarms.cloudwatch.amazonaws.com'),
    });

    const lambdaArn = recoveryOrchestratorLambda.functionArn;
    const alarmActions: string[] = [lambdaArn];
    if (notificationTopic) {
      alarmActions.push(notificationTopic.topicArn);
    }

    // Instance Status Check Alarm
    this.instanceStatusAlarm = new cw.Alarm(this, 'InstanceStatusCheckAlarm', {
      alarmName: `${alarmPrefix}InstanceStatusCheck-${instanceId}`,
      alarmDescription:
        'Alerts when EC2 instance status check fails (instance-level issues). Triggers automatic progressive recovery via orchestrator.',
      metric: new cw.Metric({
        namespace: 'AWS/EC2',
        metricName: 'StatusCheckFailed_Instance',
        dimensionsMap: {
          InstanceId: instanceId,
        },
        period: Duration.minutes(1),
        statistic: 'Maximum',
      }),
      threshold: 1,
      evaluationPeriods: 2,
      comparisonOperator: cw.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: cw.TreatMissingData.BREACHING,
    });
    
    // Set alarm actions directly using escape hatch (bypasses LambdaAction)
    const instanceStatusCfn = this.instanceStatusAlarm.node.defaultChild as cw.CfnAlarm;
    instanceStatusCfn.addPropertyOverride('AlarmActions', alarmActions);

    // System Status Check Alarm
    this.systemStatusAlarm = new cw.Alarm(this, 'SystemStatusCheckAlarm', {
      alarmName: `${alarmPrefix}SystemStatusCheck-${instanceId}`,
      alarmDescription:
        'Alerts when EC2 system status check fails (AWS infrastructure issues). Triggers automatic progressive recovery via orchestrator.',
      metric: new cw.Metric({
        namespace: 'AWS/EC2',
        metricName: 'StatusCheckFailed_System',
        dimensionsMap: {
          InstanceId: instanceId,
        },
        period: Duration.minutes(1),
        statistic: 'Maximum',
      }),
      threshold: 1,
      evaluationPeriods: 2,
      comparisonOperator: cw.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: cw.TreatMissingData.BREACHING,
    });
    
    // Set alarm actions directly using escape hatch (bypasses LambdaAction)
    const systemStatusCfn = this.systemStatusAlarm.node.defaultChild as cw.CfnAlarm;
    systemStatusCfn.addPropertyOverride('AlarmActions', alarmActions);

    // OOM Kill Alarm
    this.oomKillAlarm = new cw.Alarm(this, 'OOMKillAlarm', {
      alarmName: `${alarmPrefix}OOMKillDetected-${instanceId}`,
      alarmDescription:
        'Alerts when Out-of-Memory killer terminates processes. Triggers automatic progressive recovery via orchestrator.',
      metric: new cw.Metric({
        namespace: 'EC2',
        metricName: 'oom_kills',
        period: Duration.minutes(1),
        statistic: 'Sum',
      }),
      threshold: 0,
      evaluationPeriods: 1,
      comparisonOperator: cw.ComparisonOperator.GREATER_THAN_THRESHOLD,
      treatMissingData: cw.TreatMissingData.NOT_BREACHING,
    });
    
    // Set alarm actions directly using escape hatch (bypasses LambdaAction)
    const oomKillCfn = this.oomKillAlarm.node.defaultChild as cw.CfnAlarm;
    oomKillCfn.addPropertyOverride('AlarmActions', alarmActions);

    // Mailbox permission alarm
    this.mailboxPermissionAlarm = new cw.Alarm(this, 'MailboxPermissionAlarm', {
      alarmName: `${alarmPrefix}MaildirPermissionDenied-${instanceId}`,
      alarmDescription:
        'Alerts when Dovecot cannot write mailboxes due to permission drift. Triggers automatic recovery orchestration.',
      metric: new cw.Metric({
        namespace: 'EC2',
        metricName: 'mailbox_permission_errors',
        period: Duration.minutes(1),
        statistic: 'Sum',
      }),
      threshold: 0,
      evaluationPeriods: 1,
      comparisonOperator: cw.ComparisonOperator.GREATER_THAN_THRESHOLD,
      treatMissingData: cw.TreatMissingData.NOT_BREACHING,
    });

    const mailboxPermissionCfn = this.mailboxPermissionAlarm.node.defaultChild as cw.CfnAlarm;
    mailboxPermissionCfn.addPropertyOverride('AlarmActions', alarmActions);

    if (enableProactiveHealthAlarms) {
      this.adminEndpointAlarm = new cw.Alarm(this, 'AdminEndpointUnhealthyAlarm', {
        alarmName: `${alarmPrefix}AdminEndpointUnhealthy-${instanceId}`,
        alarmDescription:
          'Alerts when local /admin endpoint health degrades and triggers progressive non-reboot recovery.',
        metric: new cw.Metric({
          namespace: healthMetricsNamespace,
          metricName: 'AdminEndpointHealthy',
          dimensionsMap: {
            InstanceId: instanceId,
            Domain: domainName,
          },
          period: Duration.minutes(1),
          statistic: 'Minimum',
        }),
        threshold: adminEndpointHealthyThreshold,
        evaluationPeriods: 3,
        comparisonOperator: cw.ComparisonOperator.LESS_THAN_THRESHOLD,
        treatMissingData: cw.TreatMissingData.BREACHING,
      });
      const adminEndpointCfn = this.adminEndpointAlarm.node.defaultChild as cw.CfnAlarm;
      adminEndpointCfn.addPropertyOverride('AlarmActions', alarmActions);
    }

    if (enableProactiveHealthAlarms) {
      this.diskUsageCriticalAlarm = new cw.Alarm(this, 'DiskUsageCriticalAlarm', {
        alarmName: `${alarmPrefix}DiskUsageCritical-${instanceId}`,
        alarmDescription:
          'Alerts when root disk usage exceeds critical threshold and triggers progressive non-reboot recovery.',
        metric: new cw.Metric({
          namespace: healthMetricsNamespace,
          metricName: 'DiskUsagePercent',
          dimensionsMap: {
            InstanceId: instanceId,
            Domain: domainName,
          },
          period: Duration.minutes(1),
          statistic: 'Maximum',
        }),
        threshold: diskUsageCriticalPercent,
        evaluationPeriods: 3,
        comparisonOperator: cw.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
        treatMissingData: cw.TreatMissingData.NOT_BREACHING,
      });
      const diskUsageCfn = this.diskUsageCriticalAlarm.node.defaultChild as cw.CfnAlarm;
      diskUsageCfn.addPropertyOverride('AlarmActions', alarmActions);
    }

    if (enableProactiveHealthAlarms) {
      this.mailPrimaryUnhealthyAlarm = new cw.Alarm(this, 'MailPrimaryUnhealthyAlarm', {
        alarmName: `${alarmPrefix}MailPrimaryUnhealthy-${instanceId}`,
        alarmDescription:
          'Alerts when primary mail health checks fail and triggers progressive non-reboot recovery.',
        metric: new cw.Metric({
          namespace: healthMetricsNamespace,
          metricName: 'MailPrimaryHealthy',
          dimensionsMap: {
            InstanceId: instanceId,
            Domain: domainName,
          },
          period: Duration.minutes(1),
          statistic: 'Minimum',
        }),
        threshold: mailPrimaryHealthyThreshold,
        evaluationPeriods: 2,
        comparisonOperator: cw.ComparisonOperator.LESS_THAN_THRESHOLD,
        treatMissingData: cw.TreatMissingData.BREACHING,
      });
      const mailPrimaryCfn = this.mailPrimaryUnhealthyAlarm.node.defaultChild as cw.CfnAlarm;
      mailPrimaryCfn.addPropertyOverride('AlarmActions', alarmActions);
    }
  }
}
