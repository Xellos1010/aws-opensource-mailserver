# AWS CloudFormation and cost report

- Generated: 2026-04-19T02:56:55.165Z
- Account: 413988044972
- Cost window: 2026-03-21 .. 2026-04-20 (30 day lookback; CE end date is exclusive)
- Regions scanned: ap-northeast-1, ap-northeast-2, ap-northeast-3, ap-south-1, ap-southeast-1, ap-southeast-2, ca-central-1, eu-central-1, eu-north-1, eu-west-1, eu-west-2, eu-west-3, sa-east-1, us-east-1, us-east-2, us-west-1, us-west-2

## Caveats

- Orphan detection uses only stacks **not** in `DELETE_COMPLETE` as the live name/id set; resources tagged with an old deleted stack id are reported as `missing_stack_id`.
- Orphan detection only covers resources returned by Resource Groups Tagging API that still have `aws:cloudformation:stack-name` but no matching active stack in the same region.
- Untagged resources or resources never managed by CloudFormation are not listed here.
- Cost Explorer must be enabled for the payer account; data can lag up to 24 hours.
- DELETE_FAILED and UPDATE_ROLLBACK_COMPLETE stacks remain billable until resources are removed or the stack is fixed.

## Stacks by status


| Status                   | Count |
| ------------------------ | ----- |
| DELETE_COMPLETE          | 24    |
| UPDATE_COMPLETE          | 19    |
| CREATE_COMPLETE          | 4     |
| UPDATE_ROLLBACK_COMPLETE | 3     |


## CloudFormation stacks (non-deleted)

*Only stacks not in `DELETE_COMPLETE`. Deleted runs of the same stack name appear under history.*


| Region    | Stack                                              | Status                   | Resources | Created    |
| --------- | -------------------------------------------------- | ------------------------ | --------- | ---------- |
| us-east-1 | AskDaoCore-staging                                 | CREATE_COMPLETE          | —         | 2026-02-14 |
| us-east-1 | askdaokapra-com-mailserver                         | UPDATE_COMPLETE          | —         | 2025-09-15 |
| us-east-1 | CDKToolkit                                         | UPDATE_COMPLETE          | —         | 2025-11-07 |
| us-east-1 | common-utils-layer-dev                             | UPDATE_COMPLETE          | —         | 2024-09-28 |
| us-east-1 | dynamodb-layer-dev                                 | CREATE_COMPLETE          | —         | 2024-09-28 |
| us-east-1 | emc-notary-email-service                           | UPDATE_COMPLETE          | —         | 2026-01-26 |
| us-east-1 | emc-notary-email-service-staging                   | UPDATE_COMPLETE          | —         | 2026-03-12 |
| us-east-1 | emc-notary-outbound-dialer                         | UPDATE_COMPLETE          | —         | 2026-03-11 |
| us-east-1 | emc-notary-telephony                               | UPDATE_ROLLBACK_COMPLETE | —         | 2026-02-09 |
| us-east-1 | emc-notary-telephony-staging                       | UPDATE_ROLLBACK_COMPLETE | —         | 2026-03-12 |
| us-east-1 | emc-notary-web                                     | UPDATE_COMPLETE          | —         | 2026-02-09 |
| us-east-1 | emcnotary-com-mailserver-core                      | UPDATE_COMPLETE          | —         | 2025-11-09 |
| us-east-1 | emcnotary-com-mailserver-instance                  | UPDATE_COMPLETE          | —         | 2025-11-09 |
| us-east-1 | emcnotary-com-mailserver-observability-maintenance | UPDATE_COMPLETE          | —         | 2026-02-20 |
| us-east-1 | EmcNotaryApi-staging                               | UPDATE_COMPLETE          | —         | 2026-01-25 |
| us-east-1 | EmcNotaryCore-staging                              | UPDATE_COMPLETE          | —         | 2026-01-25 |
| us-east-1 | hepefoundation-org-emergency-alarms                | UPDATE_COMPLETE          | —         | 2025-11-14 |
| us-east-1 | hepefoundation-org-external-monitoring             | CREATE_COMPLETE          | —         | 2026-01-06 |
| us-east-1 | hepefoundation-org-mail-health-check               | UPDATE_COMPLETE          | —         | 2025-11-26 |
| us-east-1 | hepefoundation-org-mailserver                      | UPDATE_ROLLBACK_COMPLETE | —         | 2025-07-01 |
| us-east-1 | hepefoundation-org-service-restart                 | UPDATE_COMPLETE          | —         | 2025-12-10 |
| us-east-1 | hepefoundation-org-stop-start-helper               | UPDATE_COMPLETE          | —         | 2025-11-11 |
| us-east-1 | hepefoundation-org-system-reset                    | UPDATE_COMPLETE          | —         | 2025-12-10 |
| us-east-1 | hepefoundation-org-system-stats                    | UPDATE_COMPLETE          | —         | 2025-12-10 |
| us-east-1 | trinitycomprehensivehealthcare-com-website         | UPDATE_COMPLETE          | —         | 2025-06-30 |
| us-east-1 | visomarketinggroup-com-website                     | CREATE_COMPLETE          | —         | 2026-03-27 |


## Stacks to review (not CREATE_COMPLETE / UPDATE_COMPLETE)


| Region    | Stack                         | Status                   | Resources |
| --------- | ----------------------------- | ------------------------ | --------- |
| us-east-1 | emc-notary-telephony          | UPDATE_ROLLBACK_COMPLETE | —         |
| us-east-1 | emc-notary-telephony-staging  | UPDATE_ROLLBACK_COMPLETE | —         |
| us-east-1 | hepefoundation-org-mailserver | UPDATE_ROLLBACK_COMPLETE | —         |


## DELETE_COMPLETE history

*24 record(s). These do not hold CloudFormation-managed resources; same stack name can repeat after deletes.*

*Omitted from markdown for size. Use `--include-deleted-stacks` or read `deletedStackHistory` in JSON.*

## Likely orphan resources (stale CloudFormation tags)

*None detected for scanned regions.*

## Costs by AWS service (Cost Explorer)

*Costs are summed UnblendedCost (DAILY, Cost Explorer) by AWS service. Per-stack breakdown needs activating `aws:cloudformation:stack-name` as a cost allocation tag.*

**Total (approx):** ~$-0.0000


| Service                                | USD   |
| -------------------------------------- | ----- |
| Amazon Elastic Compute Cloud - Compute | 0.04  |
| Amazon Simple Storage Service          | 0.00  |
| EC2 - Other                            | 0.00  |
| Amazon Elastic Load Balancing          | 0.00  |
| Amazon Route 53                        | 0.00  |
| Amazon Simple Email Service            | 0.00  |
| Amazon CloudFront                      | 0.00  |
| CloudWatch Events                      | 0.00  |
| AWS CloudTrail                         | 0.00  |
| AWS Glue                               | 0.00  |
| Amazon Simple Notification Service     | 0.00  |
| Amazon Simple Queue Service            | 0.00  |
| Amazon Virtual Private Cloud           | 0.00  |
| AWS Key Management Service             | 0.00  |
| AWS Certificate Manager                | 0.00  |
| AWS CloudFormation                     | 0.00  |
| Amazon API Gateway                     | 0.00  |
| Amazon DynamoDB                        | -0.00 |
| AWS Lambda                             | -0.00 |
| AmazonCloudWatch                       | -0.00 |
| AWS Secrets Manager                    | -0.00 |
| Amazon S3 Glacier Deep Archive         | -0.00 |
| AWS Data Transfer                      | -0.04 |
