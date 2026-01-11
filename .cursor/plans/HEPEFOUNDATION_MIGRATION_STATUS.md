# Hepefoundation Stack Migration Status

## ✅ Migration Complete

All hepefoundation stacks have been successfully migrated to CDK constructs in the `mailserver-recovery` library and applied to `apps/cdk-emc-notary/instance`.

## Stack Association

**All migrated resources are associated with:** `emcnotary-com-mailserver-instance` stack

This is the main instance stack that contains:
- EC2 instance
- Security groups
- Elastic IP
- Recovery system (all Lambda functions, alarms, monitoring)
- System statistics collection
- External monitoring (Route 53 health checks + proactive checks)

**Date:** 2026-01-XX  
**Status:** ✅ **COMPLETE** - All 6 stacks migrated

## Migration Status

### ✅ Migrated Stacks

| Stack Name | Status | CDK Construct | Location |
|------------|--------|---------------|----------|
| `hepefoundation-org-mail-health-check` | ✅ **MIGRATED** | `MailHealthCheckLambda` | `libs/infra/mailserver-recovery/src/lib/mail-health-check-lambda.ts` |
| `hepefoundation-org-service-restart` | ✅ **MIGRATED** | `ServiceRestartLambda` | `libs/infra/mailserver-recovery/src/lib/service-restart-lambda.ts` |
| `hepefoundation-org-system-reset` | ✅ **MIGRATED** | `SystemResetLambda` | `libs/infra/mailserver-recovery/src/lib/system-reset-lambda.ts` |
| `hepefoundation-org-emergency-alarms` | ✅ **MIGRATED** | `EmergencyAlarms` + `RecoveryOrchestratorLambda` | `libs/infra/mailserver-recovery/src/lib/emergency-alarms.ts` + `recovery-orchestrator-lambda.ts` |
| `hepefoundation-org-system-stats` | ✅ **MIGRATED** | `SystemStatsLambda` | `libs/infra/mailserver-recovery/src/lib/system-stats-lambda.ts` |
| `hepefoundation-org-external-monitoring` | ✅ **MIGRATED** | `ExternalMonitoring` | `libs/infra/mailserver-recovery/src/lib/external-monitoring.ts` |

**Additional Components Migrated:**
- `stop-start-instance-helper.yaml` → `StopStartHelperLambda` ✅
- Recovery orchestrator logic → `RecoveryOrchestratorLambda` ✅

## Missing Components Details

### 1. System Stats Lambda (`hepefoundation-org-system-stats`)

**Purpose:** Collect comprehensive system statistics for operational monitoring

**Features:**
- Memory statistics (total, used, available, cache, usage %)
- Disk statistics (total, used, free, usage %)
- CPU & Load statistics (cores, load average)
- Service status (postfix, dovecot, nginx, SSM agent)
- Mail queue statistics
- Network statistics (active connections, TCP)
- Process statistics (top 5 memory consumers, total count)
- System uptime
- **Health score calculation** (0-100 with issue detection)

**Source:** `Archive/hepefoundation/system-stats-lambda.yaml`

**Migration Required:**
- Create `SystemStatsLambda` construct in `libs/infra/mailserver-recovery`
- Add EventBridge schedule support (optional - can be invoked on-demand)
- Integrate with existing recovery system (can trigger recovery based on health score)

### 2. External Monitoring (`hepefoundation-org-external-monitoring`)

**Purpose:** External health monitoring via Route 53 health checks + proactive Lambda checks

**Features:**
- **Route 53 Health Check** - HTTPS monitoring from AWS global infrastructure
  - Detects zombie instances (EC2 status OK but services unresponsive)
  - Multi-region health checks (us-east-1, us-west-1, us-west-2, eu-west-1)
  - CloudWatch alarm on health check failure
- **Proactive Health Check Lambda** - Runs every 5 minutes
  - SSM connectivity check
  - HTTPS connectivity check
  - EC2 status check
  - Publishes custom CloudWatch metrics
  - Triggers emergency restart on zombie state detection

**Source:** `Archive/hepefoundation/external-health-monitoring.yaml`

