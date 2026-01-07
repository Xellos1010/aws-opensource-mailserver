#!/usr/bin/env bash
set -Eeuo pipefail
IFS=$'\n\t'

# Diagnostic script for OOM alarm issues
# Checks if OOM detection is properly configured

DOMAIN="hepefoundation.org"
STACK_NAME="hepefoundation-org-mailserver"
REGION="us-east-1"
INSTANCE_ID="i-0a1ff83f513575ed4"
PROFILE="hepe-admin-mfa"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo "=========================================="
echo "OOM Alarm Diagnostic Tool"
echo "=========================================="
echo "Domain: ${DOMAIN}"
echo "Stack: ${STACK_NAME}"
echo "Instance: ${INSTANCE_ID}"
echo "=========================================="
echo

# Expected log group name
EXPECTED_LOG_GROUP="/ec2/syslog-${STACK_NAME}"
echo "📋 Checking Log Group Configuration"
echo "----------------------------------------"
echo "Expected log group: ${EXPECTED_LOG_GROUP}"

# Check if log group exists
LOG_GROUP_EXISTS=$(aws logs describe-log-groups \
    --profile "${PROFILE}" \
    --region "${REGION}" \
    --log-group-name-prefix "/ec2/syslog" \
    --query "logGroups[?logGroupName=='${EXPECTED_LOG_GROUP}'].logGroupName" \
    --output text 2>/dev/null || echo "")

if [ -n "$LOG_GROUP_EXISTS" ] && [ "$LOG_GROUP_EXISTS" != "None" ]; then
    echo -e "${GREEN}✓ Log group exists: ${EXPECTED_LOG_GROUP}${NC}"
    
    # Check recent log streams
    echo "Checking for recent log streams..."
    RECENT_STREAMS=$(aws logs describe-log-streams \
        --profile "${PROFILE}" \
        --region "${REGION}" \
        --log-group-name "${EXPECTED_LOG_GROUP}" \
        --order-by LastEventTime \
        --descending \
        --max-items 5 \
        --query 'logStreams[*].[logStreamName,lastEventTime]' \
        --output text 2>/dev/null || echo "")
    
    if [ -n "$RECENT_STREAMS" ]; then
        echo -e "${GREEN}✓ Found recent log streams${NC}"
        echo "$RECENT_STREAMS" | while read -r stream time; do
            if [ -n "$time" ]; then
                date_str=$(date -d "@$((time/1000))" 2>/dev/null || echo "unknown")
                echo "  - ${stream} (last event: ${date_str})"
            fi
        done
    else
        echo -e "${YELLOW}⚠ No recent log streams found${NC}"
        echo "  This suggests CloudWatch Agent may not be forwarding syslog"
    fi
else
    echo -e "${RED}✗ Log group NOT found: ${EXPECTED_LOG_GROUP}${NC}"
    echo "  This is a critical issue - OOM detection cannot work without the log group"
fi
echo

# Check for OOM metric filter
echo "📋 Checking OOM Metric Filter"
echo "----------------------------------------"
METRIC_FILTERS=$(aws logs describe-metric-filters \
    --profile "${PROFILE}" \
    --region "${REGION}" \
    --log-group-name "${EXPECTED_LOG_GROUP}" \
    --query 'metricFilters[?filterPattern==`Out of memory`]' \
    --output json 2>/dev/null || echo "[]")

if [ "$METRIC_FILTERS" != "[]" ] && [ -n "$METRIC_FILTERS" ]; then
    echo -e "${GREEN}✓ OOM metric filter found on correct log group${NC}"
    echo "$METRIC_FILTERS" | jq -r '.[] | "  Filter: \(.filterName) -> Metric: \(.metricTransformations[0].metricNamespace)/\(.metricTransformations[0].metricName)"'
else
    # Check if filter exists on wrong log group
    WRONG_FILTER=$(aws logs describe-metric-filters \
        --profile "${PROFILE}" \
        --region "${REGION}" \
        --log-group-name "/ec2/syslog" \
        --query 'metricFilters[?filterPattern==`Out of memory`]' \
        --output json 2>/dev/null || echo "[]")
    
    if [ "$WRONG_FILTER" != "[]" ] && [ -n "$WRONG_FILTER" ]; then
        echo -e "${RED}✗ OOM metric filter found on WRONG log group: /ec2/syslog${NC}"
        echo "  This is the problem! The filter should be on: ${EXPECTED_LOG_GROUP}"
        echo "  The filter exists but points to a log group that doesn't receive logs"
    else
        echo -e "${RED}✗ OOM metric filter NOT found${NC}"
        echo "  No metric filter configured for OOM detection"
    fi
fi
echo

# Check OOM metric data
echo "📋 Checking OOM Metric Data"
echo "----------------------------------------"
# Calculate dates (macOS compatible)
START_TIME=$(date -u -v-7d +%Y-%m-%dT%H:%M:%S 2>/dev/null || date -u -d '7 days ago' +%Y-%m-%dT%H:%M:%S 2>/dev/null || echo "")
END_TIME=$(date -u +%Y-%m-%dT%H:%M:%S)

METRIC_DATA=$(aws cloudwatch get-metric-statistics \
    --profile "${PROFILE}" \
    --region "${REGION}" \
    --namespace "EC2" \
    --metric-name "oom_kills" \
    --start-time "${START_TIME}" \
    --end-time "${END_TIME}" \
    --period 3600 \
    --statistics Sum \
    --output json 2>/dev/null || echo '{"Datapoints":[]}')

