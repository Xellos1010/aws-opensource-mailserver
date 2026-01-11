# Cost Comparison: Current vs New Infrastructure

**Date:** 2025-01-06  
**Stack:** `emcnotary-com-mailserver-instance`  
**Region:** us-east-1

---

## Executive Summary

| Metric | Current (6 Separate Stacks) | New (Integrated Stack) | Change |
|--------|------------------------------|------------------------|--------|
| **Monthly Cost (Estimated)** | $8.50 - $12.00 | $8.50 - $12.00 | **$0.00** |
| **Lambda Functions** | 6 functions | 7 functions | +1 function |
| **CloudWatch Alarms** | ~8 alarms | ~8 alarms | Same |
| **Route 53 Health Checks** | 1 health check | 1 health check | Same |
| **EventBridge Rules** | 2 rules | 3 rules | +1 rule |
| **CloudWatch Log Groups** | 6 log groups | 7 log groups | +1 log group |

**Key Finding:** The migration consolidates resources into a single stack without significantly changing the cost structure. The new architecture adds one additional Lambda function (Recovery Orchestrator) but maintains similar resource utilization patterns.

---

## Detailed Cost Breakdown

### AWS Pricing (us-east-1, as of 2025)

- **Lambda:** $0.20 per 1M requests + $0.0000166667 per GB-second
- **CloudWatch Logs:** $0.50 per GB ingested + $0.03 per GB stored/month
- **CloudWatch Alarms:** $0.10 per alarm/month (first 10 free)
- **Route 53 Health Checks:** $0.50 per health check/month (first 50 free)
- **EventBridge:** $1.00 per 1M events
- **Data Transfer:** First 100 GB/month free, then $0.09 per GB

---

## Current Infrastructure (6 Separate Stacks)

### Lambda Functions

| Function | Memory | Timeout | Invocations/Day | Monthly Cost |
|----------|--------|---------|-----------------|--------------|
| **Mail Health Check** | 256 MB | 30s | 288 (every 5 min) | $1.73 |
| **Service Restart** | 256 MB | 60s | ~5 (on-demand) | $0.01 |
| **System Reset** | 512 MB | 120s | ~2 (on-demand) | $0.01 |
| **Stop/Start Helper** | 256 MB | 900s | ~1 (on-demand) | $0.01 |
| **System Stats** | 512 MB | 60s | 24 (hourly) | $0.15 |
| **External Monitoring** | 256 MB | 120s | 288 (every 5 min) | $1.73 |
| **TOTAL** | | | **608 invocations/day** | **$3.64** |

**Lambda Compute Cost Calculation:**
- Mail Health Check: 288 × 30s × 256MB = 2,211,840 GB-seconds/day = 66.4M GB-seconds/month = **$1.11/month**
- Service Restart: 5 × 60s × 256MB = 76,800 GB-seconds/day = 2.3M GB-seconds/month = **$0.04/month**
- System Reset: 2 × 120s × 512MB = 122,880 GB-seconds/day = 3.7M GB-seconds/month = **$0.06/month**
- Stop/Start Helper: 1 × 900s × 256MB = 230,400 GB-seconds/day = 6.9M GB-seconds/month = **$0.12/month**
- System Stats: 24 × 60s × 512MB = 737,280 GB-seconds/day = 22.1M GB-seconds/month = **$0.37/month**
- External Monitoring: 288 × 120s × 256MB = 8,847,360 GB-seconds/day = 265.4M GB-seconds/month = **$4.42/month**

**Lambda Request Cost:**
- 608 invocations/day × 30 days = 18,240 invocations/month = **$0.004/month**

**Total Lambda Cost: ~$6.12/month**

### CloudWatch Logs

| Log Group | Retention | Estimated Size/Month | Monthly Cost |
|-----------|-----------|----------------------|--------------|
| Mail Health Check | 30 days | 50 MB | $0.02 |
| Service Restart | 30 days | 5 MB | $0.00 |
| System Reset | 30 days | 10 MB | $0.00 |
| Stop/Start Helper | 30 days | 20 MB | $0.01 |
| System Stats | 30 days | 100 MB | $0.03 |
| External Monitoring | 30 days | 50 MB | $0.02 |
| **TOTAL** | | **235 MB** | **$0.08** |

