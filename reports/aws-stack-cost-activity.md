# AWS stack cost and activity report

- **Account**: 413988044972 (profile `hepe-admin-mfa`)
- **Cost window (CE)**: `2025-10-01` .. `2026-04-20` (end exclusive), **NetAmortizedCost** + Unblended where noted
- **Activity window**: last **14** days (CloudWatch; running EC2 uses hourly CPU max ≥ **1%** as “busy”)
- **Regions**: us-east-1

## Why numbers may differ from the console

- **NetAmortizedCost** includes amortized RIs/Savings Plans; **Unblended** is list usage. Billing pages, budgets, and tax can all differ from CE.
- **If this account shows ~$0 but you expect ~$120/mo:** confirm you are using the **same account** as the Cost Explorer / Bills page (this report shows the account id in the header). For **Organizations**, open Cost Explorer in the **management (payer) account** or enable **Linked account** visibility; many charges only appear there.
- If this profile is a **member account**, use the **Linked account** section below or re-run with the payer profile.
- **Per-stack spend** needs cost allocation tag `**aws:cloudformation:stack-name`** (Billing → Cost allocation tags). Until then, EC2 lines include **Unblended EC2-compute for that instance over the last 14 days** via `GetCostAndUsageWithResources` (CE cap), not full monthly all-in cost.

## Monthly account totals (Cost Explorer)


| Month (UTC) | NetAmortized | Unblended | Amortized |
| ----------- | ------------ | --------- | --------- |
| 2025-10-01  | $-0.0000     | $-0.0000  | $-0.0000  |
| 2025-11-01  | $-0.0000     | $-0.0000  | $-0.0000  |
| 2025-12-01  | $-0.0000     | $-0.0000  | $-0.0000  |
| 2026-01-01  | $-0.0000     | $-0.0000  | $-0.0000  |
| 2026-02-01  | $-0.0000     | $-0.0000  | $-0.0000  |
| 2026-03-01  | $-0.0000     | $-0.0000  | $-0.0000  |
| 2026-04-01  | $-0.0000     | $-0.0000  | $-0.0000  |


### EC2 compute — per instance (Cost Explorer, resource API)

*Could not load resource-level EC2 costs:* Resource-level data granularity is an opt-in only feature. You can be enable this feature from the PAYER account’s Cost Explorer Settings page.

## Top services — previous calendar month (`2026-03-01` .. `2026-04-01`, NetAmortized)


| Service                                | USD    |
| -------------------------------------- | ------ |
| Amazon Elastic Compute Cloud - Compute | $0.05  |
| EC2 - Other                            | $0.00  |
| Amazon Simple Storage Service          | $0.00  |
| Amazon Elastic Load Balancing          | $0.00  |
| Amazon Route 53                        | $0.00  |
| AmazonCloudWatch                       | $0.00  |
| CloudWatch Events                      | $0.00  |
| Amazon Simple Email Service            | $0.00  |
| Amazon CloudFront                      | $0.00  |
| AWS CloudFormation                     | $0.00  |
| AWS CloudTrail                         | $0.00  |
| AWS Glue                               | $0.00  |
| AWS Key Management Service             | $0.00  |
| Amazon API Gateway                     | $0.00  |
| Amazon Simple Notification Service     | $0.00  |
| Amazon Simple Queue Service            | $0.00  |
| Amazon Virtual Private Cloud           | $0.00  |
| AWS Certificate Manager                | $0.00  |
| Amazon DynamoDB                        | $-0.00 |
| AWS Lambda                             | $-0.00 |
| AWS Secrets Manager                    | $-0.00 |
| Amazon S3 Glacier Deep Archive         | $-0.00 |
| AWS Data Transfer                      | $-0.05 |


## Per-stack cost (requires cost allocation tag on `aws:cloudformation:stack-name`)

*No stack-tagged rows returned (tag likely not activated, or no spend in window).*

## Resource activity by stack (EC2 / Lambda / ALBv2 only)

*Classic ELB, RDS, NAT, S3, etc. are not analyzed here. “Idle” EC2 means no sampled hour exceeded the CPU threshold while **running**.*


