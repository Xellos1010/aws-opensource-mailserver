# System Reset Recovery Plan (No Instance Reboot)

**Date:** December 9, 2025  
**Status:** 📋 **PLAN PROPOSED**

## Executive Summary

This plan proposes replacing instance reboots with comprehensive system reset operations that recover from critical failures **without rebooting the EC2 instance**. This reduces recovery time from 5-10 minutes to 30-90 seconds and maintains mail delivery continuity.

## Current State

### Current Recovery Flow
```
CloudWatch Alarm
    ↓
Mail Recovery Orchestrator Lambda
    ↓
    ├─→ Mail Health Check Lambda
    │   └─→ If healthy: Stop
    │
    ├─→ Service Restart Lambda (30-60s)
    │   └─→ Restarts postfix/dovecot/nginx
    │   └─→ If successful: Stop
    │
    └─→ Stop-Start Lambda (5-10min)
        └─→ Full instance reboot (last resort)
```

### Current Limitations
- **Service Restart** only restarts services, doesn't address:
  - Memory pressure/OOM conditions
  - Hung processes
  - Disk space issues
  - Log file accumulation
  - System resource exhaustion

## Proposed System Reset Recovery

### New Recovery Flow
```
CloudWatch Alarm
    ↓
Mail Recovery Orchestrator Lambda
    ↓
    ├─→ Mail Health Check Lambda
    │   └─→ If healthy: Stop
    │
    ├─→ System Reset Lambda (30-90s) ⭐ NEW
    │   └─→ Comprehensive reset without reboot:
    │       • Process cleanup (kill hung processes)
    │       • Memory cache clearing
    │       • Mail queue management
    │       • Log rotation/cleanup
    │       • Service restart
    │       • Resource verification
    │   └─→ If successful: Stop
    │
    ├─→ Service Restart Lambda (30-60s) ⚡ FALLBACK
    │   └─→ Simple service restart
    │   └─→ If successful: Stop
    │
    └─→ Stop-Start Lambda (5-10min) 🚨 LAST RESORT
        └─→ Full instance reboot
```

## System Reset Lambda Features

### 1. Process Cleanup
- **Kill hung processes**: Terminate stuck postfix/dovecot processes
- **Memory pressure relief**: Kill processes consuming >80% of available memory
- **Graceful termination**: Try SIGTERM first, SIGKILL if needed

### 2. Memory Management
- **Cache clearing**: Drop page cache, dentries, and inodes
- **Memory verification**: Check available memory before/after
- **OOM prevention**: Free memory before service restart

### 3. Mail Queue Management
- **Queue size check**: Monitor mail queue size
- **Automatic flush**: Flush queue if >100 items (stuck messages)
- **Queue verification**: Verify queue is processing after reset

### 4. Log Management
- **Log rotation**: Force log rotation to free disk space
- **Old log cleanup**: Remove logs >7 days old
- **Disk space recovery**: Free up space for system operation

### 5. Service Restart
- **Graceful stop**: Stop services before restart
- **MIAB daemon**: Use Mail-in-a-Box daemon if available
- **Individual services**: Fallback to systemctl restart
- **Status verification**: Verify services are active after restart

### 6. System Resource Verification
- **Memory check**: Verify sufficient memory available
- **Disk space check**: Verify disk space is adequate
- **Load average**: Check system load
- **Service status**: Verify all critical services are running

## Implementation Plan

### Phase 1: Deploy System Reset Lambda ✅ READY

**File:** `system-reset-lambda.yaml`  
**Deployment:** `deploy-system-reset.sh`

**Steps:**
1. Deploy system reset Lambda stack
2. Test system reset Lambda independently
3. Verify all reset operations work correctly

### Phase 2: Update Orchestrator Lambda

**File:** `emergency-alarms-stack.yaml` (MailRecoveryOrchestratorLambda)

**Changes:**
1. Add `SYSTEM_RESET_LAMBDA_ARN` environment variable
2. Update recovery flow:
   - Try system reset first (comprehensive)
   - Fallback to service restart (simple)
   - Last resort: instance restart

**New Flow:**
```python
# Health check
if healthy:
    return "No action needed"

# System reset (comprehensive)
system_reset_result = invoke_lambda(system_reset_lambda)
if system_reset_result.success:
    return "System reset successful"

# Service restart (simple fallback)
service_restart_result = invoke_lambda(service_restart_lambda)
if service_restart_result.success:
    return "Service restart successful"

# Instance restart (last resort)
instance_restart_result = invoke_lambda(stop_start_lambda)
return "Instance restart triggered"
```

### Phase 3: Update Alarm Stack

**File:** `emergency-alarms-stack.yaml`

