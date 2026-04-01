#!/usr/bin/env bash
set -Eeuo pipefail
IFS=$'\n\t'

# Check Instance Health Script
# Monitors EC2 instance status checks, CloudWatch alarms, and provides health summary
#
# Usage: ./check-instance-health.sh [domain] [profile]
# Example: ./check-instance-health.sh hepefoundation.org hepe-admin-mfa

# Default domain name
DEFAULT_DOMAIN="askdaokapra.com"
DEFAULT_PROFILE="hepe-admin-mfa"
DEFAULT_REGION="us-east-1"

# Check if domain name was provided as first argument, otherwise use default
DOMAIN_NAME=${1:-$DEFAULT_DOMAIN}
AWS_PROFILE=${2:-$DEFAULT_PROFILE}
REGION=${3:-$DEFAULT_REGION}

# Create stack name from domain
STACK_NAME=$(echo "${DOMAIN_NAME}" | sed 's/\./-/g')-mailserver

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "=========================================="
echo "Instance Health Check"
echo "=========================================="
echo "Domain: ${DOMAIN_NAME}"
echo "Stack: ${STACK_NAME}"
echo "Region: ${REGION}"
echo "Profile: ${AWS_PROFILE}"
echo "=========================================="
echo ""

# Get instance ID from EC2
INSTANCE_ID=$(aws ec2 describe-instances \
    --filters "Name=tag:Name,Values=MailInABoxInstance-${STACK_NAME}" \
    --profile "${AWS_PROFILE}" \
    --region "${REGION}" \
    --query 'Reservations[0].Instances[0].InstanceId' \
    --output text 2>/dev/null)

if [ -z "$INSTANCE_ID" ] || [ "$INSTANCE_ID" = "None" ]; then
  echo -e "${RED}Error: Could not retrieve Instance ID from EC2${NC}"
  exit 1
fi

echo "Instance ID: ${INSTANCE_ID}"
echo ""

# Function to check instance status
check_instance_status() {
    local status_output
    status_output=$(aws ec2 describe-instance-status \
        --profile "${AWS_PROFILE}" \
        --region "${REGION}" \
        --instance-ids "${INSTANCE_ID}" \
        --include-all-instances \
        --query 'InstanceStatuses[0]' \
        --output json 2>/dev/null)

    if [ -z "$status_output" ] || [ "$status_output" = "null" ]; then
        echo -e "${RED}Error: Could not retrieve instance status${NC}"
        return 1
    fi

    local state=$(echo "$status_output" | jq -r '.InstanceState.Name // "unknown"')
    local system_status=$(echo "$status_output" | jq -r '.SystemStatus.Status // "unknown"')
    local instance_status=$(echo "$status_output" | jq -r '.InstanceStatus.Status // "unknown"')

    echo "=== Instance Status ==="
    echo "State: ${state}"
    echo "System Status Check: ${system_status}"
    echo "Instance Status Check: ${instance_status}"
    echo ""

    # Check for failures
    local has_issues=0
    if [ "$system_status" != "ok" ]; then
        echo -e "${RED}⚠️  WARNING: System Status Check is ${system_status}${NC}"
        has_issues=1
    fi

    if [ "$instance_status" != "ok" ]; then
        echo -e "${RED}⚠️  WARNING: Instance Status Check is ${instance_status}${NC}"
        has_issues=1
    fi

    if [ "$state" != "running" ]; then
        echo -e "${YELLOW}⚠️  WARNING: Instance state is ${state}${NC}"
        has_issues=1
    fi

    if [ $has_issues -eq 0 ]; then
        echo -e "${GREEN}✓ All status checks passed${NC}"
    fi

    echo ""
    return $has_issues
}

# Function to check CloudWatch alarms
check_alarms() {
    echo "=== CloudWatch Alarms ==="

    local alarm_names=(
        "InstanceStatusCheck-${INSTANCE_ID}"
        "SystemStatusCheck-${INSTANCE_ID}"
        "OOMKillDetected-${INSTANCE_ID}"
        "MemHigh-${INSTANCE_ID}"
        "SwapHigh-${INSTANCE_ID}"
    )

    local has_alarms=0
    local alarm_count=0

    for alarm_name in "${alarm_names[@]}"; do
        local alarm_info
        alarm_info=$(aws cloudwatch describe-alarms \
            --profile "${AWS_PROFILE}" \
            --region "${REGION}" \
            --alarm-names "${alarm_name}" \
            --query 'MetricAlarms[0]' \
            --output json 2>/dev/null)

        if [ -z "$alarm_info" ] || [ "$alarm_info" = "null" ]; then
            echo -e "${YELLOW}⚠️  ${alarm_name}: Not found${NC}"
            continue
        fi

        local state=$(echo "$alarm_info" | jq -r '.StateValue // "UNKNOWN"')
        local reason=$(echo "$alarm_info" | jq -r '.StateReason // "N/A"')
        local updated=$(echo "$alarm_info" | jq -r '.StateUpdatedTimestamp // "N/A"')

        alarm_count=$((alarm_count + 1))

        if [ "$state" = "ALARM" ]; then
            echo -e "${RED}🚨 ${alarm_name}: ${state}${NC}"
            echo "   Reason: ${reason}"
            echo "   Updated: ${updated}"
            has_alarms=1
        elif [ "$state" = "INSUFFICIENT_DATA" ]; then
            echo -e "${YELLOW}⚠️  ${alarm_name}: ${state}${NC}"
        else
            echo -e "${GREEN}✓ ${alarm_name}: ${state}${NC}"
        fi
    done

    echo ""
    if [ $alarm_count -eq 0 ]; then
        echo -e "${YELLOW}⚠️  No alarms found. Make sure alarms are deployed.${NC}"
    fi

    echo ""
    return $has_alarms
}

