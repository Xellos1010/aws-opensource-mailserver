# Mailserver Recovery System

Reusable CDK constructs for mailserver recovery system ported from `Archive/hepefoundation`. Provides **83-95% faster recovery times** (30-90 seconds vs 5-10 minutes) by using progressive recovery methods that avoid instance reboots when possible.

## Overview

The recovery system provides a **progressive recovery flow**:

1. **Mail Health Check** → If healthy, stop (no action needed)
2. **System Reset** (30-90s) → Comprehensive recovery without reboot
3. **Service Restart** (30-60s) → Simple service restart fallback
4. **Instance Restart** (5-10min) → Last resort

## Components

### MailHealthCheckLambda
Checks postfix/dovecot service status via SSM with EventBridge schedule support.

**Features:**
- Primary checks: service status (postfix, dovecot) - determines health
- Secondary checks: port connectivity (informational only)
- SNS notifications on failure
- Configurable schedule (default: every 5 minutes)

### ServiceRestartLambda
Restarts mail services (postfix/dovecot/nginx) without instance reboot.

**Features:**
- Uses Mail-in-a-Box daemon if available
- Falls back to individual service restart
- Verifies services are active after restart

### SystemResetLambda
Comprehensive system recovery without instance reboot.

**Features:**
- Process cleanup (kill hung processes)
- Memory management (clear caches)
- Mail queue management (flush stuck queue)
- Log rotation/cleanup (free disk space)
- Service restart
- Resource verification

**Recovery Time:** 30-90 seconds

### StopStartHelperLambda
Smart instance restart with maintenance window awareness (last resort).

**Features:**
- Maintenance window awareness (suppresses during scheduled maintenance)
- In-progress detection (prevents cascading restarts)
- Mail health check before restart (skips if healthy)
- Progressive recovery: service restart → instance restart
- EventBridge schedule support (daily maintenance)

**Recovery Time:** 5-10 minutes

### RecoveryOrchestratorLambda
Orchestrates progressive recovery flow.

**Recovery Flow:**
1. Mail Health Check → If healthy, stop
2. System Reset (30-90s) → If successful, stop
3. Service Restart (30-60s) → If successful, stop
4. Instance Restart (5-10min) → Last resort

### EmergencyAlarms
CloudWatch alarms wired to recovery orchestrator.

**Alarms:**
- InstanceStatusCheck (instance-level issues)
- SystemStatusCheck (AWS infrastructure issues)
- OOMKillDetected (memory exhaustion)

**Features:**
- OOM Metric Filter + Log Group for syslog
- Alarm → Lambda invoke permissions (critical fix from hepefoundation)
- SNS topic integration

## Usage

```typescript
import {
  MailHealthCheckLambda,
  ServiceRestartLambda,
  SystemResetLambda,
  StopStartHelperLambda,
  RecoveryOrchestratorLambda,
  EmergencyAlarms,
} from '@mm/infra-mailserver-recovery';

// In instance stack:
const mailHealthCheck = new MailHealthCheckLambda(this, 'MailHealthCheck', {
  instanceId: instance.instanceId,
  domainName: 'emcnotary.com',
  scheduleExpression: 'rate(5 minutes)',
  notificationTopic: alarmsTopic,
});

const serviceRestart = new ServiceRestartLambda(this, 'ServiceRestart', {
  instanceId: instance.instanceId,
  domainName: 'emcnotary.com',
});

const systemReset = new SystemResetLambda(this, 'SystemReset', {
  instanceId: instance.instanceId,
  domainName: 'emcnotary.com',
});

const stopStartHelper = new StopStartHelperLambda(this, 'StopStartHelper', {
  mailServerStackName: this.stackName,
  domainName: 'emcnotary.com',
  mailHealthCheckLambdaName: mailHealthCheck.lambda.functionName,
  serviceRestartLambdaName: serviceRestart.lambda.functionName,
  scheduleExpression: 'cron(0 8 * * ? *)', // Daily at 3am EST
});

const recoveryOrchestrator = new RecoveryOrchestratorLambda(this, 'RecoveryOrchestrator', {
  mailHealthCheckLambdaArn: mailHealthCheck.lambda.functionArn,
  systemResetLambdaArn: systemReset.lambda.functionArn,
  serviceRestartLambdaArn: serviceRestart.lambda.functionArn,
  stopStartLambdaArn: stopStartHelper.lambda.functionArn,
  domainName: 'emcnotary.com',
});

const emergencyAlarms = new EmergencyAlarms(this, 'EmergencyAlarms', {
  instanceId: instance.instanceId,
  recoveryOrchestratorLambda: recoveryOrchestrator.lambda,
  notificationTopic: alarmsTopic,
  domainName: 'emcnotary.com',
});
```

## Recovery Time Comparison

| Failure Scenario | Old Method | New Method | Improvement |
|------------------|------------|------------|-------------|
| Service failure | 30-60s (service restart) | 30-90s (system reset) | Similar |
| Memory pressure | 5-10min (instance restart) | 30-90s (system reset) | **83-95% faster** |
| Hung processes | 5-10min (instance restart) | 30-90s (system reset) | **83-95% faster** |
| Disk space full | 5-10min (instance restart) | 30-90s (system reset) | **83-95% faster** |
| Mail queue stuck | 5-10min (instance restart) | 30-90s (system reset) | **83-95% faster** |
| OOM condition | 5-10min (instance restart) | 30-90s (system reset) | **83-95% faster** |
| Complete failure | 5-10min | 5-10min | No change (last resort) |

## Key Benefits

1. **Faster Recovery** - 83-95% reduction in recovery time for most failures
2. **Zero Downtime** - No instance reboot for most failures
3. **Progressive Fallback** - Tries least disruptive method first
4. **Health-Aware** - Skips recovery if services are healthy
5. **Maintenance Window Aware** - Suppresses restarts during scheduled maintenance

## Requirements

- EC2 instance must have SSM agent installed and running
- Instance IAM role must have `AmazonSSMManagedInstanceCore` policy
- Instance must be registered with Systems Manager

## Source

This library is ported from `Archive/hepefoundation` recovery system, which was proven in production with:
- ✅ Recovery time < 2 minutes for 90%+ of failures
- ✅ Instance restart rate < 10% of alarm triggers
- ✅ Zero data loss during recovery
- ✅ Mail delivery continues during recovery

## Related Documentation

- `.cursor/plans/REQUIREMENTS_AUDIT_hepefoundation_recovery_system.md` - Requirements audit
- `.cursor/plans/IMPLEMENTATION_SUMMARY_hepefoundation_recovery.md` - Implementation summary
- `Archive/hepefoundation/COMPLETE-RECOVERY-SYSTEM.md` - Original system documentation


