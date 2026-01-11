# Zombie Instance Detection and Monitoring

## Overview

This document describes the "zombie instance" problem discovered on 2026-01-06 and the enhanced monitoring solution implemented to prevent future undetected outages.

## The Zombie Instance Problem

### What Happened (2026-01-06)

The hepefoundation.org mailserver experienced a **zombie state** where:

| Check | Status | Expected |
|-------|--------|----------|
| EC2 Instance State | ✅ Running | Running |
| System Status Check | ✅ OK | OK |
| Instance Status Check | ✅ OK | OK |
| SSM Agent | ❌ ConnectionLost | Online |
| HTTPS Web Interface | ❌ Not responding | 200 OK |
| SMTP Ports (25, 587) | ❌ Filtered/Closed | Open |

### Root Cause

The instance entered a state where:
1. AWS infrastructure-level checks passed (the VM was running)
2. But internal services and the OS were unresponsive
3. The SSM agent lost connection 6+ hours before detection
4. All existing CloudWatch alarms showed "OK" because they only monitor infrastructure-level metrics

### Resolution

A full **stop-start cycle** (not just reboot) was required to restore services:

```bash
# Stop instance
aws ec2 stop-instances --instance-ids i-0a1ff83f513575ed4

# Wait for stopped state
aws ec2 wait instance-stopped --instance-ids i-0a1ff83f513575ed4

# Start instance
aws ec2 start-instances --instance-ids i-0a1ff83f513575ed4

# Wait for running state
aws ec2 wait instance-running --instance-ids i-0a1ff83f513575ed4
```

## Monitoring Gap Analysis

### Existing Monitoring (Before)

| Alarm | What It Detects | Zombie Detection? |
|-------|-----------------|-------------------|
| InstanceStatusCheck | EC2 instance status check fails | ❌ No |
| SystemStatusCheck | AWS system status check fails | ❌ No |
| OOMKillDetected | Out-of-memory kills in syslog | ❌ No |
| MemHigh | Memory usage > 85% | ❌ No |
| SwapHigh | Swap usage > 50% | ❌ No |

**Gap**: All existing monitoring relies on AWS infrastructure checks or CloudWatch Agent metrics. When the instance is in a zombie state, these metrics either show OK or stop reporting (treated as not breaching).

### Enhanced Monitoring (After)

| New Check | What It Detects | How It Works |
|-----------|-----------------|--------------|
| Route 53 HTTPS Health Check | Web interface down | External check from AWS global infrastructure |
| SSM Connectivity Check | SSM agent connection lost | Lambda checks `describe-instance-information` |
| Proactive Health Check Lambda | Combined zombie detection | Runs every 5 minutes, triggers restart |

## Deployment

### Deploy External Health Monitoring

```bash
# Deploy the external health monitoring stack
cd Archive/hepefoundation
./deploy-external-health-monitoring.sh
```

### What Gets Deployed

1. **Route 53 HTTPS Health Check**
   - Checks `https://box.hepefoundation.org/` every 30 seconds
   - Runs from 4 AWS regions (us-east-1, us-west-1, us-west-2, eu-west-1)
   - Triggers alarm after 3 consecutive failures

2. **HTTPS Health Check Alarm**
   - CloudWatch alarm on Route 53 health check
   - Triggers emergency restart Lambda on failure
   - 3-minute evaluation period

3. **Proactive Health Check Lambda**
   - Runs every 5 minutes via EventBridge
   - Checks: EC2 status + SSM connectivity + HTTPS response
   - Detects zombie state: EC2 OK but SSM/HTTPS failing
   - Triggers emergency restart on detection

4. **Custom CloudWatch Metrics**
   - `MailServer/ProactiveHealthCheck/SSMConnectivityHealthy`
   - `MailServer/ProactiveHealthCheck/HTTPSHealthy`
   - `MailServer/ProactiveHealthCheck/OverallHealthy`

## Manual Recovery Procedures

### Quick Recovery Commands

```bash
# Check current health status
./Archive/hepefoundation/check-instance-health.sh

# Diagnose reachability issues
./Archive/hepefoundation/diagnose-box-reachability.sh

# Manual stop-start (emergency)
AWS_PROFILE=hepe-admin-mfa AWS_REGION=us-east-1 \
  aws ec2 stop-instances --instance-ids i-0a1ff83f513575ed4
  
AWS_PROFILE=hepe-admin-mfa AWS_REGION=us-east-1 \
  aws ec2 wait instance-stopped --instance-ids i-0a1ff83f513575ed4
  
AWS_PROFILE=hepe-admin-mfa AWS_REGION=us-east-1 \
  aws ec2 start-instances --instance-ids i-0a1ff83f513575ed4
```