# Function to get recent memory metrics
check_memory_metrics() {
    echo "=== Memory Metrics (Last 15 minutes) ==="

    local end_time
    local start_time
    end_time=$(date -u +%Y-%m-%dT%H:%M:%S)
    if [[ "$OSTYPE" == "darwin"* ]]; then
        start_time=$(date -u -v-15M +%Y-%m-%dT%H:%M:%S)
    else
        start_time=$(date -u -d '15 minutes ago' +%Y-%m-%dT%H:%M:%S)
    fi

    # Get memory usage
    local mem_data
    mem_data=$(aws cloudwatch get-metric-statistics \
        --profile "${AWS_PROFILE}" \
        --region "${REGION}" \
        --namespace CWAgent \
        --metric-name mem_used_percent \
        --dimensions Name=InstanceId,Value="${INSTANCE_ID}" \
        --start-time "${start_time}" \
        --end-time "${end_time}" \
        --period 300 \
        --statistics Average \
        --query 'Datapoints | sort_by(@, &Timestamp) | [-1]' \
        --output json 2>/dev/null)

    if [ -n "$mem_data" ] && [ "$mem_data" != "null" ] && [ "$mem_data" != "[]" ]; then
        local mem_percent=$(echo "$mem_data" | jq -r '.Average // 0')
        local timestamp=$(echo "$mem_data" | jq -r '.Timestamp // "N/A"')
        printf "Memory Usage: %.1f%% (at %s)\n" "$mem_percent" "$timestamp"

        # Compare using awk (more portable than bc)
        if awk -v mem="$mem_percent" 'BEGIN {exit !(mem > 85)}'; then
            echo -e "${RED}⚠️  Memory usage is above 85% threshold${NC}"
        fi
    else
        echo -e "${YELLOW}⚠️  No memory metrics available (CloudWatch Agent may not be configured)${NC}"
    fi

    # Get swap usage
    local swap_data
    swap_data=$(aws cloudwatch get-metric-statistics \
        --profile "${AWS_PROFILE}" \
        --region "${REGION}" \
        --namespace CWAgent \
        --metric-name swap_used_percent \
        --dimensions Name=InstanceId,Value="${INSTANCE_ID}" \
        --start-time "${start_time}" \
        --end-time "${end_time}" \
        --period 300 \
        --statistics Average \
        --query 'Datapoints | sort_by(@, &Timestamp) | [-1]' \
        --output json 2>/dev/null)

    if [ -n "$swap_data" ] && [ "$swap_data" != "null" ] && [ "$swap_data" != "[]" ]; then
        local swap_percent=$(echo "$swap_data" | jq -r '.Average // 0')
        local timestamp=$(echo "$swap_data" | jq -r '.Timestamp // "N/A"')
        printf "Swap Usage: %.1f%% (at %s)\n" "$swap_percent" "$timestamp"

        # Compare using awk (more portable than bc)
        if awk -v swap="$swap_percent" 'BEGIN {exit !(swap > 50)}'; then
            echo -e "${YELLOW}⚠️  Swap usage is above 50% threshold${NC}"
        fi
    else
        echo -e "${YELLOW}⚠️  No swap metrics available${NC}"
    fi

    echo ""
}

# Function to check for recent OOM kills
check_oom_kills() {
    echo "=== OOM Kill Detection (Last 24 hours) ==="

    local end_time
    local start_time
    end_time=$(date -u +%Y-%m-%dT%H:%M:%S)
    if [[ "$OSTYPE" == "darwin"* ]]; then
        start_time=$(date -u -v-24H +%Y-%m-%dT%H:%M:%S)
    else
        start_time=$(date -u -d '24 hours ago' +%Y-%m-%dT%H:%M:%S)
    fi

    local oom_data
    oom_data=$(aws cloudwatch get-metric-statistics \
        --profile "${AWS_PROFILE}" \
        --region "${REGION}" \
        --namespace EC2 \
        --metric-name oom_kills \
        --start-time "${start_time}" \
        --end-time "${end_time}" \
        --period 3600 \
        --statistics Sum \
        --query 'Datapoints | map(.Sum) | add // 0' \
        --output text 2>/dev/null)

    if [ -n "$oom_data" ] && [ "$oom_data" != "None" ] && [ "$oom_data" != "0" ]; then
        echo -e "${RED}🚨 OOM Kills detected in last 24 hours: ${oom_data}${NC}"
        echo "   This indicates the system ran out of memory and killed processes."
        echo "   Check syslog for details: /ec2/syslog-${STACK_NAME}"
    else
        echo -e "${GREEN}✓ No OOM kills detected in last 24 hours${NC}"
    fi

    echo ""
}

# Main execution
main() {
    local overall_health=0

    check_instance_status || overall_health=1
    check_alarms || overall_health=1
    check_memory_metrics
    check_oom_kills

    echo "=========================================="
    if [ $overall_health -eq 0 ]; then
        echo -e "${GREEN}✓ Overall Health: OK${NC}"
    else
        echo -e "${RED}🚨 Overall Health: ISSUES DETECTED${NC}"
        echo ""
        echo "Recommended actions:"
        echo "1. Check CloudWatch logs: /ec2/syslog-${STACK_NAME}"
        echo "2. Review instance system logs in AWS Console"
        echo "3. Check SNS topic for alarm notifications"
        echo "4. Consider restarting the instance if issues persist"
    fi
    echo "=========================================="

    exit $overall_health
}

# Run main function
main

