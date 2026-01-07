# Emergency Monitoring and Auto-Restart Solution

## Overview

This solution provides **automatic instance restart** when critical failures are detected, plus **manual Nx tasks** for HEPE instance management.

## Features

### 1. Automatic Emergency Restart

A Lambda function automatically restarts EC2 instances when:
- **Instance Status Check fails** (instance-level issues)
- **System Status Check fails** (AWS infrastructure issues)  
- **OOM Kill detected** (Out-of-Memory conditions)

The Lambda performs a **stop-and-start cycle** (not just reboot) to fully reset the instance.

### 2. Manual Instance Management

Nx tasks for HEPE foundation instance operations:
- `hepe:stop-start` - Stop and restart the instance
- `hepe:stop` - Stop the instance
- `hepe:start` - Start the instance

## Deployment

### Deploy Emergency Monitoring

The emergency restart Lambda is automatically included when you deploy the instance stack:

```bash
# Deploy instance stack (includes emergency restart Lambda)
cd apps/cdk-emc-notary/instance
FEATURE_CDK_EMCNOTARY_STACKS_ENABLED=1 DOMAIN=hepefoundation.org \
  pnpm nx deploy
```

The Lambda will be automatically wired to:
- Instance Status Check Alarm
- System Status Check Alarm
- OOM Kill Alarm

### How It Works

1. **Alarm Triggers** - When a critical alarm enters ALARM state
2. **Lambda Invoked** - CloudWatch automatically invokes the emergency restart Lambda
3. **Stop Instance** - Lambda stops the instance and waits for stopped state
4. **Start Instance** - Lambda starts the instance and waits for running state
5. **Notification** - SNS topic sends email notification (if subscribed)

## Manual Operations

### Stop and Restart HEPE Instance

```bash
# Stop and restart (full cycle)
pnpm nx run ops-runner:hepe:stop-start
```

### Stop HEPE Instance

```bash
# Stop only
pnpm nx run ops-runner:hepe:stop
```

### Start HEPE Instance

```bash
# Start only
pnpm nx run ops-runner:hepe:start
```

### Using Domain-Based Lookup

You can also use the generic EC2 commands with domain names:

```bash
# Stop and restart any domain
pnpm nx run ops-runner:run -- ec2:stop-start hepefoundation.org

# Stop any domain
pnpm nx run ops-runner:run -- ec2:stop hepefoundation.org

# Start any domain
pnpm nx run ops-runner:run -- ec2:start hepefoundation.org
```

## Lambda Function Details

### Function Name
- Pattern: `emergency-restart-{domain}`
- Example: `emergency-restart-hepefoundation-org`

### Timeout
- **20 minutes** - Allows time for full stop/start cycle

### Permissions
- `ec2:StopInstances` - Stop the instance
- `ec2:StartInstances` - Start the instance
- `ec2:DescribeInstances` - Check instance state
- `ec2:DescribeInstanceStatus` - Check status checks

### Environment Variables
- `INSTANCE_ID` - The EC2 instance ID to manage
- `DOMAIN_NAME` - Domain name for logging

## Monitoring

### Check Lambda Execution

View Lambda logs in CloudWatch:
```bash
aws logs tail /aws/lambda/emergency-restart-hepefoundation-org --follow
```

### Check Alarm States

Use the health check script:
```bash
./Archive/hepefoundation/check-instance-health.sh
```

### View Recent Restarts

Check CloudWatch Logs Insights:
```sql
fields @timestamp, @message
| filter @message like /Emergency restart/
| sort @timestamp desc
| limit 20
```

## Safety Features

### Idempotent Operations
- If instance is already stopping, Lambda waits
- If instance is already starting, Lambda waits
- If instance is already in desired state, no action taken

### State Validation
- Lambda checks current state before each operation
- Waits for state transitions to complete
- Handles edge cases (pending, stopping, etc.)

### Error Handling
- Errors are logged to CloudWatch Logs
- Lambda returns error status for monitoring
- SNS notifications still sent even if restart fails

## Troubleshooting

### Lambda Not Triggering

1. **Check Alarm State**:
   ```bash
   aws cloudwatch describe-alarms --alarm-names InstanceStatusCheck-{instanceId}
   ```

2. **Verify Lambda Permissions**:
   ```bash
   aws lambda get-policy --function-name emergency-restart-{domain}
   ```

3. **Check Lambda Logs**:
   ```bash
   aws logs tail /aws/lambda/emergency-restart-{domain} --follow
   ```

### Instance Not Restarting

1. **Check Instance State**:
   ```bash
   aws ec2 describe-instances --instance-ids {instanceId}
   ```

2. **Verify IAM Permissions**:
   - Lambda role needs EC2 stop/start permissions
   - Check role: `EmergencyRestartLambdaRole`

3. **Review Lambda Timeout**:
   - Default is 20 minutes
   - Increase if instance takes longer to start

### Manual Override

If automatic restart is not working, use manual Nx tasks:

```bash
# Emergency manual restart
pnpm nx run ops-runner:hepe:stop-start
```

## Configuration

### Disable Auto-Restart

To disable automatic restart for specific alarms, remove the Lambda action:

```typescript
// In instance-stack.ts, comment out:
// instanceStatusAlarm.addAlarmAction(new cwa.LambdaAction(emergencyRestartLambda));
```

### Adjust Restart Triggers

Modify which alarms trigger restart in `instance-stack.ts`:

```typescript
// Add Lambda action to any alarm
memoryHighAlarm.addAlarmAction(new cwa.LambdaAction(emergencyRestartLambda));
```

## Related Files

- `apps/cdk-emc-notary/instance/src/stacks/instance-stack.ts` - Emergency restart Lambda
- `apps/ops-runner/src/main.ts` - EC2 command handlers
- `apps/ops-runner/project.json` - HEPE-specific Nx tasks
- `libs/admin/admin-ec2/src/lib/ec2.ts` - EC2 operation library
- `docs/OOM-MONITORING-SOLUTION.md` - Alarm configuration details

## Best Practices

1. **Monitor Lambda Executions** - Set up CloudWatch alarms for Lambda errors
2. **Review Restart Frequency** - If restarting too often, investigate root cause
3. **Test Manual Operations** - Verify Nx tasks work before emergency
4. **Subscribe to SNS** - Get notified of all automatic restarts
5. **Document Incidents** - Track what caused each restart

## Example Workflow

### Emergency Scenario

1. **OOM Kill Detected** → OOM Alarm triggers
2. **Lambda Invoked** → Emergency restart Lambda starts
3. **Instance Stopped** → Lambda stops instance (waits ~2 minutes)
4. **Instance Started** → Lambda starts instance (waits ~5 minutes)
5. **Status Checks Pass** → Instance returns to healthy state
6. **SNS Notification** → Email sent with restart details

### Manual Recovery

1. **Check Health**:
   ```bash
   ./Archive/hepefoundation/check-instance-health.sh
   ```

2. **Manual Restart**:
   ```bash
   pnpm nx run ops-runner:hepe:stop-start
   ```

3. **Verify Recovery**:
   ```bash
   ./Archive/hepefoundation/check-instance-health.sh
   ```














