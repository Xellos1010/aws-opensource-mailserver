# Requirements Audit: hepefoundation Recovery System Migration

**Date:** 2025-01-XX  
**Status:** 🔍 Audit Complete - Ready for Implementation  
**Related Plan:** `archive_hepefoundation_audit_and_cdk_stack_pipeline_propagation_plan_for_cdk_emc_notary.plan.md`

## Executive Summary

This audit confirms that the hepefoundation recovery system requirements are well-defined and ready for migration to reusable CDK constructs. The system provides **83-95% faster recovery times** (30-90 seconds vs 5-10 minutes) by using progressive recovery methods that avoid instance reboots when possible.

## Plan Requirements Review

### ✅ Phase 2 Requirements (Port Recovery System)

**Status:** Requirements clearly defined, implementation ready

The plan specifies porting the following components from `Archive/hepefoundation`:

1. **Mail Health Check Lambda** - Scheduled health checks via EventBridge
2. **Smart Restart Lambda** - Service restart orchestration with escalation
3. **Stop/Start Helper Lambda** - Alarm-triggered remediation with maintenance window awareness
4. **Emergency Alarms** - CloudWatch alarms wired to remediation lambdas
5. **Alarm → Lambda Permission Fix** - Critical for reliability

**Audit Result:** ✅ All components exist in `Archive/hepefoundation` with complete CloudFormation templates and documented behavior.

## Resource Inventory from hepefoundation

### Lambda Functions (5 total)

#### 1. Mail Health Check Lambda
- **File:** `Archive/hepefoundation/mail-health-check-lambda.yaml`
- **Purpose:** Checks postfix/dovecot service status via SSM
- **Schedule:** EventBridge (5 min default, configurable)
- **Features:**
  - Primary checks: service status (postfix, dovecot) - determines health
  - Secondary checks: port connectivity (informational only)
  - SNS notifications on failure
- **Runtime:** Python 3.11
- **Timeout:** 30 seconds
- **Memory:** 256 MB

#### 2. Service Restart Lambda
- **File:** `Archive/hepefoundation/service-restart-lambda.yaml`
- **Purpose:** Restarts mail services (postfix/dovecot/nginx) without instance reboot
- **Features:**
  - Uses Mail-in-a-Box daemon if available
  - Falls back to individual service restart
  - Verifies services are active after restart
- **Runtime:** Python 3.11
- **Timeout:** 60 seconds
- **Memory:** 256 MB

#### 3. System Reset Lambda
- **File:** `Archive/hepefoundation/system-reset-lambda.yaml`
- **Purpose:** Comprehensive system recovery without instance reboot
- **Features:**
  - Process cleanup (kills hung processes)
  - Memory management (clears caches)
  - Mail queue management (flushes stuck queue)
  - Log rotation/cleanup (frees disk space)
  - Service restart (postfix/dovecot/nginx)
  - Resource verification
- **Runtime:** Python 3.11
- **Timeout:** 120 seconds
- **Memory:** 512 MB
- **Recovery Time:** 30-90 seconds

#### 4. Stop/Start Helper Lambda
- **File:** `Archive/hepefoundation/stop-start-instance-helper.yaml`
- **Purpose:** Instance restart with smart logic (last resort)
- **Features:**
  - Maintenance window awareness (suppresses during scheduled maintenance)
  - In-progress detection (prevents cascading restarts)
  - Mail health check before restart (skips if healthy)
  - Progressive recovery: service restart → instance restart
  - State management (waits for stop/start completion)
- **Runtime:** Node.js 20.x
- **Timeout:** 900 seconds (15 minutes)
- **Memory:** 256 MB
- **Schedule:** EventBridge (daily at 3am EST / 8am UTC)

#### 5. Recovery Orchestrator Lambda
- **File:** `Archive/hepefoundation/emergency-alarms-stack.yaml` (embedded)
- **Purpose:** Orchestrates progressive recovery flow
- **Recovery Flow:**
  1. Mail Health Check → If healthy, stop
  2. System Reset (30-90s) → If successful, stop
  3. Service Restart (30-60s) → If successful, stop
  4. Instance Restart (5-10min) → Last resort
- **Runtime:** Python 3.11
- **Timeout:** 300 seconds (5 minutes)
- **Memory:** 512 MB

### CloudWatch Alarms (3 total)

#### 1. Instance Status Check Alarm
- **Metric:** `AWS/EC2.StatusCheckFailed_Instance`
- **Threshold:** 1 (fails if status check fails)
- **Period:** 60 seconds
- **Evaluation Periods:** 2
- **Action:** Triggers Recovery Orchestrator