DATAPOINT_COUNT=$(echo "$METRIC_DATA" | jq '.Datapoints | length')

if [ "$DATAPOINT_COUNT" -gt 0 ]; then
    echo -e "${GREEN}✓ Found ${DATAPOINT_COUNT} OOM metric datapoint(s)${NC}"
    echo "$METRIC_DATA" | jq -r '.Datapoints[] | "  \(.Timestamp): \(.Sum) OOM kill(s)"'
else
    echo -e "${YELLOW}⚠ No OOM metric data found in last 7 days${NC}"
    echo "  This could mean:"
    echo "    1. No OOM kills occurred (good)"
    echo "    2. Metric filter is misconfigured (bad)"
    echo "    3. Logs aren't being forwarded to CloudWatch (bad)"
fi
echo

# Check CloudWatch Agent status on instance
echo "📋 Checking CloudWatch Agent Status"
echo "----------------------------------------"
echo "Attempting to check agent status via SSM..."
AGENT_STATUS=$(aws ssm send-command \
    --profile "${PROFILE}" \
    --region "${REGION}" \
    --instance-ids "${INSTANCE_ID}" \
    --document-name "AWS-RunShellScript" \
    --parameters 'commands=["systemctl status amazon-cloudwatch-agent --no-pager || echo AGENT_NOT_RUNNING"]' \
    --query 'Command.CommandId' \
    --output text 2>/dev/null || echo "")

if [ -n "$AGENT_STATUS" ]; then
    echo "Command sent. Waiting for result..."
    sleep 3
    
    COMMAND_OUTPUT=$(aws ssm get-command-invocation \
        --profile "${PROFILE}" \
        --region "${REGION}" \
        --command-id "$AGENT_STATUS" \
        --instance-id "${INSTANCE_ID}" \
        --query 'StandardOutputContent' \
        --output text 2>/dev/null || echo "")
    
    if echo "$COMMAND_OUTPUT" | grep -q "active (running)"; then
        echo -e "${GREEN}✓ CloudWatch Agent is running${NC}"
    elif echo "$COMMAND_OUTPUT" | grep -q "AGENT_NOT_RUNNING"; then
        echo -e "${RED}✗ CloudWatch Agent is NOT running${NC}"
        echo "  This is critical - syslog won't be forwarded without the agent"
    else
        echo -e "${YELLOW}⚠ Could not determine agent status${NC}"
        echo "  Output: ${COMMAND_OUTPUT}"
    fi
else
    echo -e "${YELLOW}⚠ Could not check agent status (SSM may not be available)${NC}"
fi
echo

# Check for OOM messages in syslog (if we can access it)
echo "📋 Checking for OOM Messages in CloudWatch Logs"
echo "----------------------------------------"
if [ -n "$LOG_GROUP_EXISTS" ] && [ "$LOG_GROUP_EXISTS" != "None" ]; then
    # Search for OOM messages in last 7 days
    START_TIME_MS=$(($(date +%s) - 604800))000
    OOM_MESSAGES=$(aws logs filter-log-events \
        --profile "${PROFILE}" \
        --region "${REGION}" \
        --log-group-name "${EXPECTED_LOG_GROUP}" \
        --filter-pattern "Out of memory" \
        --start-time "${START_TIME_MS}" \
        --query 'events[*].[logStreamName,message]' \
        --output text 2>/dev/null || echo "")
    
    if [ -n "$OOM_MESSAGES" ]; then
        echo -e "${RED}✗ Found OOM messages in logs!${NC}"
        echo "$OOM_MESSAGES" | head -5 | while read -r stream message; do
            echo "  Stream: ${stream}"
            echo "  Message: ${message:0:100}..."
            echo
        done
        echo "  ⚠ These OOM kills were logged but may not have triggered the alarm"
    else
        echo -e "${GREEN}✓ No OOM messages found in CloudWatch Logs (last 7 days)${NC}"
        echo "  Note: Your system logs showed an OOM kill, but it may not be in CloudWatch yet"
    fi
else
    echo -e "${YELLOW}⚠ Cannot check logs - log group not found${NC}"
fi
echo

# Summary and recommendations
echo "=========================================="
echo "Summary & Recommendations"
echo "=========================================="
echo

if [ -z "$LOG_GROUP_EXISTS" ] || [ "$LOG_GROUP_EXISTS" == "None" ]; then
    echo -e "${RED}CRITICAL: Log group ${EXPECTED_LOG_GROUP} does not exist${NC}"
    echo "  → Fix: Ensure CloudFormation stack creates the log group"
    echo "  → Check: apps/cdk-*/core/src/stacks/core-stack.ts or CloudFormation template"
    echo
fi

if echo "$METRIC_FILTERS" | grep -q "Out of memory" && [ -z "$LOG_GROUP_EXISTS" ]; then
    echo -e "${RED}CRITICAL: Metric filter points to wrong log group${NC}"
    echo "  → Fix: Update metric filter to use: ${EXPECTED_LOG_GROUP}"
    echo "  → Current: May be pointing to /ec2/syslog (hardcoded)"
    echo
fi

echo "Next Steps:"
echo "1. Verify CloudWatch Agent is running and forwarding syslog"
echo "2. Check that log group ${EXPECTED_LOG_GROUP} exists and receives logs"
echo "3. Verify OOM metric filter points to the correct log group"
echo "4. Consider increasing instance memory if OOM kills continue"
echo "5. Check instance memory usage: free -h"
echo