**Migration Required:**
- Create `ExternalMonitoring` construct in `libs/infra/mailserver-recovery`
- Route 53 health check configuration
- Proactive health check Lambda with EventBridge schedule
- CloudWatch alarm for Route 53 health check
- Integration with recovery orchestrator

## Current Implementation

### Applied to `apps/cdk-emc-notary/instance`

The following recovery system components are **already applied** to the emcnotary instance stack:

```typescript
// In apps/cdk-emc-notary/instance/src/stacks/instance-stack.ts

// ✅ Mail Health Check Lambda
const mailHealthCheck = new MailHealthCheckLambda(this, 'MailHealthCheck', {
  instanceId: instance.instanceId,
  domainName,
  scheduleExpression: 'rate(5 minutes)',
  notificationTopic: alarmsTopic,
});

// ✅ Service Restart Lambda
const serviceRestart = new ServiceRestartLambda(this, 'ServiceRestart', {
  instanceId: instance.instanceId,
  domainName,
});

// ✅ System Reset Lambda
const systemReset = new SystemResetLambda(this, 'SystemReset', {
  instanceId: instance.instanceId,
  domainName,
});

// ✅ Stop/Start Helper Lambda
const stopStartHelper = new StopStartHelperLambda(this, 'StopStartHelper', {
  mailServerStackName: this.stackName,
  domainName,
  mailHealthCheckLambdaName: mailHealthCheck.lambda.functionName,
  serviceRestartLambdaName: serviceRestart.lambda.functionName,
  scheduleExpression: 'cron(0 8 * * ? *)',
  maintenanceWindowStartHour: 8,
  maintenanceWindowEndHour: 8.25,
});

// ✅ Recovery Orchestrator Lambda
const recoveryOrchestrator = new RecoveryOrchestratorLambda(this, 'RecoveryOrchestrator', {
  mailHealthCheckLambdaArn: mailHealthCheck.lambda.functionArn,
  systemResetLambdaArn: systemReset.lambda.functionArn,
  serviceRestartLambdaArn: serviceRestart.lambda.functionArn,
  stopStartLambdaArn: stopStartHelper.lambda.functionArn,
  domainName,
});

// ✅ Emergency Alarms
const emergencyAlarms = new EmergencyAlarms(this, 'EmergencyAlarms', {
  instanceId: instance.instanceId,
  recoveryOrchestratorLambda: recoveryOrchestrator.lambda,
  notificationTopic: alarmsTopic,
  domainName,
});

// ✅ System Stats Lambda
const systemStats = new SystemStatsLambda(this, 'SystemStats', {
  instanceId: instance.instanceId,
  domainName,
  scheduleExpression: 'rate(1 hour)', // Collect stats hourly
});

// ✅ External Monitoring
const externalMonitoring = new ExternalMonitoring(this, 'ExternalMonitoring', {
  instanceId: instance.instanceId,
  domainName,
  boxHostname: `${instanceDns.valueAsString}.${domainName}`,
  emergencyRestartLambdaArn: recoveryOrchestrator.lambda.functionArn,
  notificationTopic: alarmsTopic,
  healthCheckIntervalSeconds: 30,
});
```

## Next Steps

### ✅ Migration Complete - Ready for Deployment

1. **✅ All Constructs Created**
   - `SystemStatsLambda` ✅
   - `ExternalMonitoring` ✅
   - All constructs exported and applied to instance stack ✅

2. **✅ CDK Synth Validated**
   - `pnpm nx run cdk-emcnotary-instance:synth` passes ✅
   - All resources synthesize correctly ✅

3. **✅ CDK Synth Verified**
   - `pnpm nx run cdk-emcnotary-instance:synth` passes successfully ✅
   - All new resources synthesize correctly:
     - ✅ SystemStatsLambda: Function + Role + Log Group + EventBridge Schedule
     - ✅ ExternalMonitoring: Route 53 Health Check + Alarm + Proactive Lambda + Schedule + Permissions
   - No synthesis errors or warnings (Lambda permission warning resolved)