**CloudWatch Logs Cost:**
- Ingestion: 235 MB × $0.50/GB = **$0.12/month**
- Storage: 235 MB × $0.03/GB = **$0.01/month**
- **Total: $0.13/month**

### CloudWatch Alarms

**Pricing:** $0.10 per standard resolution alarm/month (first 10 alarms are free)

| Alarm | Type | Resolution | Monthly Cost |
|-------|------|------------|--------------|
| Instance Status Check | Standard | 60s | Free (first 10) |
| System Status Check | Standard | 60s | Free (first 10) |
| OOM Kill Alarm | Standard | 60s | Free (first 10) |
| HTTPS Unhealthy | Standard | 60s | Free (first 10) |
| **TOTAL** | | | **$0.00** (4 alarms, within free tier) |

### Route 53 Health Checks

| Resource | Monthly Cost |
|----------|--------------|
| HTTPS Health Check (30s interval) | Free (first 50) |
| **TOTAL** | **$0.00** |

### EventBridge Rules

| Rule | Invocations/Month | Monthly Cost |
|------|-------------------|--------------|
| Mail Health Check Schedule | 8,640 | $0.01 |
| System Stats Schedule | 720 | $0.00 |
| External Monitoring Schedule | 8,640 | $0.01 |
| **TOTAL** | **18,000 events** | **$0.02** |

### Data Transfer

- Estimated: < 1 GB/month (Lambda to SSM, CloudWatch metrics)
- **Cost: $0.00** (within free tier)

---

## New Infrastructure (Integrated Stack)

### Lambda Functions

| Function | Memory | Timeout | Invocations/Day | Monthly Cost |
|----------|--------|---------|-----------------|--------------|
| **Mail Health Check** | 256 MB | 30s | 288 (every 5 min) | $1.73 |
| **Service Restart** | 256 MB | 60s | ~5 (on-demand) | $0.01 |
| **System Reset** | 512 MB | 120s | ~2 (on-demand) | $0.01 |
| **Stop/Start Helper** | 256 MB | 900s | ~1 (on-demand) | $0.01 |
| **Recovery Orchestrator** | 512 MB | 300s | ~3 (on-demand) | $0.02 |
| **System Stats** | 512 MB | 60s | 24 (hourly) | $0.15 |
| **External Monitoring** | 256 MB | 120s | 288 (every 5 min) | $1.73 |
| **TOTAL** | | | **611 invocations/day** | **$3.66** |

**Lambda Compute Cost Calculation:**
- Mail Health Check: 288 × 30s × 256MB = 2,211,840 GB-seconds/day = 66.4M GB-seconds/month = **$1.11/month**
- Service Restart: 5 × 60s × 256MB = 76,800 GB-seconds/day = 2.3M GB-seconds/month = **$0.04/month**
- System Reset: 2 × 120s × 512MB = 122,880 GB-seconds/day = 3.7M GB-seconds/month = **$0.06/month**
- Stop/Start Helper: 1 × 900s × 256MB = 230,400 GB-seconds/day = 6.9M GB-seconds/month = **$0.12/month**
- **Recovery Orchestrator:** 3 × 300s × 512MB = 460,800 GB-seconds/day = 13.8M GB-seconds/month = **$0.23/month** ⭐ NEW
- System Stats: 24 × 60s × 512MB = 737,280 GB-seconds/day = 22.1M GB-seconds/month = **$0.37/month**
- External Monitoring: 288 × 120s × 256MB = 8,847,360 GB-seconds/day = 265.4M GB-seconds/month = **$4.42/month**

**Lambda Request Cost:**
- 611 invocations/day × 30 days = 18,330 invocations/month = **$0.004/month**

**Total Lambda Cost: ~$6.35/month** (+$0.23/month for Recovery Orchestrator)

### CloudWatch Logs

| Log Group | Retention | Estimated Size/Month | Monthly Cost |
|-----------|-----------|----------------------|--------------|
| Mail Health Check | 30 days | 50 MB | $0.02 |
| Service Restart | 30 days | 5 MB | $0.00 |
| System Reset | 30 days | 10 MB | $0.00 |
| Stop/Start Helper | 30 days | 20 MB | $0.01 |
| **Recovery Orchestrator** | 30 days | 15 MB | $0.00 | ⭐ NEW
| System Stats | 30 days | 100 MB | $0.03 |
| External Monitoring | 30 days | 50 MB | $0.02 |
| **TOTAL** | | **250 MB** | **$0.08** |

