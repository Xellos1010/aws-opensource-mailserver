#!/usr/bin/env bash
set -Eeuo pipefail
IFS=$'\n\t'

# Test script to verify CloudWatch Agent configuration
# Can be run remotely via AWS CLI or manually on the instance

DOMAIN="k3frame.com"
STACK_NAME="hepefoundation-org-mailserver"
INSTANCE_ID="i-0a1ff83f513575ed4"
REGION="us-east-1"
PROFILE="hepe-admin-mfa"
SSM_PARAM_NAME="/cwagent-linux-${STACK_NAME}"
LOG_GROUP_NAME="/ec2/syslog-${STACK_NAME}"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo "=========================================="
echo "CloudWatch Agent Configuration Test"
echo "=========================================="
echo "Domain: ${DOMAIN}"
echo "Instance: ${INSTANCE_ID}"
echo "=========================================="
echo

# Test 1: Verify SSM Parameter exists
echo "📋 Test 1: SSM Parameter"
echo "----------------------------------------"
PARAM_VALUE=$(aws ssm get-parameter \
    --profile "${PROFILE}" \
    --region "${REGION}" \
    --name "${SSM_PARAM_NAME}" \
    --query 'Parameter.Value' \
    --output text 2>/dev/null || echo "")

if [ -n "$PARAM_VALUE" ]; then
    echo -e "${GREEN}✓ SSM Parameter exists${NC}"
    echo "  Parameter: ${SSM_PARAM_NAME}"
    
    # Verify it contains the log group name
    if echo "$PARAM_VALUE" | grep -q "${LOG_GROUP_NAME}"; then
        echo -e "${GREEN}✓ Configuration includes correct log group${NC}"
    else
        echo -e "${RED}✗ Configuration missing log group name${NC}"
    fi
    
    # Verify it includes syslog path
    if echo "$PARAM_VALUE" | grep -q "/var/log/syslog"; then
        echo -e "${GREEN}✓ Configuration includes syslog path${NC}"
    else
        echo -e "${RED}✗ Configuration missing syslog path${NC}"
    fi
else
    echo -e "${RED}✗ SSM Parameter not found${NC}"
fi
echo

# Test 2: Verify SSM Association exists
echo "📋 Test 2: SSM Association"
echo "----------------------------------------"
# Find association by instance ID and document name
ASSOC_ID=$(aws ssm list-associations \
    --profile "${PROFILE}" \
    --region "${REGION}" \
    --query "Associations[?Name=='AmazonCloudWatch-ManageAgent' && Targets[0].Values[0]=='${INSTANCE_ID}'].AssociationId" \
    --output text 2>/dev/null | head -1 || echo "")

if [ -n "$ASSOC_ID" ] && [ "$ASSOC_ID" != "None" ]; then
    echo -e "${GREEN}✓ SSM Association exists${NC}"
    echo "  Association ID: ${ASSOC_ID}"
    
    # Get association details
    ASSOC_DETAILS=$(aws ssm describe-association \
        --profile "${PROFILE}" \
        --region "${REGION}" \
        --association-id "${ASSOC_ID}" \
        --query '{Name:Name,Status:Status,Targets:Targets}' \
        --output json 2>/dev/null || echo "{}")
    
    if echo "$ASSOC_DETAILS" | jq -e '.Targets[0].Values[0]' >/dev/null 2>&1; then
        TARGET_INSTANCE=$(echo "$ASSOC_DETAILS" | jq -r '.Targets[0].Values[0]')
        if [ "$TARGET_INSTANCE" == "$INSTANCE_ID" ]; then
            echo -e "${GREEN}✓ Association targets correct instance${NC}"
        else
            echo -e "${YELLOW}⚠ Association targets different instance: ${TARGET_INSTANCE}${NC}"
        fi
    fi
else
    echo -e "${RED}✗ SSM Association not found${NC}"
fi
echo

# Test 3: Verify Log Group exists
echo "📋 Test 3: CloudWatch Log Group"
echo "----------------------------------------"
LOG_GROUP_EXISTS=$(aws logs describe-log-groups \
    --profile "${PROFILE}" \
    --region "${REGION}" \
    --log-group-name-prefix "${LOG_GROUP_NAME}" \
    --query "logGroups[?logGroupName=='${LOG_GROUP_NAME}'].logGroupName" \
    --output text 2>/dev/null || echo "")

if [ -n "$LOG_GROUP_EXISTS" ] && [ "$LOG_GROUP_EXISTS" != "None" ]; then
    echo -e "${GREEN}✓ Log group exists${NC}"
    echo "  Log Group: ${LOG_GROUP_NAME}"
    
    # Check for log streams
    LOG_STREAMS=$(aws logs describe-log-streams \
        --profile "${PROFILE}" \
        --region "${REGION}" \
        --log-group-name "${LOG_GROUP_NAME}" \
        --order-by LastEventTime \
        --descending \
        --max-items 1 \
        --query 'logStreams[0].lastEventTime' \
        --output text 2>/dev/null || echo "")
    
    if [ -n "$LOG_STREAMS" ] && [ "$LOG_STREAMS" != "None" ]; then
        # Check if recent (within last hour)
        CURRENT_TIME=$(date +%s)000
        STREAM_TIME=$LOG_STREAMS
        TIME_DIFF=$((CURRENT_TIME - STREAM_TIME))
        
        if [ $TIME_DIFF -lt 3600000 ]; then
            echo -e "${GREEN}✓ Recent log activity found (within last hour)${NC}"
        else
            echo -e "${YELLOW}⚠ Log activity found but not recent (${TIME_DIFF}ms ago)${NC}"
        fi
    else
        echo -e "${YELLOW}⚠ No log streams found yet${NC}"
        echo "  This is normal if agent was just configured"
    fi