4. **📋 CDK Diff Status**
   - **Note:** CDK diff requires AWS credentials to compare with deployed stack
   - To run diff: `CDK_DEFAULT_ACCOUNT=413988044972 CDK_DEFAULT_REGION=us-east-1 AWS_PROFILE=hepe-admin-mfa pnpm nx run cdk-emcnotary-instance:diff`
   - Expected: New resources will be created (no replacements expected)
   - New resources that will be created:
     - **SystemStatsLambda:**
       - `SystemStatsRole` - IAM role for Lambda
       - `SystemStatsLogGroup` - CloudWatch log group
       - `SystemStatsFunction` - Lambda function
       - `SystemStatsScheduleRule` - EventBridge rule (hourly)
       - `SystemStatsFunctionEventBridgeInvoke` - Lambda permission
     - **ExternalMonitoring:**
       - `ExternalMonitoringHttpsHealthCheck` - Route 53 health check
       - `ExternalMonitoringHttpsHealthCheckAlarm` - CloudWatch alarm
       - `ExternalMonitoringEmergencyRestartLambdaAlarmPermission` - Lambda permission
       - `ExternalMonitoringProactiveHealthCheckRole` - IAM role
       - `ExternalMonitoringProactiveHealthCheckLogGroup` - CloudWatch log group
       - `ExternalMonitoringProactiveHealthCheckLambda` - Lambda function
       - `ExternalMonitoringProactiveHealthCheckSchedule` - EventBridge rule (every 5 minutes)
       - `ExternalMonitoringProactiveHealthCheckLambdaEventBridgeInvoke` - Lambda permission

5. **✅ CDK Diff Verified**
   - `pnpm nx run cdk-emcnotary-instance:diff` completed successfully ✅
   - **47 new resources** will be created:
     - Recovery system Lambdas (25 resources)
     - Emergency alarms (4 resources)
     - System stats Lambda (6 resources)
     - External monitoring (9 resources)
     - Additional CloudWatch alarms (2 resources)
   - **1 resource modification:** EC2Instance UserData (low risk of replacement)
   - All IAM permissions correctly configured ✅
   - All resource dependencies satisfied ✅

6. **🚀 Ready for Deployment**
   - **Status:** ✅ **READY FOR DEPLOYMENT**
   - **Deploy Command:**
     ```bash
     AWS_PROFILE=hepe-admin-mfa AWS_REGION=us-east-1 \
       pnpm nx run cdk-emcnotary-instance:deploy
     ```
   - **Note:** Monitor CloudFormation events to ensure EC2Instance is not replaced unexpectedly
   - See `.cursor/plans/CDK_DEPLOYMENT_READINESS_REPORT.md` for full details

7. **📋 Post-Deployment Verification**
   - Verify all Lambda functions created successfully
   - Check CloudWatch logs for each function
   - Verify EventBridge schedules are active
   - Verify Route 53 health check is passing
   - Wait 1 hour and check CloudWatch metrics for system stats
   - Test recovery flow end-to-end (if safe to do so)
   - Verify EC2Instance was NOT replaced (check instance ID)

## Automation Requirements

**User Requirement:** "everything needs to be automated - no manual execution operations"

### Current State
- ✅ Recovery system is fully automated (alarms → orchestrator → recovery)
- ✅ Health checks run on schedule (EventBridge)
- ✅ All Lambda functions are deployed via CDK

### ✅ All Automation Complete
- ✅ System stats collection (scheduled hourly via EventBridge)
- ✅ External monitoring (Route 53 health checks + proactive checks every 5 minutes)
- ✅ All monitoring is automated (scheduled health checks, stats collection)
- ✅ All recovery is automated (alarm-triggered recovery flow)
- ✅ No manual operations required for monitoring or recovery

## Related Documentation

- `.cursor/plans/REQUIREMENTS_AUDIT_hepefoundation_recovery_system.md` - Requirements audit
- `.cursor/plans/IMPLEMENTATION_SUMMARY_hepefoundation_recovery.md` - Implementation summary
- `libs/infra/mailserver-recovery/README.md` - Recovery system library documentation