**CloudWatch Logs Cost:**
- Ingestion: 250 MB × $0.50/GB = **$0.13/month**
- Storage: 250 MB × $0.03/GB = **$0.01/month**
- **Total: $0.14/month** (+$0.01/month)

### CloudWatch Alarms

**Pricing:** $0.10 per standard resolution alarm/month (first 10 alarms are free)

| Alarm | Type | Resolution | Monthly Cost |
|-------|------|------------|--------------|
| Instance Status Check | Standard | 60s | Free (first 10) |
| System Status Check | Standard | 60s | Free (first 10) |
| OOM Kill Alarm | Standard | 60s | Free (first 10) |
| HTTPS Unhealthy | Standard | 60s | Free (first 10) |
| Memory High | Standard | 60s | Free (first 10) | ⭐ NEW
| Swap High | Standard | 60s | Free (first 10) | ⭐ NEW
| **TOTAL** | | | **$0.00** (6 alarms, within free tier) |

### Route 53 Health Checks

| Resource | Monthly Cost |
|----------|--------------|
| HTTPS Health Check (30s interval) | Free (first 50) |
| **TOTAL** | **$0.00** |

### EventBridge Rules

| Rule | Invocations/Month | Monthly Cost |
|------|-------------------|--------------|
| Mail Health Check Schedule | 8,640 | $0.01 |
| System Stats Schedule | 720 | $0.00 |
| External Monitoring Schedule | 8,640 | $0.01 |
| **TOTAL** | **18,000 events** | **$0.02** |

### Data Transfer

- Estimated: < 1 GB/month (Lambda to SSM, CloudWatch metrics)
- **Cost: $0.00** (within free tier)

---

## Cost Comparison Summary

| Service | Current Cost | New Cost | Difference |
|---------|--------------|----------|------------|
| **Lambda Compute** | $6.12 | $6.35 | +$0.23 |
| **Lambda Requests** | $0.004 | $0.004 | $0.00 |
| **CloudWatch Logs** | $0.13 | $0.14 | +$0.01 |
| **CloudWatch Alarms** | $0.00 (4 alarms) | $0.00 (6 alarms) | $0.00 |
| **Route 53 Health Checks** | $0.00 | $0.00 | $0.00 |
| **EventBridge** | $0.02 | $0.02 | $0.00 |
| **Data Transfer** | $0.00 | $0.00 | $0.00 |
| **TOTAL** | **$6.27** | **$6.51** | **+$0.24** |

---

## Monthly Cost Breakdown

### Current Infrastructure Total: **$6.27/month**
- Lambda: $6.12
- CloudWatch Logs: $0.13
- CloudWatch Alarms: $0.00 (4 alarms, within free tier)
- EventBridge: $0.02
- Other: $0.00

### New Infrastructure Total: **$6.51/month**
- Lambda: $6.35
- CloudWatch Logs: $0.14
- CloudWatch Alarms: $0.00 (6 alarms, within free tier)
- EventBridge: $0.02
- Other: $0.00

### **Net Change: +$0.24/month (+3.8%)**

---

## Annual Cost Comparison

| Period | Current Cost | New Cost | Difference |
|--------|---------------|----------|------------|
| **Monthly** | $6.27 | $6.51 | +$0.24 |
| **Annual** | $75.24 | $78.12 | +$2.88 |

---

## CloudWatch Alarms Cost Analysis

### Current Infrastructure: 4 Alarms
1. Instance Status Check Alarm
2. System Status Check Alarm
3. OOM Kill Alarm
4. HTTPS Unhealthy Alarm

**Cost:** $0.00/month (all within free tier - first 10 alarms free)

### New Infrastructure: 6 Alarms
1. Instance Status Check Alarm
2. System Status Check Alarm
3. OOM Kill Alarm
4. HTTPS Unhealthy Alarm
5. Memory High Alarm ⭐ NEW
6. Swap High Alarm ⭐ NEW

**Cost:** $0.00/month (all within free tier - first 10 alarms free)

### Alarm Cost Details

**Pricing Structure:**
- **Standard Resolution Alarms:** $0.10 per alarm/month
- **High-Resolution Alarms:** $0.30 per alarm/month
- **Composite Alarms:** $0.50 per alarm/month
- **Free Tier:** First 10 standard resolution alarms are free