#### 2. System Status Check Alarm
- **Metric:** `AWS/EC2.StatusCheckFailed_System`
- **Threshold:** 1 (fails if system check fails)
- **Period:** 60 seconds
- **Evaluation Periods:** 2
- **Action:** Triggers Recovery Orchestrator

#### 3. OOM Kill Alarm
- **Metric:** `EC2/oom_kills` (from log metric filter)
- **Threshold:** 0 (alerts on any OOM kill)
- **Period:** 60 seconds
- **Evaluation Periods:** 1
- **Action:** Triggers Recovery Orchestrator
- **Requires:** CloudWatch Log Group + Metric Filter for syslog

### Supporting Resources

#### CloudWatch Log Group
- **Name:** `/ec2/syslog-{domain}-mailserver`
- **Retention:** 7 days
- **Purpose:** OOM detection via metric filter

#### OOM Metric Filter
- **Log Group:** Syslog log group
- **Filter Pattern:** `"Out of memory"`
- **Metric:** `EC2/oom_kills`
- **Purpose:** Creates metric for OOM alarm

#### SNS Topic
- **Purpose:** Alarm notifications
- **Integration:** Optional (can be empty)

## Gap Analysis: Current vs Required

### Current State (`apps/cdk-emc-notary/instance`)

**Existing:**
- ✅ Basic emergency restart Lambda (instance stop/start only)
- ✅ Basic CloudWatch alarms (InstanceStatusCheck, SystemStatusCheck, OOMKill)
- ✅ Alarms wired to emergency restart Lambda
- ✅ SNS topic integration

**Missing:**
- ❌ Mail Health Check Lambda
- ❌ Service Restart Lambda (service-level recovery)
- ❌ System Reset Lambda (comprehensive recovery)
- ❌ Recovery Orchestrator Lambda (progressive recovery flow)
- ❌ Stop/Start Helper Lambda with smart logic (maintenance window, health checks)
- ❌ EventBridge schedule for health checks
- ❌ CloudWatch Log Group for syslog (OOM detection)
- ❌ OOM Metric Filter
- ❌ Progressive recovery flow (system reset → service restart → instance restart)

### Required State (Per Plan)

**Must Have:**
- ✅ Mail Health Check Lambda + EventBridge schedule
- ✅ Service Restart Lambda
- ✅ System Reset Lambda
- ✅ Stop/Start Helper Lambda with smart logic
- ✅ Recovery Orchestrator Lambda
- ✅ Emergency Alarms with progressive recovery
- ✅ CloudWatch Log Group + OOM Metric Filter
- ✅ Proper Lambda permissions (alarm → Lambda invoke)

## Library Structure Requirements

### New Library: `libs/infra/mailserver-recovery`

**Purpose:** Reusable CDK constructs for mailserver recovery system

**Components:**

1. **`MailHealthCheckLambda`** construct
   - EventBridge schedule (configurable)
   - SNS notifications
   - SSM command execution
   - Configurable timeouts/thresholds

2. **`ServiceRestartLambda`** construct
   - SSM command execution
   - Service verification
   - Error handling

3. **`SystemResetLambda`** construct
   - Comprehensive recovery script
   - Process cleanup
   - Memory management
   - Mail queue management
   - Log rotation
   - Service restart

4. **`StopStartHelperLambda`** construct
   - Smart restart logic
   - Maintenance window awareness
   - In-progress detection
   - Mail health check integration
   - Progressive recovery (service → instance)

5. **`RecoveryOrchestratorLambda`** construct
   - Progressive recovery flow
   - Lambda invocation orchestration
   - Health check integration

6. **`EmergencyAlarms`** construct
   - CloudWatch alarms (InstanceStatusCheck, SystemStatusCheck, OOMKill)
   - OOM Metric Filter + Log Group
   - Alarm → Lambda permission wiring
   - SNS topic integration

## Resource Requirements Checklist

### IAM Permissions

#### Mail Health Check Lambda
- ✅ `ssm:SendCommand`
- ✅ `ssm:GetCommandInvocation`
- ✅ `ssm:DescribeInstanceInformation`
- ✅ `ec2:DescribeInstances`
- ✅ `logs:*` (CloudWatch Logs)

#### Service Restart Lambda
- ✅ `ssm:SendCommand`
- ✅ `ssm:GetCommandInvocation`
- ✅ `ssm:DescribeInstanceInformation`
- ✅ `ec2:DescribeInstances`
- ✅ `logs:*`

#### System Reset Lambda
- ✅ `ssm:SendCommand`
- ✅ `ssm:GetCommandInvocation`
- ✅ `ssm:DescribeInstanceInformation`
- ✅ `ec2:DescribeInstances`
- ✅ `logs:*`

