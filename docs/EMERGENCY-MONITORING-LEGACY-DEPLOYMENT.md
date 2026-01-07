# Emergency Monitoring for Legacy HEPE Stack

## Quick Start

Deploy emergency monitoring for the legacy `hepefoundation-org-mailserver` CloudFormation stack:

```bash
./Archive/hepefoundation/deploy-emergency-monitoring.sh
```

This will:
1. Verify the legacy stack exists
2. Discover the instance ID
3. Deploy the emergency monitoring CDK stack
4. Create the restart Lambda function

## After Deployment

Update existing CloudWatch alarms to trigger the Lambda:

```bash
./Archive/hepefoundation/update-alarms-with-lambda.sh
```

## What Gets Deployed

### Emergency Monitoring Stack
- **Stack Name**: `hepefoundation-org-emergency-monitoring`
- **Lambda Function**: `emergency-restart-hepefoundation-org`
- **SNS Topic**: `ec2-emergency-events-hepefoundation-org` (or uses existing from legacy stack)

### Lambda Function
- **Discovers instance ID** from legacy stack outputs at runtime
- **Performs stop-and-start** cycle when triggered
- **Handles all edge cases** (pending, stopping, etc.)
- **Logs to CloudWatch** for monitoring

## How It Works

1. **Alarm Triggers** - Existing CloudWatch alarms (from legacy stack) enter ALARM state
2. **Lambda Invoked** - Alarm action triggers the emergency restart Lambda
3. **Instance Discovery** - Lambda queries legacy stack to get instance ID
4. **Stop Instance** - Lambda stops instance and waits for stopped state
5. **Start Instance** - Lambda starts instance and waits for running state
6. **Notification** - SNS sends email (if subscribed)

## Manual Deployment

If you prefer to deploy manually:

```bash
# Build the stack
pnpm nx run cdk-emcnotary-instance:emergency-monitoring-legacy:build

# Synthesize (preview)
pnpm nx run cdk-emcnotary-instance:emergency-monitoring-legacy:synth \
  DOMAIN=hepefoundation.org \
  LEGACY_STACK_NAME=hepefoundation-org-mailserver

# Deploy
pnpm nx run cdk-emcnotary-instance:emergency-monitoring-legacy:deploy \
  DOMAIN=hepefoundation.org \
  LEGACY_STACK_NAME=hepefoundation-org-mailserver
```

## Configuration

### Environment Variables

- `DOMAIN` - Domain name (default: `hepefoundation.org`)
- `LEGACY_STACK_NAME` - Legacy CloudFormation stack name (default: `{domain}-mailserver`)
- `ALARMS_TOPIC_ARN` - Optional: Existing SNS topic ARN to use

### AWS Profile

The deployment script uses `hepe-admin-mfa` profile. To use a different profile:

```bash
export AWS_PROFILE=your-profile
./Archive/hepefoundation/deploy-emergency-monitoring.sh
```

## Verifying Deployment

### Check Stack Outputs

```bash
aws cloudformation describe-stacks \
  --profile hepe-admin-mfa \
  --stack-name hepefoundation-org-emergency-monitoring \
  --query 'Stacks[0].Outputs'
```

### Check Lambda Function

```bash
aws lambda get-function \
  --profile hepe-admin-mfa \
  --function-name emergency-restart-hepefoundation-org
```

### Test Lambda (Dry Run)

```bash
# Get instance ID first
INSTANCE_ID=$(aws cloudformation describe-stacks \
  --profile hepe-admin-mfa \
  --stack-name hepefoundation-org-mailserver \
  --query 'Stacks[0].Outputs[?OutputKey==`RestorePrefix`].OutputValue' \
  --output text)

# Invoke Lambda with test event
aws lambda invoke \
  --profile hepe-admin-mfa \
  --function-name emergency-restart-hepefoundation-org \
  --payload '{"AlarmName":"Test","NewStateReason":"Manual test"}' \
  /tmp/lambda-response.json

cat /tmp/lambda-response.json
```

## Troubleshooting

### Stack Not Found

If the legacy stack is not found:
```bash
# Verify stack exists
aws cloudformation describe-stacks \
  --profile hepe-admin-mfa \
  --stack-name hepefoundation-org-mailserver
```

### Lambda Can't Find Instance

The Lambda discovers the instance ID from stack outputs. Verify the legacy stack has:
- `RestorePrefix` output (contains instance ID), OR
- `InstanceId` output

### Alarms Not Updated

If `update-alarms-with-lambda.sh` fails:
1. Verify emergency monitoring stack is deployed
2. Check alarm names match pattern: `{AlarmType}-{InstanceId}`
3. Manually update alarms via AWS Console

## Related Files

- `apps/cdk-emc-notary/instance/src/stacks/emergency-monitoring-legacy-stack.ts` - Stack definition
- `apps/cdk-emc-notary/instance/src/emergency-monitoring-legacy-main.ts` - CDK app entry
- `Archive/hepefoundation/deploy-emergency-monitoring.sh` - Deployment script
- `Archive/hepefoundation/update-alarms-with-lambda.sh` - Alarm update script














