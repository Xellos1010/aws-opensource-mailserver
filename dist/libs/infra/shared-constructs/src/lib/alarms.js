import { Construct } from 'constructs';
import { aws_cloudwatch as cw, aws_cloudwatch_actions as cwa, Duration, } from 'aws-cdk-lib';
/**
 * Basic CloudWatch alarm construct that sends notifications to SNS
 */
export class BasicAlarm extends Construct {
    alarm;
    constructor(scope, id, props) {
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
            comparisonOperator: props.comparisonOperator ?? cw.ComparisonOperator.GREATER_THAN_THRESHOLD,
        });
        this.alarm.addAlarmAction(new cwa.SnsAction(props.topic));
    }
}
//# sourceMappingURL=alarms.js.map