import { Construct } from 'constructs';
import {
  Duration,
  aws_cloudwatch as cw,
  aws_cloudwatch_actions as cwa,
  aws_sns as sns,
  aws_events as events,
  aws_lambda as lambda,
} from 'aws-cdk-lib';
import { createDailySystemCleanup } from './daily-system-cleanup';
import { MailHealthCheckLambda } from './mail-health-check-lambda';
import { ServiceRestartLambda } from './service-restart-lambda';
import { SystemResetLambda } from './system-reset-lambda';
import { StopStartHelperLambda } from './stop-start-helper-lambda';
import { RecoveryOrchestratorLambda } from './recovery-orchestrator-lambda';
import { EmergencyAlarms } from './emergency-alarms';
import { SystemStatsLambda } from './system-stats-lambda';
import { ExternalMonitoring } from './external-monitoring';

export interface MailserverObservabilityMaintenanceProps {
  domainName: string;
  instanceId: string;
  instanceDns: string;
  instanceStackName: string;
  alarmsTopicArn: string;
  /** Daily non-critical cleanup schedule (EventBridge expression). */
  dailyCleanupScheduleExpression?: string;
  /** Daily cleanup rule description. */
  dailyCleanupDescription?: string;
  /** Optional scheduled stop/start expression. Leave unset to disable scheduled restarts. */
  stopStartScheduleExpression?: string;
  /**
   * @deprecated Replaced by dailyCleanupScheduleExpression.
   * Legacy six-field cron values are converted to an EventBridge cron expression.
   */
  nightlyRebootSchedule?: string;
  /**
   * @deprecated Replaced by dailyCleanupDescription.
   */
  nightlyRebootDescription?: string;
  healthCheckScheduleExpression?: string;
  systemStatsScheduleExpression?: string;
  /** Optional prefix for explicitly named resources (alarms) */
  alarmNamePrefix?: string;
}

/**
 * Full observability and maintenance package for Mailserver EC2 stacks.
 * This construct is designed to be deployed in a dedicated stack so that
 * operational hardening can evolve without replacing the instance stack.
 */
export class MailserverObservabilityMaintenance extends Construct {
  public readonly alarmsTopic: sns.ITopic;
  public readonly dailyCleanupLambda: lambda.Function;
  public readonly dailyCleanupRule: events.Rule;
  /** @deprecated Alias retained for compatibility. */
  public readonly nightlyRebootLambda: lambda.Function;
  /** @deprecated Alias retained for compatibility. */
  public readonly nightlyRebootRule: events.Rule;
  public readonly mailHealthCheck: MailHealthCheckLambda;
  public readonly serviceRestart: ServiceRestartLambda;
  public readonly systemReset: SystemResetLambda;
  public readonly stopStartHelper: StopStartHelperLambda;
  public readonly recoveryOrchestrator: RecoveryOrchestratorLambda;
  public readonly emergencyAlarms: EmergencyAlarms;
  public readonly systemStats: SystemStatsLambda;
  public readonly externalMonitoring?: ExternalMonitoring;
  public readonly memoryHighAlarm: cw.Alarm;
  public readonly swapHighAlarm: cw.Alarm;