| Region    | Stack                                              | Stack $ (tag) | EC2 14d $ (CE) | Type                  | Id / dim                                                          | State   | Activity                                              |
| --------- | -------------------------------------------------- | ------------- | -------------- | --------------------- | ----------------------------------------------------------------- | ------- | ----------------------------------------------------- |
| us-east-1 | askdaokapra-com-mailserver                         | —             | —              | AWS::EC2::Instance    | `i-05a6baaeacacc04d1`                                             | running | last hour ≥1% CPU: 2026-04-05T03:02Z                  |
| us-east-1 | askdaokapra-com-mailserver                         | —             | —              | AWS::Lambda::Function | `NightlyRebootMailServer-askdaokapra-com-mailserver`              | lambda  | Σ invocations 14; last day with traffic: 2026-04-05   |
| us-east-1 | askdaokapra-com-mailserver                         | —             | —              | AWS::Lambda::Function | `SMTPCredentialsLambdaFunction-askdaokapra-com-mailserver`        | lambda  | 0 invocations (14d)                                   |
| us-east-1 | emc-notary-email-service                           | —             | —              | AWS::Lambda::Function | `emc-notary-email-service-ApiHandler5E7490E8-se26hYs7MR9b`        | lambda  | Σ invocations 1; last day with traffic: 2026-04-08    |
| us-east-1 | emc-notary-email-service                           | —             | —              | AWS::Lambda::Function | `emc-notary-email-service-LogRetentionaae0aa3c5b4d4-RCbFVm28JZez` | lambda  | 0 invocations (14d)                                   |
| us-east-1 | emc-notary-email-service-staging                   | —             | —              | AWS::Lambda::Function | `emc-notary-email-service-stagin-ApiHandler5E7490E8-FbAnjugu3GB4` | lambda  | Σ invocations 1344; last day with traffic: 2026-04-05 |
| us-east-1 | emc-notary-email-service-staging                   | —             | —              | AWS::Lambda::Function | `emc-notary-email-service--CustomS3AutoDeleteObject-QPvJLrG1d1mb` | lambda  | 0 invocations (14d)                                   |
| us-east-1 | emc-notary-email-service-staging                   | —             | —              | AWS::Lambda::Function | `emc-notary-email-service--GoogleProfileExecutor98A-Oo71jB6ZEL4S` | lambda  | 0 invocations (14d)                                   |
| us-east-1 | emc-notary-outbound-dialer                         | —             | —              | AWS::Lambda::Function | `emc-notary-outbound-diale-OutboundDialerHandlerD5A-SAGRrgNRXDYB` | lambda  | Σ invocations 14; last day with traffic: 2026-04-06   |
| us-east-1 | emc-notary-web                                     | —             | —              | AWS::EC2::Instance    | `i-02e3785df093e84c9`                                             | running | last hour ≥1% CPU: 2026-04-05T06:02Z                  |
| us-east-1 | emcnotary-com-mailserver-core                      | —             | —              | AWS::Lambda::Function | `emcnotary-com-mailserver--CustomS3AutoDeleteObject-aafoc9qDLJuj` | lambda  | 0 invocations (14d)                                   |
| us-east-1 | emcnotary-com-mailserver-core                      | —             | —              | AWS::Lambda::Function | `ReverseDnsLambdaFunction-emcnotary-com-mailserver-core`          | lambda  | 0 invocations (14d)                                   |
| us-east-1 | emcnotary-com-mailserver-core                      | —             | —              | AWS::Lambda::Function | `emcnotary-com-mailserver--ReverseDnsProviderframew-9ugVgBg9grLi` | lambda  | 0 invocations (14d)                                   |
| us-east-1 | emcnotary-com-mailserver-core                      | —             | —              | AWS::Lambda::Function | `SMTPCredentialsLambdaFunction-emcnotary-com-mailserver-core`     | lambda  | 0 invocations (14d)                                   |
| us-east-1 | emcnotary-com-mailserver-instance                  | —             | —              | AWS::EC2::Instance    | `i-0518bce9a3056e4a6`                                             | running | last hour ≥1% CPU: 2026-04-05T03:02Z                  |
| us-east-1 | emcnotary-com-mailserver-observability-maintenance | —             | —              | AWS::Lambda::Function | `emcnotary-com-mailserver--MailserverObservabilityM-Anft4n7Tu6qN` | lambda  | Σ invocations 14; last day with traffic: 2026-04-05   |
| us-east-1 | emcnotary-com-mailserver-observability-maintenance | —             | —              | AWS::Lambda::Function | `emcnotary-com-mailserver--MailserverObservabilityM-3JOpNRSfaDSh` | lambda  | Σ invocations 4045; last day with traffic: 2026-04-05 |
| us-east-1 | emcnotary-com-mailserver-observability-maintenance | —             | —              | AWS::Lambda::Function | `emcnotary-com-mailserver--MailserverObservabilityM-Pk2x9A2u7s7g` | lambda  | Σ invocations 13; last day with traffic: 2026-04-05   |
| us-east-1 | emcnotary-com-mailserver-observability-maintenance | —             | —              | AWS::Lambda::Function | `emcnotary-com-mailserver--MailserverObservabilityM-4dExDVefBFLf` | lambda  | 0 invocations (14d)                                   |
| us-east-1 | emcnotary-com-mailserver-observability-maintenance | —             | —              | AWS::Lambda::Function | `emcnotary-com-mailserver--MailserverObservabilityM-pMuhuV31huv9` | lambda  | 0 invocations (14d)                                   |
| us-east-1 | emcnotary-com-mailserver-observability-maintenance | —             | —              | AWS::Lambda::Function | `emcnotary-com-mailserver--MailserverObservabilityM-sXCOXxOkvQ49` | lambda  | 0 invocations (14d)                                   |
| us-east-1 | emcnotary-com-mailserver-observability-maintenance | —             | —              | AWS::Lambda::Function | `emcnotary-com-mailserver--MailserverObservabilityM-1HbRpjLo45Gd` | lambda  | Σ invocations 336; last day with traffic: 2026-04-05  |
| us-east-1 | EmcNotaryApi-staging                               | —             | —              | AWS::Lambda::Function | `EmcNotaryApi-staging-AppointmentConfirmationFn6D0F-30X8n5qeTFEu` | lambda  | 0 invocations (14d)                                   |
| us-east-1 | EmcNotaryApi-staging                               | —             | —              | AWS::Lambda::Function | `EmcNotaryApi-staging-CalendarToolFn3817EB25-18E4BymkOJx0`        | lambda  | 0 invocations (14d)                                   |
| us-east-1 | EmcNotaryApi-staging                               | —             | —              | AWS::Lambda::Function | `EmcNotaryApi-staging-EmailSenderFnEBC562B4-nDclDuXLeV7I`         | lambda  | 0 invocations (14d)                                   |
| us-east-1 | EmcNotaryApi-staging                               | —             | —              | AWS::Lambda::Function | `EmcNotaryApi-staging-EmailToolFn91BFEF51-1wFqLN3xJ9AJ`           | lambda  | 0 invocations (14d)                                   |
| us-east-1 | EmcNotaryApi-staging                               | —             | —              | AWS::Lambda::Function | `EmcNotaryApi-staging-LogRetentionaae0aa3c5b4d4f87b-FFQKq7MnGbhq` | lambda  | 0 invocations (14d)                                   |
| us-east-1 | EmcNotaryApi-staging                               | —             | —              | AWS::Lambda::Function | `EmcNotaryApi-staging-SesDeliveryLoggerFn2A7CD10C-vHnGnIsTfMKg`   | lambda  | 0 invocations (14d)                                   |
| us-east-1 | hepefoundation-org-emergency-alarms                | —             | —              | AWS::Lambda::Function | `mail-recovery-orchestrator-hepefoundation-org-emergency-alarms`  | lambda  | Σ invocations 36; last day with traffic: 2026-04-05   |
| us-east-1 | hepefoundation-org-external-monitoring             | —             | —              | AWS::Lambda::Function | `proactive-health-check-hepefoundation-org-external-monitoring`   | lambda  | Σ invocations 4032; last day with traffic: 2026-04-05 |
| us-east-1 | hepefoundation-org-mail-health-check               | —             | —              | AWS::Lambda::Function | `mail-health-check-hepefoundation-org-mail-health-check`          | lambda  | Σ invocations 40; last day with traffic: 2026-04-05   |
| us-east-1 | hepefoundation-org-mailserver                      | —             | —              | AWS::EC2::Instance    | `i-0a1ff83f513575ed4`                                             | running | last hour ≥1% CPU: 2026-04-05T03:02Z                  |
| us-east-1 | hepefoundation-org-mailserver                      | —             | —              | AWS::Lambda::Function | `NightlyRebootMailServer-hepefoundation-org-mailserver`           | lambda  | Σ invocations 14; last day with traffic: 2026-04-05   |
| us-east-1 | hepefoundation-org-mailserver                      | —             | —              | AWS::Lambda::Function | `SMTPCredentialsLambdaFunction-hepefoundation-org-mailserver`     | lambda  | 0 invocations (14d)                                   |
| us-east-1 | hepefoundation-org-service-restart                 | —             | —              | AWS::Lambda::Function | `service-restart-hepefoundation-org-service-restart`              | lambda  | Σ invocations 28; last day with traffic: 2026-04-05   |
| us-east-1 | hepefoundation-org-stop-start-helper               | —             | —              | AWS::Lambda::Function | `StopStartLambda-hepefoundation-org-stop-start-helper`            | lambda  | Σ invocations 41; last day with traffic: 2026-04-05   |
| us-east-1 | hepefoundation-org-system-reset                    | —             | —              | AWS::Lambda::Function | `system-reset-hepefoundation-org-system-reset`                    | lambda  | Σ invocations 75; last day with traffic: 2026-04-05   |
| us-east-1 | hepefoundation-org-system-stats                    | —             | —              | AWS::Lambda::Function | `system-stats-hepefoundation-org-system-stats`                    | lambda  | 0 invocations (14d)                                   |