else
    echo -e "${RED}✗ Log group not found${NC}"
fi
echo

# Test 4: Verify OOM Metric Filter
echo "📋 Test 4: OOM Metric Filter"
echo "----------------------------------------"
METRIC_FILTER=$(aws logs describe-metric-filters \
    --profile "${PROFILE}" \
    --region "${REGION}" \
    --log-group-name "${LOG_GROUP_NAME}" \
    --query 'metricFilters[?filterPattern==`Out of memory`]' \
    --output json 2>/dev/null || echo "[]")

if [ "$METRIC_FILTER" != "[]" ] && [ -n "$METRIC_FILTER" ]; then
    echo -e "${GREEN}✓ OOM metric filter exists${NC}"
    FILTER_NAME=$(echo "$METRIC_FILTER" | jq -r '.[0].filterName')
    METRIC_NS=$(echo "$METRIC_FILTER" | jq -r '.[0].metricTransformations[0].metricNamespace')
    METRIC_NAME=$(echo "$METRIC_FILTER" | jq -r '.[0].metricTransformations[0].metricName')
    echo "  Filter: ${FILTER_NAME}"
    echo "  Metric: ${METRIC_NS}/${METRIC_NAME}"
else
    echo -e "${RED}✗ OOM metric filter not found${NC}"
fi
echo

# Test 5: Verify OOM Alarm
echo "📋 Test 5: OOM Alarm"
echo "----------------------------------------"
ALARM_NAME="OOMKillDetected-${INSTANCE_ID}"
ALARM_EXISTS=$(aws cloudwatch describe-alarms \
    --profile "${PROFILE}" \
    --region "${REGION}" \
    --alarm-names "${ALARM_NAME}" \
    --query 'MetricAlarms[0].AlarmName' \
    --output text 2>/dev/null || echo "")

if [ -n "$ALARM_EXISTS" ] && [ "$ALARM_EXISTS" != "None" ]; then
    echo -e "${GREEN}✓ OOM alarm exists${NC}"
    ALARM_STATE=$(aws cloudwatch describe-alarms \
        --profile "${PROFILE}" \
        --region "${REGION}" \
        --alarm-names "${ALARM_NAME}" \
        --query 'MetricAlarms[0].StateValue' \
        --output text 2>/dev/null || echo "UNKNOWN")
    echo "  Alarm: ${ALARM_NAME}"
    echo "  State: ${ALARM_STATE}"
else
    echo -e "${RED}✗ OOM alarm not found${NC}"
fi
echo

# Test 6: Check for recent OOM events in logs
echo "📋 Test 6: Recent OOM Events"
echo "----------------------------------------"
if [ -n "$LOG_GROUP_EXISTS" ] && [ "$LOG_GROUP_EXISTS" != "None" ]; then
    # Search for OOM messages in last 24 hours
    START_TIME=$(($(date +%s) - 86400))000
    OOM_EVENTS=$(aws logs filter-log-events \
        --profile "${PROFILE}" \
        --region "${REGION}" \
        --log-group-name "${LOG_GROUP_NAME}" \
        --filter-pattern "Out of memory" \
        --start-time "${START_TIME}" \
        --query 'events[*].[logStreamName,message]' \
        --output text 2>/dev/null || echo "")
    
    if [ -n "$OOM_EVENTS" ]; then
        EVENT_COUNT=$(echo "$OOM_EVENTS" | wc -l | tr -d ' ')
        echo -e "${YELLOW}⚠ Found ${EVENT_COUNT} OOM event(s) in last 24 hours${NC}"
        echo "$OOM_EVENTS" | head -3 | while read -r stream message; do
            echo "  Stream: ${stream}"
            echo "  Message: ${message:0:80}..."
        done
    else
        echo -e "${GREEN}✓ No OOM events found in last 24 hours${NC}"
    fi
else
    echo -e "${YELLOW}⚠ Cannot check - log group not found${NC}"
fi
echo

# Summary
echo "=========================================="
echo "Test Summary"
echo "=========================================="
TESTS_PASSED=0
TESTS_FAILED=0

[ -n "$PARAM_VALUE" ] && TESTS_PASSED=$((TESTS_PASSED+1)) || TESTS_FAILED=$((TESTS_FAILED+1))
[ -n "$ASSOC_ID" ] && [ "$ASSOC_ID" != "None" ] && TESTS_PASSED=$((TESTS_PASSED+1)) || TESTS_FAILED=$((TESTS_FAILED+1))
[ -n "$LOG_GROUP_EXISTS" ] && [ "$LOG_GROUP_EXISTS" != "None" ] && TESTS_PASSED=$((TESTS_PASSED+1)) || TESTS_FAILED=$((TESTS_FAILED+1))
[ "$METRIC_FILTER" != "[]" ] && TESTS_PASSED=$((TESTS_PASSED+1)) || TESTS_FAILED=$((TESTS_FAILED+1))
[ -n "$ALARM_EXISTS" ] && [ "$ALARM_EXISTS" != "None" ] && TESTS_PASSED=$((TESTS_PASSED+1)) || TESTS_FAILED=$((TESTS_FAILED+1))

echo "Tests Passed: ${TESTS_PASSED}/5"
echo "Tests Failed: ${TESTS_FAILED}/5"
echo

if [ $TESTS_FAILED -eq 0 ]; then
    echo -e "${GREEN}✅ All configuration tests passed!${NC}"
    echo
    echo "To verify agent is running on the instance, SSH in and run:"
    echo "  systemctl status amazon-cloudwatch-agent"
    echo "  sudo journalctl -u amazon-cloudwatch-agent -n 50"
else
    echo -e "${YELLOW}⚠ Some tests failed. Please review the output above.${NC}"
fi
echo

