#!/usr/bin/env bash
set -Eeuo pipefail
IFS=$'\n\t'

# Calculate monthly costs for emergency alarms stack

echo "=========================================="
echo "Emergency Alarms Cost Analysis"
echo "=========================================="
echo ""

# CloudWatch Alarms
ALARM_COUNT=3
ALARM_COST_PER_MONTH=0.10
ALARM_TOTAL=$(echo "$ALARM_COUNT * $ALARM_COST_PER_MONTH" | bc)

echo "📊 CloudWatch Alarms"
echo "----------------------------------------"
echo "Number of alarms: ${ALARM_COUNT}"
echo "Cost per alarm: \$${ALARM_COST_PER_MONTH}"
echo "Total alarm cost: \$${ALARM_TOTAL} per month"
echo ""

# CloudWatch Metrics
echo "📊 CloudWatch Metrics"
echo "----------------------------------------"
echo "Standard EC2 Metrics (StatusCheckFailed_Instance, StatusCheckFailed_System):"
echo "  - Included with EC2 at no additional cost"
echo ""
echo "Custom Metrics (oom_kills):"
echo "  - First 10,000 custom metrics: FREE"
echo "  - After 10,000: \$0.30 per metric per month"
echo "  - Current usage: 1 custom metric (well within free tier)"
echo "  - Cost: \$0.00 per month"
echo ""

# Lambda Invocations
echo "📊 Lambda Function Invocations"
echo "----------------------------------------"
echo "Pricing:"
echo "  - First 1,000,000 requests: FREE"
echo "  - After 1,000,000: \$0.20 per million requests"
echo ""
echo "Estimated usage scenarios:"
echo ""
echo "  Scenario 1: No failures (alarms never trigger)"
echo "    - Invocations: 0"
echo "    - Cost: \$0.00 per month"
echo ""
echo "  Scenario 2: 1 failure per month (1 restart)"
echo "    - Invocations: 1"
echo "    - Cost: \$0.00 per month (within free tier)"
echo ""
echo "  Scenario 3: 10 failures per month (10 restarts)"
echo "    - Invocations: 10"
echo "    - Cost: \$0.00 per month (within free tier)"
echo ""
echo "  Scenario 4: 100 failures per month (100 restarts)"
echo "    - Invocations: 100"
echo "    - Cost: \$0.00 per month (within free tier)"
echo ""
echo "  Scenario 5: 1,000 failures per month (1,000 restarts)"
echo "    - Invocations: 1,000"
echo "    - Cost: \$0.00 per month (within free tier)"
echo ""
echo "  Scenario 6: 10,000 failures per month (10,000 restarts)"
echo "    - Invocations: 10,000"
echo "    - Cost: \$0.00 per month (within free tier)"
echo ""

# Lambda Compute (GB-seconds)
echo "📊 Lambda Compute (Execution Time)"
echo "----------------------------------------"
echo "Pricing:"
echo "  - First 400,000 GB-seconds: FREE"
echo "  - After 400,000: \$0.0000166667 per GB-second"
echo ""
echo "Lambda configuration:"
echo "  - Memory: 256 MB (0.25 GB)"
echo "  - Timeout: 900 seconds (15 minutes)"
echo "  - Estimated execution time per restart: 5-10 minutes (300-600 seconds)"
echo ""
echo "Estimated usage scenarios:"
echo ""
echo "  Scenario 1: No failures"
echo "    - GB-seconds: 0"
echo "    - Cost: \$0.00 per month"
echo ""
echo "  Scenario 2: 1 failure per month"
echo "    - GB-seconds: 0.25 GB × 600 seconds = 150 GB-seconds"
echo "    - Cost: \$0.00 per month (within free tier)"
echo ""
echo "  Scenario 3: 10 failures per month"
echo "    - GB-seconds: 0.25 GB × 600 seconds × 10 = 1,500 GB-seconds"
echo "    - Cost: \$0.00 per month (within free tier)"
echo ""
echo "  Scenario 4: 100 failures per month"
echo "    - GB-seconds: 0.25 GB × 600 seconds × 100 = 15,000 GB-seconds"
echo "    - Cost: \$0.00 per month (within free tier)"
echo ""
echo "  Scenario 5: 1,000 failures per month"
echo "    - GB-seconds: 0.25 GB × 600 seconds × 1,000 = 150,000 GB-seconds"
echo "    - Cost: \$0.00 per month (within free tier)"
echo ""
echo "  Scenario 6: 10,000 failures per month"
echo "    - GB-seconds: 0.25 GB × 600 seconds × 10,000 = 1,500,000 GB-seconds"
echo "    - Cost: (1,500,000 - 400,000) × \$0.0000166667 = \$18.33 per month"
echo ""

# Scheduled Restart (daily at 3am)
echo "📊 Scheduled Daily Restart (3am EST)"
echo "----------------------------------------"
DAILY_RESTARTS=30  # ~30 days per month
echo "Restarts per month: ${DAILY_RESTARTS}"
echo ""
echo "Lambda invocations:"
echo "  - Invocations: ${DAILY_RESTARTS}"
echo "  - Cost: \$0.00 per month (within free tier)"
echo ""
echo "Lambda compute:"
SCHEDULED_GB_SECONDS=$(echo "0.25 * 600 * $DAILY_RESTARTS" | bc)
echo "  - GB-seconds: ${SCHEDULED_GB_SECONDS}"
echo "  - Cost: \$0.00 per month (within free tier)"
echo ""

# Total Cost Summary
echo "=========================================="
echo "Total Monthly Cost Summary"
echo "=========================================="
echo ""
echo "Base costs (always):"
echo "  - CloudWatch Alarms (3 alarms): \$${ALARM_TOTAL} per month"
echo "  - CloudWatch Metrics: \$0.00 per month (within free tier)"
echo ""
echo "Usage-based costs (depends on failures):"
echo "  - Lambda Invocations: \$0.00 per month (typical usage within free tier)"
echo "  - Lambda Compute: \$0.00 per month (typical usage within free tier)"
echo ""
echo "Scheduled restart costs:"
echo "  - Lambda Invocations: \$0.00 per month (within free tier)"
echo "  - Lambda Compute: \$0.00 per month (within free tier)"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
TOTAL_COST=$(echo "$ALARM_TOTAL" | bc)
echo "TOTAL MONTHLY COST: \$${TOTAL_COST} per month"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "💡 Cost Notes:"
echo "  - Base cost is fixed: \$${TOTAL_COST} per month for 3 alarms"
echo "  - Lambda costs are typically \$0.00 (within AWS free tier)"
echo "  - Even with 100+ failures per month, costs remain minimal"
echo "  - Only extreme scenarios (10,000+ failures) would incur additional Lambda costs"
echo ""