#### Stop/Start Helper Lambda
- ✅ `ec2:StopInstances`
- ✅ `ec2:StartInstances`
- ✅ `ec2:DescribeInstances`
- ✅ `cloudformation:DescribeStacks`
- ✅ `lambda:InvokeFunction` (for health check + service restart)
- ✅ `logs:*` (including FilterLogEvents for in-progress detection)

#### Recovery Orchestrator Lambda
- ✅ `lambda:InvokeFunction` (for all recovery lambdas)
- ✅ `logs:*`

### Lambda Permissions (Alarm → Lambda)

**Critical:** CloudWatch alarms must have permission to invoke Lambda functions.

**Required:**
- ✅ `AWS::Lambda::Permission` resource with:
  - `Principal: lambda.alarms.cloudwatch.amazonaws.com`
  - `SourceArn: arn:aws:cloudwatch:{region}:{account}:alarm:*`

**Note:** This is explicitly mentioned in the plan as a critical fix from hepefoundation.

### EventBridge Permissions

- ✅ `events.amazonaws.com` → Lambda invoke permission
- ✅ `SourceArn` from EventBridge rule

### SSM Agent Requirements

**On EC2 Instance:**
- ✅ SSM Agent installed and running
- ✅ IAM role with `AmazonSSMManagedInstanceCore` policy
- ✅ Instance must be registered with SSM

**Note:** Current instance stack already has SSM permissions via `createInstanceRole`.

## Implementation Priority

### Phase 1: Core Recovery Constructs (High Priority)
1. **MailHealthCheckLambda** - Foundation for health-aware recovery
2. **ServiceRestartLambda** - Fast recovery path
3. **SystemResetLambda** - Comprehensive recovery path
4. **RecoveryOrchestratorLambda** - Orchestrates progressive recovery

### Phase 2: Smart Stop/Start (High Priority)
5. **StopStartHelperLambda** - Last resort with smart logic

### Phase 3: Alarms Integration (High Priority)
6. **EmergencyAlarms** - Wires everything together
7. **OOM Detection** - Log Group + Metric Filter

### Phase 4: Apply to emcnotary (High Priority)
8. **Update `apps/cdk-emc-notary/instance`** - Use new constructs

## Acceptance Criteria (From Plan)

### Recovery System Parity
- ✅ Mail health check + smart restart + stop/start helper + emergency alarms behave as in hepefoundation
- ✅ Managed by CDK (not manual CloudFormation)
- ✅ Recovery time: 30-90 seconds for most failures (vs 5-10 minutes)
- ✅ Instance restart rate < 10% of alarm triggers

### Technical Requirements
- ✅ All Lambda functions deployed via CDK
- ✅ CloudWatch alarms wired to recovery orchestrator
- ✅ Alarm → Lambda invoke permissions correctly configured
- ✅ EventBridge schedule for health checks
- ✅ OOM detection via log metric filter
- ✅ SNS notifications on alarm triggers

### Integration Requirements
- ✅ Instance ID discovery (from stack outputs or SSM param)
- ✅ Stack outputs exported for monitoring and traffic switching
- ✅ Feature flags/config toggles for enabling/disabling monitoring

## Risks & Mitigations

### Risk: Alarm actions silently fail (missing invoke permission)
**Mitigation:** ✅ Bake the hepefoundation alarm→lambda permission fix into the CDK construct and assert it in synth tests.

### Risk: Recovery system complexity
**Mitigation:** ✅ Use progressive recovery flow (health check → system reset → service restart → instance restart) with clear fallback logic.

### Risk: Maintenance window conflicts
**Mitigation:** ✅ Stop/Start Helper Lambda includes maintenance window awareness to prevent cascading restarts.

### Risk: In-progress detection failures
**Mitigation:** ✅ Stop/Start Helper Lambda checks CloudWatch Logs for recent executions to prevent concurrent restarts.

## Next Steps

1. ✅ **Audit Complete** - This document
2. ⏳ **Create Library** - `libs/infra/mailserver-recovery` with all constructs
3. ⏳ **Apply to emcnotary** - Update `apps/cdk-emc-notary/instance` to use new constructs
4. ⏳ **Test** - Verify recovery flow works end-to-end
5. ⏳ **Document** - Update plan with implementation status

## Conclusion

✅ **All requirements are clearly defined and ready for implementation.**

The hepefoundation recovery system provides a proven, production-ready solution for mailserver recovery with:
- **83-95% faster recovery times** (30-90 seconds vs 5-10 minutes)
- **Progressive recovery** (system reset → service restart → instance restart)
- **Zero downtime** for most failures (no instance reboot)
- **Smart logic** (maintenance window awareness, health checks, in-progress detection)

**Recommendation:** Proceed with implementation using the library structure outlined above.


