import { Construct } from 'constructs';
import { aws_cloudwatch as cw, aws_sns as sns } from 'aws-cdk-lib';
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
export declare class BasicAlarm extends Construct {
    readonly alarm: cw.Alarm;
    constructor(scope: Construct, id: string, props: BasicAlarmProps);
}