  constructor(scope: Construct, id: string, props: MailserverObservabilityMaintenanceProps) {
    super(scope, id);

    const {
      domainName,
      instanceId,
      instanceDns,
      instanceStackName,
      alarmsTopicArn,
      dailyCleanupScheduleExpression,
      dailyCleanupDescription,
      stopStartScheduleExpression,
      nightlyRebootSchedule,
      nightlyRebootDescription,
      healthCheckScheduleExpression = 'rate(5 minutes)',
      systemStatsScheduleExpression = 'rate(1 hour)',
      alarmNamePrefix,
    } = props;

    this.alarmsTopic = sns.Topic.fromTopicArn(this, 'AlarmsTopic', alarmsTopicArn);

    const cleanupScheduleExpression =
      dailyCleanupScheduleExpression || (nightlyRebootSchedule ? `cron(${nightlyRebootSchedule})` : undefined);
    const cleanupDescription =
      dailyCleanupDescription ||
      nightlyRebootDescription ||
      'Daily non-critical cleanup for Mail-in-a-Box instance at 02:30 ET (07:30 UTC)';

    const { lambda: cleanupLambda, rule: cleanupRule } = createDailySystemCleanup(
      this,
      'DailySystemCleanup',
      {
        instanceId,
        scheduleExpression: cleanupScheduleExpression,
        description: cleanupDescription,
      }
    );
    this.dailyCleanupLambda = cleanupLambda;
    this.dailyCleanupRule = cleanupRule;
    this.nightlyRebootLambda = cleanupLambda;
    this.nightlyRebootRule = cleanupRule;

    this.mailHealthCheck = new MailHealthCheckLambda(this, 'MailHealthCheck', {
      instanceId,
      domainName,
      scheduleExpression: healthCheckScheduleExpression,
      notificationTopic: this.alarmsTopic,
    });

    this.serviceRestart = new ServiceRestartLambda(this, 'ServiceRestart', {
      instanceId,
      domainName,
    });

    this.systemReset = new SystemResetLambda(this, 'SystemReset', {
      instanceId,
      domainName,
    });

    this.stopStartHelper = new StopStartHelperLambda(this, 'StopStartHelper', {
      mailServerStackName: instanceStackName,
      domainName,
      mailHealthCheckLambdaName: this.mailHealthCheck.lambda.functionName,
      serviceRestartLambdaName: this.serviceRestart.lambda.functionName,
      scheduleExpression: stopStartScheduleExpression,
      maintenanceWindowEnabled: Boolean(stopStartScheduleExpression),
      maintenanceWindowStartHour: 8,
      maintenanceWindowEndHour: 8.25,
    });

    this.recoveryOrchestrator = new RecoveryOrchestratorLambda(this, 'RecoveryOrchestrator', {
      mailHealthCheckLambdaArn: this.mailHealthCheck.lambda.functionArn,
      systemResetLambdaArn: this.systemReset.lambda.functionArn,
      serviceRestartLambdaArn: this.serviceRestart.lambda.functionArn,
      stopStartLambdaArn: this.stopStartHelper.lambda.functionArn,
      domainName,
    });

    this.emergencyAlarms = new EmergencyAlarms(this, 'EmergencyAlarms', {
      instanceId,
      recoveryOrchestratorLambda: this.recoveryOrchestrator.lambda,
      notificationTopic: this.alarmsTopic,
      domainName,
      alarmNamePrefix,
    });

    const alarmPrefix = alarmNamePrefix ? `${alarmNamePrefix}-` : '';

    this.systemStats = new SystemStatsLambda(this, 'SystemStats', {
      instanceId,
      domainName,
      scheduleExpression: systemStatsScheduleExpression,
    });

    // Temporarily disabled while external DNS/health-check prerequisites are stabilized.
    // Keeps core recovery automation active without Route53 health-check coupling.
    this.externalMonitoring = undefined;

    this.memoryHighAlarm = new cw.Alarm(this, 'MemoryHighAlarm', {
      alarmName: `${alarmPrefix}MemHigh-${instanceId}`,
      metric: new cw.Metric({
        namespace: 'CWAgent',
        metricName: 'mem_used_percent',
        dimensionsMap: {
          InstanceId: instanceId,
        },
        period: Duration.minutes(1),
        statistic: 'Average',
      }),
      threshold: 85,
      evaluationPeriods: 5,
      comparisonOperator: cw.ComparisonOperator.GREATER_THAN_THRESHOLD,
      treatMissingData: cw.TreatMissingData.NOT_BREACHING,
      alarmDescription: 'Alerts when memory usage exceeds 85% for 5 consecutive minutes',
    });
    this.memoryHighAlarm.addAlarmAction(new cwa.SnsAction(this.alarmsTopic));

    this.swapHighAlarm = new cw.Alarm(this, 'SwapHighAlarm', {
      alarmName: `${alarmPrefix}SwapHigh-${instanceId}`,
      metric: new cw.Metric({
        namespace: 'CWAgent',
        metricName: 'swap_used_percent',
        dimensionsMap: {
          InstanceId: instanceId,
        },
        period: Duration.minutes(1),
        statistic: 'Average',
      }),
      threshold: 50,
      evaluationPeriods: 5,
      comparisonOperator: cw.ComparisonOperator.GREATER_THAN_THRESHOLD,
      treatMissingData: cw.TreatMissingData.NOT_BREACHING,
      alarmDescription: 'Alerts when swap usage exceeds 50% for 5 consecutive minutes',
    });
    this.swapHighAlarm.addAlarmAction(new cwa.SnsAction(this.alarmsTopic));
  }
}