**Changes:**
1. Add `SystemResetLambdaArn` parameter
2. Update orchestrator Lambda environment variables
3. Redeploy alarm stack

### Phase 4: Testing & Validation

**Test Scenarios:**
1. **Normal operation**: Health check passes, no action
2. **Service failure**: System reset recovers services
3. **Memory pressure**: System reset clears memory and recovers
4. **Hung processes**: System reset kills hung processes
5. **Disk space**: System reset cleans logs and frees space
6. **Complete failure**: Falls back to instance restart

## Recovery Time Comparison

| Scenario | Current (Service Restart) | Proposed (System Reset) | Improvement |
|----------|---------------------------|-------------------------|-------------|
| Service failure | 30-60s | 30-90s | Similar |
| Memory pressure | 5-10min (instance restart) | 30-90s | **83-95% faster** |
| Hung processes | 5-10min (instance restart) | 30-90s | **83-95% faster** |
| Disk space | 5-10min (instance restart) | 30-90s | **83-95% faster** |
| Complete failure | 5-10min | 5-10min | No change |

## Benefits

### 1. Faster Recovery
- **83-95% reduction** in recovery time for memory/process/disk issues
- Maintains 30-60s recovery for simple service failures
- Only uses instance restart as absolute last resort

### 2. Better Resource Management
- **Memory cleanup**: Prevents OOM conditions
- **Process cleanup**: Kills hung processes automatically
- **Disk space**: Automatic log cleanup prevents disk full errors

### 3. Improved Reliability
- **Comprehensive recovery**: Handles multiple failure modes
- **Progressive fallback**: Tries least disruptive method first
- **Better diagnostics**: Detailed logging of reset operations

### 4. Reduced Downtime
- **No instance reboot** for most failures
- **Mail delivery continues** during recovery
- **Faster return to service**

## Risk Mitigation

### Risk: System Reset Fails
**Mitigation:** Falls back to service restart, then instance restart

### Risk: Process Cleanup Kills Critical Processes
**Mitigation:** Only kills hung processes, not active services

### Risk: Log Cleanup Removes Important Logs
**Mitigation:** Only removes logs >7 days old, preserves recent logs

### Risk: Memory Clearing Affects Performance
**Mitigation:** Cache will rebuild automatically, minimal impact

## Monitoring & Observability

### CloudWatch Metrics
- System reset execution time
- System reset success rate
- Fallback to instance restart rate
- Recovery time by failure type

### CloudWatch Logs
- Detailed reset operation logs
- Process cleanup logs
- Memory/disk state before/after
- Service status verification

### Alarms
- System reset failure rate
- Recovery time > 2 minutes
- Fallback to instance restart frequency

## Rollout Plan

### Step 1: Deploy System Reset Lambda
```bash
cd Archive/hepefoundation
./deploy-system-reset.sh
```

### Step 2: Test System Reset Lambda
```bash
aws lambda invoke \
  --function-name system-reset-hepefoundation-org-system-reset \
  --profile hepe-admin-mfa \
  --region us-east-1 \
  /tmp/result.json && cat /tmp/result.json | jq .
```

### Step 3: Update Orchestrator Lambda
- Add system reset to orchestrator
- Update environment variables
- Redeploy alarm stack

### Step 4: Monitor & Validate
- Monitor recovery times
- Track success rates
- Validate fallback behavior

## Success Criteria

1. ✅ **System reset Lambda deployed** and tested
2. ✅ **Recovery time < 2 minutes** for 90% of failures
3. ✅ **Instance restart rate < 10%** of alarm triggers
4. ✅ **Zero data loss** during recovery
5. ✅ **Mail delivery continues** during recovery

## Files Created/Modified

### New Files
1. **system-reset-lambda.yaml** - System reset Lambda definition
2. **deploy-system-reset.sh** - Deployment script
3. **SYSTEM-RESET-RECOVERY-PLAN.md** - This document

### Files to Modify
1. **emergency-alarms-stack.yaml** - Add system reset Lambda to orchestrator
2. **deploy-emergency-alarms.sh** - Fetch system reset Lambda ARN

## Next Steps

1. ✅ System reset Lambda created
2. ⏳ Deploy system reset Lambda
3. ⏳ Test system reset Lambda
4. ⏳ Update orchestrator Lambda to use system reset
5. ⏳ Update alarm stack deployment script
6. ⏳ Deploy updated alarm stack
7. ⏳ Monitor and validate recovery times

## Conclusion

The system reset approach provides **comprehensive recovery without instance reboot**, reducing recovery times by **83-95%** for memory, process, and disk-related failures. The progressive fallback (system reset → service restart → instance restart) ensures maximum recovery success with minimum disruption.








