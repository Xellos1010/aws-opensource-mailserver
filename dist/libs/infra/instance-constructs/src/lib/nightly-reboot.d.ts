import { aws_lambda as lambda, aws_events as events } from 'aws-cdk-lib';
import { Construct } from 'constructs';
export interface NightlyRebootProps {
    /** EC2 instance ID to reboot */
    instanceId: string;
    /** Cron schedule (default: "0 8 * * ? *" = 08:00 UTC) */
    schedule?: string;
    /** Description (default: "03:00 ET (08:00 UTC) daily") */
    description?: string;
    /** AWS region */
    region: string;
    /** AWS account ID */
    account: string;
}
/**
 * Creates Lambda function and EventBridge rule for nightly instance reboot
 */
export declare function createNightlyReboot(scope: Construct, id: string, props: NightlyRebootProps): {
    lambda: lambda.Function;
    rule: events.Rule;
};
