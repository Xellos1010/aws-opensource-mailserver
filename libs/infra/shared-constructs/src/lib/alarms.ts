import { Construct } from 'constructs';
import {
  aws_cloudwatch as cw,
  aws_cloudwatch_actions as cwa,
  aws_sns as sns,
  Duration,
} from 'aws-cdk-lib';

/**
 * Properties for creating a basic CloudWatch alarm
 */
export interface BasicAlarmProps {
  /** SNS topic to send alarm notifications to */
  topic: sns.ITopic;
  /** CloudWatch metric namespace */
  namespace: string;
  /** CloudWatch metric name */
  metricName: string;
  /** Alarm threshold value */
  threshold: number;
  /** Evaluation period (default: 1) */
  evaluationPeriods?: number;
  /** Comparison operator (default: GreaterThanThreshold) */
  comparisonOperator?: cw.ComparisonOperator;
}

/**
 * Basic CloudWatch alarm construct that sends notifications to SNS
 */
export class BasicAlarm extends Construct {
  public readonly alarm: cw.Alarm;

  constructor(scope: Construct, id: string, props: BasicAlarmProps) {
    super(scope, id);

    const metric = new cw.Metric({
      namespace: props.namespace,
      metricName: props.metricName,
      period: Duration.minutes(1),
    });

    this.alarm = new cw.Alarm(this, 'Alarm', {
      metric,
      threshold: props.threshold,
      evaluationPeriods: props.evaluationPeriods ?? 1,
      comparisonOperator:
        props.comparisonOperator ?? cw.ComparisonOperator.GREATER_THAN_THRESHOLD,
    });

    this.alarm.addAlarmAction(new cwa.SnsAction(props.topic));
  }
}