### Using Nx Tasks

```bash
# Stop and restart HEPE instance
pnpm nx run ops-runner:hepe:stop-start

# Just stop
pnpm nx run ops-runner:hepe:stop

# Just start
pnpm nx run ops-runner:hepe:start
```

## Monitoring Verification

### Check All Alarm States

```bash
aws cloudwatch describe-alarms \
  --profile hepe-admin-mfa \
  --region us-east-1 \
  --query 'MetricAlarms[?contains(AlarmName, `hepefoundation`) || contains(AlarmName, `i-0a1ff83f513575ed4`)].{Name:AlarmName,State:StateValue}' \
  --output table
```

### Check Route 53 Health Check Status

```bash
# Get health check ID
HEALTH_CHECK_ID=$(aws cloudformation describe-stacks \
  --profile hepe-admin-mfa \
  --stack-name hepefoundation-org-external-monitoring \
  --query 'Stacks[0].Outputs[?OutputKey==`HttpsHealthCheckId`].OutputValue' \
  --output text)

# Check status
aws route53 get-health-check-status \
  --profile hepe-admin-mfa \
  --health-check-id $HEALTH_CHECK_ID
```

### View Proactive Health Check Logs

```bash
aws logs tail /aws/lambda/proactive-health-check-hepefoundation-org-external-monitoring \
  --profile hepe-admin-mfa \
  --region us-east-1 \
  --follow
```

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                     External Health Monitoring                       │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌─────────────────┐     ┌─────────────────┐     ┌────────────────┐ │
│  │   Route 53      │     │   CloudWatch    │     │   Emergency    │ │
│  │ Health Check    │────▶│     Alarm       │────▶│ Restart Lambda │ │
│  │ (every 30 sec)  │     │ (3 min eval)    │     │                │ │
│  └─────────────────┘     └─────────────────┘     └────────────────┘ │
│                                                          │          │
│  ┌─────────────────┐                                     │          │
│  │   EventBridge   │                                     ▼          │
│  │ (every 5 min)   │     ┌─────────────────┐     ┌────────────────┐ │
│  └────────┬────────┘     │   Proactive     │     │   EC2 Stop/    │ │
│           │              │ Health Check    │────▶│   Start Cycle  │ │
│           └─────────────▶│    Lambda       │     │                │ │
│                          └─────────────────┘     └────────────────┘ │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘

Health Check Flow:
1. Route 53: HTTPS → box.hepefoundation.org:443
2. Proactive Lambda: EC2 status + SSM ping + HTTPS check
3. On failure: Trigger emergency restart Lambda
4. Emergency restart: Stop → Wait → Start → Verify
```

## SLI/SLO Recommendations

| Indicator | Objective | Alert Threshold |
|-----------|-----------|-----------------|
| HTTPS Availability | 99.9% (8.76h/year downtime) | < 99.5% in 24h window |
| Time to Detection | < 5 minutes | Proactive check frequency |
| Time to Recovery | < 10 minutes | Emergency restart timeout |
| SSM Connectivity | 99.9% | ConnectionLost for 10+ min |

## Lessons Learned

1. **Infrastructure checks ≠ service health**: EC2 status checks pass even when services are zombie
2. **External monitoring is essential**: Internal monitoring fails when the instance is compromised
3. **SSM connectivity is a leading indicator**: Lost connection often precedes full outage
4. **Automate recovery**: Manual intervention takes too long; auto-restart is critical

## Related Files

- `Archive/hepefoundation/external-health-monitoring.yaml` - CloudFormation template
- `Archive/hepefoundation/deploy-external-health-monitoring.sh` - Deployment script
- `Archive/hepefoundation/emergency-alarms-stack.yaml` - Existing alarm infrastructure
- `Archive/hepefoundation/diagnose-box-reachability.sh` - Manual diagnostic script
- `docs/EMERGENCY-MONITORING-SOLUTION.md` - Existing monitoring documentation
- `docs/OOM-MONITORING-SOLUTION.md` - OOM-specific monitoring