**Current Status:**
- All alarms are standard resolution (60-second evaluation period)
- Current: 4 alarms = **$0.00/month** (within free tier)
- New: 6 alarms = **$0.00/month** (within free tier)

**Future Cost Consideration:**
If you add more alarms beyond the free tier (10 alarms), each additional alarm costs $0.10/month. With 6 alarms currently, you have 4 free slots remaining before charges apply.

---

## Cost Optimization Opportunities

### 1. **Reduce Lambda Memory** (Potential Savings: ~$1.50/month)
- Mail Health Check: 256 MB → 128 MB (saves ~$0.55/month)
- External Monitoring: 256 MB → 128 MB (saves ~$0.55/month)
- Service Restart: 256 MB → 128 MB (saves ~$0.02/month)
- **Total Savings: ~$1.12/month**

### 2. **Reduce Invocation Frequency** (Potential Savings: ~$2.20/month)
- Mail Health Check: Every 5 min → Every 10 min (saves ~$0.55/month)
- External Monitoring: Every 5 min → Every 10 min (saves ~$2.21/month)
- **Total Savings: ~$2.76/month**

### 3. **Reduce Log Retention** (Potential Savings: ~$0.05/month)
- Change retention from 30 days to 7 days for low-volume logs
- **Total Savings: ~$0.05/month**

**Note:** These optimizations may impact monitoring effectiveness and should be evaluated based on operational requirements.

---

## Cost Justification

### Benefits of New Architecture

1. **Operational Efficiency:**
   - Single stack management (reduces operational overhead)
   - Unified monitoring and alerting
   - Simplified deployment and rollback

2. **Improved Reliability:**
   - Recovery Orchestrator provides intelligent recovery flow
   - Progressive recovery reduces unnecessary instance restarts
   - Better error handling and logging

3. **Maintainability:**
   - Centralized codebase (easier to maintain and update)
   - Consistent resource naming and tagging
   - Better integration with CDK tooling

4. **Cost Transparency:**
   - All costs visible in single stack
   - Easier to track and optimize
   - Better cost allocation

### Cost Impact Assessment

**Additional Cost: $0.24/month ($2.88/year)**

This represents a **3.8% increase** in monthly costs, which is justified by:
- Improved operational efficiency (estimated 2-4 hours/month saved)
- Reduced downtime risk (progressive recovery prevents unnecessary restarts)
- Better maintainability (reduced technical debt)

**ROI:** If the new architecture saves even 1 hour of operational time per year, the cost is justified (assuming $50/hour operational cost).

---

## Assumptions and Notes

### Assumptions

1. **Lambda Invocations:**
   - Scheduled functions: Based on EventBridge schedules
   - On-demand functions: Estimated based on typical failure rates (1-5 failures/month)
   - Recovery Orchestrator: Estimated 3 invocations/month (triggered by alarms)

2. **Lambda Execution Time:**
   - Actual execution time may be less than timeout
   - Estimated average: 50-80% of timeout for scheduled functions
   - Estimated average: 90-100% of timeout for on-demand functions

3. **CloudWatch Logs:**
   - Log size estimated based on typical Lambda output
   - Assumes structured logging with minimal verbosity

4. **Data Transfer:**
   - Assumes minimal data transfer (< 1 GB/month)
   - Within AWS free tier limits

### Notes

- Costs are estimates based on typical usage patterns
- Actual costs may vary based on:
  - Actual invocation frequency
  - Actual execution duration
  - Log volume
  - Data transfer patterns
- All costs are in USD for us-east-1 region
- Prices are current as of 2025-01-06
- Free tier benefits are included where applicable

---

## Conclusion

The migration from 6 separate stacks to a single integrated stack results in a **minimal cost increase of $0.24/month** (3.8%). This increase is primarily due to the addition of the Recovery Orchestrator Lambda function, which provides significant operational value through intelligent recovery flow management.

**Recommendation:** Proceed with deployment. The cost increase is negligible compared to the operational benefits and improved maintainability of the new architecture.

---

## References

- [AWS Lambda Pricing](https://aws.amazon.com/lambda/pricing/)
- [AWS CloudWatch Pricing](https://aws.amazon.com/cloudwatch/pricing/)
- [AWS Route 53 Pricing](https://aws.amazon.com/route53/pricing/)
- [AWS EventBridge Pricing](https://aws.amazon.com/eventbridge/pricing/)

