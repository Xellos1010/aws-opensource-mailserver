#!/usr/bin/env bash
set -Eeuo pipefail
IFS=$'\n\t'

# Generate comprehensive monitoring report for HEPE Foundation instance
# Shows stop-start operation history and alarm monitoring state

DOMAIN_NAME="k3frame.com"
ALARMS_STACK_NAME="hepefoundation-org-emergency-alarms"
STOP_START_STACK_NAME="hepefoundation-org-stop-start-helper"
LEGACY_STACK_NAME="hepefoundation-org-mailserver"
REGION="us-east-1"
PROFILE="hepe-admin-mfa"
REPORT_FILE="${1:-monitoring-report-$(date +%Y%m%d-%H%M%S).md}"

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

echo "=========================================="
echo "HEPE Foundation Monitoring Report"
echo "=========================================="
echo "Domain: ${DOMAIN_NAME}"
echo "Date: $(date)"
echo "Report File: ${REPORT_FILE}"
echo "=========================================="
echo ""

# Initialize report file
{
    echo "# HEPE Foundation Instance Monitoring Report"
    echo ""
    echo "**Generated:** $(date)"
    echo ""
    echo "**Domain:** ${DOMAIN_NAME}"
    echo ""
    echo "**Region:** ${REGION}"
    echo ""
    echo "---"
    echo ""
} > "${REPORT_FILE}"

# Get instance ID
echo "📋 Getting Instance Information"
echo "----------------------------------------"
INSTANCE_ID=$(aws cloudformation describe-stacks \
    --profile "${PROFILE}" \
    --region "${REGION}" \
    --stack-name "${LEGACY_STACK_NAME}" \
    --query 'Stacks[0].Outputs[?OutputKey==`InstanceId`].OutputValue' \
    --output text 2>/dev/null)

if [ -z "$INSTANCE_ID" ] || [ "$INSTANCE_ID" = "None" ]; then
    INSTANCE_ID=$(aws cloudformation describe-stacks \
        --profile "${PROFILE}" \
        --region "${REGION}" \
        --stack-name "${LEGACY_STACK_NAME}" \
        --query 'Stacks[0].Outputs[?OutputKey==`RestorePrefix`].OutputValue' \
        --output text 2>/dev/null)
fi

if [ -z "$INSTANCE_ID" ] || [ "$INSTANCE_ID" = "None" ]; then
    echo -e "${RED}Error: Could not find instance ID${NC}"
    exit 1
fi

echo "✓ Instance ID: ${INSTANCE_ID}"
echo ""

# Get instance state
INSTANCE_STATE=$(aws ec2 describe-instances \
    --profile "${PROFILE}" \
    --region "${REGION}" \
    --instance-ids "${INSTANCE_ID}" \
    --query 'Reservations[0].Instances[0].State.Name' \
    --output text 2>/dev/null || echo "unknown")

INSTANCE_TYPE=$(aws ec2 describe-instances \
    --profile "${PROFILE}" \
    --region "${REGION}" \
    --instance-ids "${INSTANCE_ID}" \
    --query 'Reservations[0].Instances[0].InstanceType' \
    --output text 2>/dev/null || echo "unknown")

# Get Lambda function name from stop-start stack
echo "📋 Getting Stop-Start Lambda Information"
echo "----------------------------------------"
LAMBDA_FUNCTION_NAME=$(aws cloudformation describe-stacks \
    --profile "${PROFILE}" \
    --region "${REGION}" \
    --stack-name "${STOP_START_STACK_NAME}" \
    --query 'Stacks[0].Outputs[?OutputKey==`LambdaFunctionName`].OutputValue' \
    --output text 2>/dev/null)

if [ -z "$LAMBDA_FUNCTION_NAME" ] || [ "$LAMBDA_FUNCTION_NAME" = "None" ]; then
    # Try to get from stack resources
    LAMBDA_FUNCTION_NAME=$(aws cloudformation list-stack-resources \
        --profile "${PROFILE}" \
        --region "${REGION}" \
        --stack-name "${STOP_START_STACK_NAME}" \
        --query 'StackResourceSummaries[?ResourceType==`AWS::Lambda::Function`].PhysicalResourceId' \
        --output text 2>/dev/null | head -1)
fi

if [ -z "$LAMBDA_FUNCTION_NAME" ] || [ "$LAMBDA_FUNCTION_NAME" = "None" ]; then
    # Fallback to expected name
    LAMBDA_FUNCTION_NAME="StopStartLambda-${STOP_START_STACK_NAME}"
fi

echo "✓ Lambda Function: ${LAMBDA_FUNCTION_NAME}"
echo ""

# Get schedule from EventBridge rule
echo "📋 Getting Scheduled Stop-Start Information"
echo "----------------------------------------"
EVENT_RULE_NAME=$(aws cloudformation list-stack-resources \
    --profile "${PROFILE}" \
    --region "${REGION}" \
    --stack-name "${STOP_START_STACK_NAME}" \
    --query 'StackResourceSummaries[?ResourceType==`AWS::Events::Rule`].PhysicalResourceId' \
    --output text 2>/dev/null | head -1)

SCHEDULE_EXPRESSION=""
RULE_STATE="UNKNOWN"
if [ -n "$EVENT_RULE_NAME" ] && [ "$EVENT_RULE_NAME" != "None" ]; then
    RULE_INFO=$(aws events describe-rule \
        --profile "${PROFILE}" \
        --region "${REGION}" \
        --name "${EVENT_RULE_NAME}" \
        --query '{ScheduleExpression:ScheduleExpression,State:State}' \
        --output json 2>/dev/null || echo "{}")
    
    SCHEDULE_EXPRESSION=$(echo "$RULE_INFO" | jq -r '.ScheduleExpression // ""')
    RULE_STATE=$(echo "$RULE_INFO" | jq -r '.State // "UNKNOWN"')
fi

if [ -z "$SCHEDULE_EXPRESSION" ]; then
    SCHEDULE_EXPRESSION="cron(0 8 * * ? *)"  # Default: 3am EST
fi

echo "✓ Schedule: ${SCHEDULE_EXPRESSION}"
echo "✓ Rule State: ${RULE_STATE}"
if [ "$RULE_STATE" != "ENABLED" ]; then
    echo -e "${YELLOW}⚠ WARNING: EventBridge rule is ${RULE_STATE} - scheduled executions may not be running!${NC}"
fi
echo ""

# Get Lambda execution history from CloudWatch Logs
echo "📋 Retrieving Stop-Start Operation History"
echo "----------------------------------------"
LOG_GROUP_NAME="/aws/lambda/${LAMBDA_FUNCTION_NAME}"

# Check if log group exists
LOG_GROUP_EXISTS=$(aws logs describe-log-groups \
    --profile "${PROFILE}" \
    --region "${REGION}" \
    --log-group-name-prefix "${LOG_GROUP_NAME}" \
    --query 'logGroups[0].logGroupName' \
    --output text 2>/dev/null || echo "")

if [ -n "$LOG_GROUP_EXISTS" ] && [ "$LOG_GROUP_EXISTS" != "None" ]; then
    echo "✓ Log Group: ${LOG_GROUP_NAME}"
    
    # Get last 50 executions (last 90 days for better coverage)
    if [[ "$OSTYPE" == "darwin"* ]]; then
        # macOS date command
        START_TIME=$(date -u -v-90d +%s 2>/dev/null || echo $(($(date +%s) - 7776000)))
        END_TIME=$(date -u +%s)
    else
        # Linux date command
        START_TIME=$(date -u -d '90 days ago' +%s)
        END_TIME=$(date -u +%s)
    fi
    
    # Get log streams (executions) - increased to 50 for better history
    LOG_STREAMS=$(aws logs describe-log-streams \
        --profile "${PROFILE}" \
        --region "${REGION}" \
        --log-group-name "${LOG_GROUP_NAME}" \
        --order-by LastEventTime \
        --descending \
        --max-items 50 \
        --query 'logStreams[*].{StreamName:logStreamName,LastEvent:lastEventTimestamp,FirstEvent:firstEventTimestamp}' \
        --output json 2>/dev/null || echo "[]")
    
    EXECUTION_COUNT=$(echo "$LOG_STREAMS" | jq 'length')
    echo "✓ Found ${EXECUTION_COUNT} recent execution(s)"
    
    # Get detailed logs for each execution
    EXECUTIONS=()
    for STREAM in $(echo "$LOG_STREAMS" | jq -c '.[]'); do
        STREAM_NAME=$(echo "$STREAM" | jq -r '.StreamName')
        LAST_EVENT=$(echo "$STREAM" | jq -r '.LastEvent')
        FIRST_EVENT=$(echo "$STREAM" | jq -r '.FirstEvent // .LastEvent')
        
        # Get log events from this stream
        # Try to get all events, not just recent ones
        LOG_EVENTS=$(aws logs get-log-events \
            --profile "${PROFILE}" \
            --region "${REGION}" \
            --log-group-name "${LOG_GROUP_NAME}" \
            --log-stream-name "${STREAM_NAME}" \
            --start-from-head \
            --query 'events[*].{Message:message,Timestamp:timestamp}' \
            --output json 2>/dev/null || echo "[]")
        
        # If no events, try without start-from-head (might be a pagination issue)
        if [ "$LOG_EVENTS" = "[]" ] || [ -z "$LOG_EVENTS" ]; then
            LOG_EVENTS=$(aws logs get-log-events \
                --profile "${PROFILE}" \
                --region "${REGION}" \
                --log-group-name "${LOG_GROUP_NAME}" \
                --log-stream-name "${STREAM_NAME}" \
                --query 'events[*].{Message:message,Timestamp:timestamp}' \
                --output json 2>/dev/null || echo "[]")
        fi
        
        # Extract key information - convert milliseconds to seconds for date command
        # LAST_EVENT is in milliseconds since epoch
        if [[ "$LAST_EVENT" =~ ^[0-9]+$ ]]; then
            LAST_EVENT_SEC=$((LAST_EVENT / 1000))
            if [[ "$OSTYPE" == "darwin"* ]]; then
                # macOS date command
                START_TIME_STR=$(date -u -r "$LAST_EVENT_SEC" +"%Y-%m-%d %H:%M:%S UTC" 2>/dev/null || echo "N/A")
            else
                # Linux date command
                START_TIME_STR=$(date -u -d "@${LAST_EVENT_SEC}" +"%Y-%m-%d %H:%M:%S UTC" 2>/dev/null || echo "N/A")
            fi
        else
            # If it's already a string, use it as-is
            START_TIME_STR="$LAST_EVENT"
        fi
        
        # Get first event time for instance state checking
        if [[ "$FIRST_EVENT" =~ ^[0-9]+$ ]]; then
            FIRST_EVENT_SEC=$((FIRST_EVENT / 1000))
        else
            FIRST_EVENT_SEC=$((LAST_EVENT / 1000))
        fi
        
        # Enhanced status detection - look for Lambda-specific patterns
        # Lambda logs: "✅ Instance {id} stop-and-start completed successfully"
        # Also check for Lambda standard patterns: START, END, REPORT
        SUCCESS=$(echo "$LOG_EVENTS" | jq -r '[.[] | select(.Message | test("stop-and-start completed successfully|completed successfully|SUCCESS|Emergency restart completed"; "i"))] | length')
        ERROR=$(echo "$LOG_EVENTS" | jq -r '[.[] | select(.Message | test("ERROR|Error|FAILED|Failed|Exception|timeout|Task timed out"; "i"))] | length')
        
        # Check for Lambda standard log patterns
        HAS_START_LOG=$(echo "$LOG_EVENTS" | jq -r '[.[] | select(.Message | test("^START RequestId"; "i"))] | length')
        HAS_END_LOG=$(echo "$LOG_EVENTS" | jq -r '[.[] | select(.Message | test("^END RequestId"; "i"))] | length')
        HAS_REPORT_LOG=$(echo "$LOG_EVENTS" | jq -r '[.[] | select(.Message | test("^REPORT RequestId"; "i"))] | length')
        
        # Check for specific operation patterns
        HAS_START_OP=$(echo "$LOG_EVENTS" | jq -r '[.[] | select(.Message | test("Starting instance|already starting"; "i"))] | length')
        HAS_STOP_OP=$(echo "$LOG_EVENTS" | jq -r '[.[] | select(.Message | test("Stopping instance|already stopping"; "i"))] | length')
        HAS_RUNNING=$(echo "$LOG_EVENTS" | jq -r '[.[] | select(.Message | test("already running|waiting for running|is now in running state"; "i"))] | length')
        HAS_STOPPED=$(echo "$LOG_EVENTS" | jq -r '[.[] | select(.Message | test("already stopped|waiting for stopped|is now in stopped state"; "i"))] | length')
        
        STATUS="UNKNOWN"
        REASON=""
        
        if [ "$SUCCESS" -gt 0 ]; then
            STATUS="SUCCESS"
        elif [ "$ERROR" -gt 0 ]; then
            STATUS="FAILED"
            # Extract error message if available
            ERROR_MSG=$(echo "$LOG_EVENTS" | jq -r '[.[] | select(.Message | test("ERROR|Error|Exception|timeout"; "i")) | .Message] | first // "Unknown error"')
            REASON="Error in logs: ${ERROR_MSG:0:100}"
        elif [ "$HAS_END_LOG" -gt 0 ] && [ "$HAS_REPORT_LOG" -gt 0 ]; then
            # Lambda completed (has END and REPORT) but no explicit success message
            # Check if it reached running state (indicates success)
            if [ "$HAS_RUNNING" -gt 0 ]; then
                STATUS="SUCCESS"
                REASON="Lambda completed and instance reached running state"
            elif [ "$HAS_STOPPED" -gt 0 ] && [ "$HAS_START_OP" -gt 0 ]; then
                # Had stop and start operations, likely succeeded
                STATUS="SUCCESS"
                REASON="Lambda completed with stop/start operations"
            else
                STATUS="IN_PROGRESS"
                REASON="Lambda completed but completion status unclear"
            fi
        elif [ "$HAS_START_LOG" -gt 0 ] && [ "$HAS_STOP_OP" -gt 0 ] || [ "$HAS_START_OP" -gt 0 ]; then
            # Has activity but no clear completion
            STATUS="IN_PROGRESS"
            REASON="Operation started but completion status unclear"
        else
            # No clear indicators
            REASON="No completion indicators found in logs"
            
            # If we have very few log entries, it might be a timeout or early failure
            LOG_COUNT=$(echo "$LOG_EVENTS" | jq 'length')
            if [ "$LOG_COUNT" -lt 3 ]; then
                REASON="Very few log entries (${LOG_COUNT}) - possible timeout or early failure"
            fi
        fi
        
        # Check instance state during operation time
        # Note: This checks current state, not historical state (which would require CloudWatch metrics)
        INSTANCE_STATE_DURING="UNKNOWN"
        if [ "$FIRST_EVENT_SEC" -gt 0 ]; then
            # For UNKNOWN status, try to get more context from logs
            # Check if logs mention instance state
            LOG_STATE_MENTION=$(echo "$LOG_EVENTS" | jq -r '[.[] | select(.Message | test("instance.*stopped|instance.*running|instance.*pending"; "i")) | .Message] | first // ""')
            
            if [ -n "$LOG_STATE_MENTION" ]; then
                if echo "$LOG_STATE_MENTION" | grep -qi "stopped"; then
                    INSTANCE_STATE_DURING="stopped"
                    if [ "$STATUS" = "UNKNOWN" ]; then
                        REASON="${REASON} (Instance was stopped during operation)"
                    fi
                elif echo "$LOG_STATE_MENTION" | grep -qi "running"; then
                    INSTANCE_STATE_DURING="running"
                elif echo "$LOG_STATE_MENTION" | grep -qi "pending"; then
                    INSTANCE_STATE_DURING="pending"
                fi
            fi
            
            # If still unknown and no log indicators, check if logs are very short (might indicate timeout)
            LOG_COUNT=$(echo "$LOG_EVENTS" | jq 'length')
            if [ "$STATUS" = "UNKNOWN" ] && [ "$LOG_COUNT" -lt 5 ]; then
                REASON="${REASON} (Very few log entries - possible timeout or incomplete execution)"
            fi
        fi
        
        EXECUTIONS+=("${START_TIME_STR}|${STATUS}|${STREAM_NAME}|${REASON}|${INSTANCE_STATE_DURING}")
    done
else
    echo -e "${YELLOW}⚠ Log group not found - no execution history available${NC}"
    EXECUTIONS=()
fi
echo ""

# Get alarm states
echo "📋 Retrieving Alarm Monitoring State"
echo "----------------------------------------"

# Initialize alarm history array
ALARM_HISTORY=()

# Get alarms from the alarms stack
ALARM_NAMES=$(aws cloudformation list-stack-resources \
    --profile "${PROFILE}" \
    --region "${REGION}" \
    --stack-name "${ALARMS_STACK_NAME}" \
    --query 'StackResourceSummaries[?ResourceType==`AWS::CloudWatch::Alarm`].PhysicalResourceId' \
    --output json 2>/dev/null || echo "[]")

if [ -z "$ALARM_NAMES" ] || [ "$ALARM_NAMES" = "[]" ]; then
    echo -e "${YELLOW}⚠ No alarms found in stack${NC}"
    ALARM_DETAILS="[]"
else
    # Get alarm details
    ALARM_DETAILS=$(aws cloudwatch describe-alarms \
        --profile "${PROFILE}" \
        --region "${REGION}" \
        --alarm-names $(echo "$ALARM_NAMES" | jq -r '.[]') \
        --query 'MetricAlarms[*].{
            AlarmName:AlarmName,
            StateValue:StateValue,
            StateReason:StateReason,
            StateUpdatedTimestamp:StateUpdatedTimestamp,
            MetricName:MetricName,
            Namespace:Namespace,
            Threshold:Threshold,
            ComparisonOperator:ComparisonOperator
        }' \
        --output json 2>/dev/null || echo "[]")
    
    ALARM_COUNT=$(echo "$ALARM_DETAILS" | jq 'length')
    echo "✓ Found ${ALARM_COUNT} alarm(s)"
    
    # Get alarm history for last 7 days
    echo "📋 Retrieving Alarm Trigger History (Last 7 Days)"
    echo "----------------------------------------"
    
    if [[ "$OSTYPE" == "darwin"* ]]; then
        # macOS date command
        ALARM_START_TIME=$(date -u -v-7d +%Y-%m-%dT%H:%M:%S 2>/dev/null || date -u -v-7d +%Y-%m-%dT%H:%M:%S)
        ALARM_END_TIME=$(date -u +%Y-%m-%dT%H:%M:%S)
    else
        # Linux date command
        ALARM_START_TIME=$(date -u -d '7 days ago' +%Y-%m-%dT%H:%M:%S)
        ALARM_END_TIME=$(date -u +%Y-%m-%dT%H:%M:%S)
    fi
    
    if [ "$ALARM_NAMES" != "[]" ] && [ -n "$ALARM_NAMES" ]; then
        for ALARM_NAME in $(echo "$ALARM_NAMES" | jq -r '.[]'); do
            # Get alarm history for this alarm
            HISTORY=$(aws cloudwatch describe-alarm-history \
                --profile "${PROFILE}" \
                --region "${REGION}" \
                --alarm-name "${ALARM_NAME}" \
                --start-date "${ALARM_START_TIME}" \
                --end-date "${ALARM_END_TIME}" \
                --history-item-type StateUpdate \
                --query 'AlarmHistoryItems[*].{
                    Timestamp:Timestamp,
                    HistoryData:HistoryData
                }' \
                --output json 2>/dev/null || echo "[]")
            
            # Parse history items
            for ITEM in $(echo "$HISTORY" | jq -c '.[]'); do
                ITEM_TIME=$(echo "$ITEM" | jq -r '.Timestamp')
                ITEM_DATA_RAW=$(echo "$ITEM" | jq -r '.HistoryData')
                
                # HistoryData is a JSON string, parse it
                if [ -n "$ITEM_DATA_RAW" ] && [ "$ITEM_DATA_RAW" != "null" ]; then
                    # Try to parse as JSON
                    ITEM_DATA=$(echo "$ITEM_DATA_RAW" | jq '.' 2>/dev/null || echo "{}")
                else
                    ITEM_DATA="{}"
                fi
                
                # Extract state from history data
                NEW_STATE=$(echo "$ITEM_DATA" | jq -r '.newState.stateValue // .newState // "UNKNOWN"' 2>/dev/null || echo "UNKNOWN")
                OLD_STATE=$(echo "$ITEM_DATA" | jq -r '.oldState.stateValue // .oldState // "UNKNOWN"' 2>/dev/null || echo "UNKNOWN")
                REASON=$(echo "$ITEM_DATA" | jq -r '.newState.stateReason // .newStateReason // "N/A"' 2>/dev/null || echo "N/A")
                
                # If NEW_STATE still contains JSON, try to extract just the value
                if echo "$NEW_STATE" | jq -e . >/dev/null 2>&1; then
                    NEW_STATE=$(echo "$NEW_STATE" | jq -r '.stateValue // .' 2>/dev/null || echo "UNKNOWN")
                fi
                if echo "$OLD_STATE" | jq -e . >/dev/null 2>&1; then
                    OLD_STATE=$(echo "$OLD_STATE" | jq -r '.stateValue // .' 2>/dev/null || echo "UNKNOWN")
                fi
                
                # Only include transitions to ALARM state
                if [ "$NEW_STATE" = "ALARM" ]; then
                    # Format timestamp - handle numeric (milliseconds), ISO format, or already formatted
                    if [[ "$ITEM_TIME" =~ ^[0-9]+$ ]]; then
                        # Numeric timestamp in milliseconds
                        ITEM_TIME_SEC=$((ITEM_TIME / 1000))
                        if [[ "$OSTYPE" == "darwin"* ]]; then
                            ITEM_TIME_STR=$(date -u -r "$ITEM_TIME_SEC" +"%Y-%m-%d %H:%M:%S UTC" 2>/dev/null || echo "$ITEM_TIME")
                        else
                            ITEM_TIME_STR=$(date -u -d "@${ITEM_TIME_SEC}" +"%Y-%m-%d %H:%M:%S UTC" 2>/dev/null || echo "$ITEM_TIME")
                        fi
                    elif [[ "$ITEM_TIME" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}T ]]; then
                        # ISO format timestamp (e.g., 2025-11-14T22:20:38.417000+00:00)
                        # Remove microseconds and timezone offset, keep just date and time
                        ITEM_TIME_CLEAN=$(echo "$ITEM_TIME" | sed 's/\.[0-9]*//' | sed 's/[+-][0-9][0-9]:[0-9][0-9]$//')
                        if [[ "$OSTYPE" == "darwin"* ]]; then
                            ITEM_TIME_STR=$(date -u -j -f "%Y-%m-%dT%H:%M:%S" "$ITEM_TIME_CLEAN" +"%Y-%m-%d %H:%M:%S UTC" 2>/dev/null || echo "$ITEM_TIME")
                        else
                            ITEM_TIME_STR=$(date -u -d "$ITEM_TIME_CLEAN" +"%Y-%m-%d %H:%M:%S UTC" 2>/dev/null || echo "$ITEM_TIME")
                        fi
                    else
                        # Already formatted or unknown format
                        ITEM_TIME_STR="$ITEM_TIME"
                    fi
                    
                    ALARM_HISTORY+=("${ITEM_TIME_STR}|${ALARM_NAME}|${OLD_STATE}|${NEW_STATE}|${REASON}")
                fi
            done
        done
        
        echo "✓ Found ${#ALARM_HISTORY[@]} alarm trigger(s) in last 7 days"
    else
        echo "⚠ No alarms configured - cannot retrieve history"
    fi
fi
echo ""

# Generate report
{
    echo ""
    echo "## Instance Information"
    echo ""
    echo "| Property | Value |"
    echo "|----------|-------|"
    echo "| Instance ID | \`${INSTANCE_ID}\` |"
    echo "| State | **${INSTANCE_STATE}** |"
    echo "| Type | ${INSTANCE_TYPE} |"
    echo ""
    echo "---"
    echo ""
    echo "## Scheduled Stop-Start Operations"
    echo ""
    echo "| Property | Value |"
    echo "|----------|-------|"
    echo "| Lambda Function | \`${LAMBDA_FUNCTION_NAME}\` |"
    echo "| Schedule Expression | \`${SCHEDULE_EXPRESSION}\` |"
    echo "| Schedule Description | Daily at 3:00 AM EST (8:00 AM UTC) |"
    echo "| EventBridge Rule State | **${RULE_STATE}** |"
    if [ "$RULE_STATE" != "ENABLED" ]; then
        echo ""
        echo "> ⚠️ **WARNING:** EventBridge rule is **${RULE_STATE}** - scheduled executions may not be running!"
    fi
    echo ""
    
    if [ ${#EXECUTIONS[@]} -eq 0 ]; then
        echo "> ⚠️ No execution history found."
        echo ">"
        echo "> Log group may not exist or no executions have occurred yet"
    else
        echo "### Recent Executions (Last ${#EXECUTIONS[@]})"
        echo ""
        echo "| Timestamp | Status | Instance State | Details |"
        echo "|-----------|--------|----------------|---------|"
        for EXEC in "${EXECUTIONS[@]}"; do
            IFS='|' read -r TIME STATUS STREAM REASON INST_STATE <<< "$EXEC"
            if [ -z "$REASON" ]; then
                REASON="-"
            fi
            if [ -z "$INST_STATE" ] || [ "$INST_STATE" = "UNKNOWN" ]; then
                INST_STATE="-"
            fi
            
            # Format status with emoji for markdown
            STATUS_DISPLAY="$STATUS"
            case "$STATUS" in
                SUCCESS) STATUS_DISPLAY="✅ SUCCESS" ;;
                FAILED) STATUS_DISPLAY="❌ FAILED" ;;
                IN_PROGRESS) STATUS_DISPLAY="⟳ IN_PROGRESS" ;;
                UNKNOWN) STATUS_DISPLAY="❓ UNKNOWN" ;;
            esac
            
            # Escape pipe characters in reason for markdown table
            REASON_ESCAPED=$(echo "$REASON" | sed 's/|/\\|/g')
            printf "| %s | %s | %s | %s |\n" "$TIME" "$STATUS_DISPLAY" "$INST_STATE" "${REASON_ESCAPED:0:50}"
        done
        echo ""
        echo "#### Status Legend"
        echo ""
        echo "- **✅ SUCCESS** - Operation completed successfully"
        echo "- **❌ FAILED** - Operation encountered an error"
        echo "- **⟳ IN_PROGRESS** - Operation started but completion unclear"
        echo "- **❓ UNKNOWN** - Could not determine operation status"
        echo ""
        echo "#### Notes"
        echo ""
        echo "UNKNOWN status may occur if:"
        echo "- Logs are incomplete or truncated"
        echo "- Instance was stopped during operation"
        echo "- Lambda execution timed out"
        echo "- Log stream contains no completion indicators"
    fi
    echo ""
    
    echo "---"
    echo ""
    echo "## Alarm Monitoring State"
    echo ""
    
    if [ "$ALARM_DETAILS" = "[]" ] || [ -z "$ALARM_DETAILS" ]; then
        echo "> No alarms configured."
    else
        echo "### Alarm Details"
        echo ""
        for ALARM in $(echo "$ALARM_DETAILS" | jq -c '.[]'); do
            ALARM_NAME=$(echo "$ALARM" | jq -r '.AlarmName')
            STATE=$(echo "$ALARM" | jq -r '.StateValue')
            REASON=$(echo "$ALARM" | jq -r '.StateReason // "N/A"')
            UPDATED=$(echo "$ALARM" | jq -r '.StateUpdatedTimestamp // "N/A"')
            METRIC=$(echo "$ALARM" | jq -r '.MetricName')
            NAMESPACE=$(echo "$ALARM" | jq -r '.Namespace')
            THRESHOLD=$(echo "$ALARM" | jq -r '.Threshold')
            OPERATOR=$(echo "$ALARM" | jq -r '.ComparisonOperator')
            
            # Format timestamp - handle both numeric (milliseconds) and ISO format
            if [ "$UPDATED" != "N/A" ] && [ "$UPDATED" != "null" ]; then
                if [[ "$UPDATED" =~ ^[0-9]+$ ]]; then
                    # Numeric timestamp in milliseconds
                    UPDATED_SEC=$((UPDATED / 1000))
                    if [[ "$OSTYPE" == "darwin"* ]]; then
                        # macOS date command
                        UPDATED_STR=$(date -u -r "$UPDATED_SEC" +"%Y-%m-%d %H:%M:%S UTC" 2>/dev/null || echo "$UPDATED")
                    else
                        # Linux date command
                        UPDATED_STR=$(date -u -d "@${UPDATED_SEC}" +"%Y-%m-%d %H:%M:%S UTC" 2>/dev/null || echo "$UPDATED")
                    fi
                else
                    # ISO format timestamp - convert to readable format
                    if [[ "$OSTYPE" == "darwin"* ]]; then
                        # macOS date command
                        UPDATED_STR=$(date -u -j -f "%Y-%m-%dT%H:%M:%S" "${UPDATED%%.*}" +"%Y-%m-%d %H:%M:%S UTC" 2>/dev/null || echo "$UPDATED")
                    else
                        # Linux date command
                        UPDATED_STR=$(date -u -d "$UPDATED" +"%Y-%m-%d %H:%M:%S UTC" 2>/dev/null || echo "$UPDATED")
                    fi
                fi
            else
                UPDATED_STR="N/A"
            fi
            
            # Format state with emoji
            STATE_DISPLAY="$STATE"
            case "$STATE" in
                OK) STATE_DISPLAY="✅ OK" ;;
                ALARM) STATE_DISPLAY="🚨 ALARM" ;;
                INSUFFICIENT_DATA) STATE_DISPLAY="⚠️ INSUFFICIENT_DATA" ;;
            esac
            
            echo "#### ${ALARM_NAME}"
            echo ""
            echo "| Property | Value |"
            echo "|----------|-------|"
            echo "| State | **${STATE_DISPLAY}** |"
            echo "| Metric | \`${NAMESPACE}/${METRIC}\` |"
            echo "| Threshold | \`${OPERATOR} ${THRESHOLD}\` |"
            echo "| Last Updated | ${UPDATED_STR} |"
            if [ "$REASON" != "N/A" ] && [ "$REASON" != "null" ]; then
                echo "| Reason | ${REASON} |"
            fi
            echo ""
        done
        
        echo "### Alarm State Summary"
    echo ""
    
    if [ "$ALARM_DETAILS" != "[]" ] && [ -n "$ALARM_DETAILS" ]; then
        OK_COUNT=$(echo "$ALARM_DETAILS" | jq '[.[] | select(.StateValue == "OK")] | length')
        ALARM_COUNT=$(echo "$ALARM_DETAILS" | jq '[.[] | select(.StateValue == "ALARM")] | length')
        INSUFFICIENT_COUNT=$(echo "$ALARM_DETAILS" | jq '[.[] | select(.StateValue == "INSUFFICIENT_DATA")] | length')
        
            echo "| State | Count |"
            echo "|-------|-------|"
            echo "| ✅ OK | ${OK_COUNT} |"
            echo "| 🚨 ALARM | ${ALARM_COUNT} |"
            echo "| ⚠️ INSUFFICIENT_DATA | ${INSUFFICIENT_COUNT} |"
        echo ""
        
        if [ "$ALARM_COUNT" -gt 0 ]; then
                echo "> ⚠️ **WARNING:** ${ALARM_COUNT} alarm(s) in ALARM state!"
                echo ""
                echo "**Alarms in ALARM state:**"
            echo ""
            for ALARM in $(echo "$ALARM_DETAILS" | jq -c '.[] | select(.StateValue == "ALARM")'); do
                ALARM_NAME=$(echo "$ALARM" | jq -r '.AlarmName')
                REASON=$(echo "$ALARM" | jq -r '.StateReason // "N/A"')
                    echo "- **${ALARM_NAME}**: ${REASON}"
                done
                echo ""
            fi
        fi
    fi
    echo ""
    
    echo "---"
    echo ""
    echo "## Alarm Trigger History (Last 7 Days)"
    echo ""
    
    if [ ${#ALARM_HISTORY[@]} -eq 0 ]; then
        echo "> ✅ No alarm triggers in the last 7 days."
        echo ">"
        echo "> All alarms remained in OK state"
    else
        echo "### Alarm State Changes to ALARM"
        echo ""
        echo "| Timestamp | Alarm Name | From | To | Reason |"
        echo "|-----------|------------|------|-----|--------|"
        for HIST in "${ALARM_HISTORY[@]}"; do
            IFS='|' read -r TIME ALARM_NAME OLD_STATE NEW_STATE REASON <<< "$HIST"
            if [ "$REASON" = "N/A" ] || [ -z "$REASON" ]; then
                REASON="-"
            fi
            # Escape pipe characters in reason for markdown table
            REASON_ESCAPED=$(echo "$REASON" | sed 's/|/\\|/g')
            printf "| %s | %s | %s | %s | %s |\n" "$TIME" "${ALARM_NAME:0:38}" "$OLD_STATE" "$NEW_STATE" "${REASON_ESCAPED:0:60}"
        done
        echo ""
        echo "### Summary"
        echo ""
        echo "- **Total alarm triggers:** ${#ALARM_HISTORY[@]}"
        echo ""
        
        # Count triggers per alarm (bash 3.2 compatible - no associative arrays)
        # Extract unique alarm names and count them
        UNIQUE_ALARMS=$(for HIST in "${ALARM_HISTORY[@]}"; do
            IFS='|' read -r TIME ALARM_NAME OLD_STATE NEW_STATE REASON <<< "$HIST"
            echo "$ALARM_NAME"
        done | sort -u)
        
        if [ -n "$UNIQUE_ALARMS" ]; then
            echo "**Triggers by alarm:**"
            echo ""
            for ALARM_NAME in $UNIQUE_ALARMS; do
                COUNT=0
                for HIST in "${ALARM_HISTORY[@]}"; do
                    IFS='|' read -r TIME HIST_ALARM_NAME OLD_STATE NEW_STATE REASON <<< "$HIST"
                    if [ "$HIST_ALARM_NAME" = "$ALARM_NAME" ]; then
                        COUNT=$((COUNT + 1))
                    fi
                done
                echo "- \`${ALARM_NAME}\`: ${COUNT}"
            done
        fi
    fi
    echo ""
    echo "---"
    echo ""
    echo "*Report generated by HEPE Foundation monitoring script*"
} >> "${REPORT_FILE}"

# Display summary
echo "=========================================="
echo "Report Summary"
echo "=========================================="
echo ""

# Display instance info
echo -e "${CYAN}Instance:${NC} ${INSTANCE_ID} (${INSTANCE_STATE})"
echo ""

# Display execution history summary
if [ ${#EXECUTIONS[@]} -eq 0 ]; then
    echo -e "${YELLOW}Stop-Start Operations: No history found${NC}"
else
    echo -e "${CYAN}Stop-Start Operations (Last ${#EXECUTIONS[@]}):${NC}"
    for EXEC in "${EXECUTIONS[@]}"; do
        IFS='|' read -r TIME STATUS STREAM REASON INST_STATE <<< "$EXEC"
        STATUS_ICON="?"
        STATUS_COLOR="${YELLOW}"
        if [ "$STATUS" = "SUCCESS" ]; then
            STATUS_ICON="✓"
            STATUS_COLOR="${GREEN}"
        elif [ "$STATUS" = "FAILED" ]; then
            STATUS_ICON="✗"
            STATUS_COLOR="${RED}"
        elif [ "$STATUS" = "IN_PROGRESS" ]; then
            STATUS_ICON="⟳"
            STATUS_COLOR="${BLUE}"
        fi
        
        OUTPUT="${STATUS_COLOR}${STATUS_ICON}${NC} ${TIME} - ${STATUS}"
        if [ -n "$INST_STATE" ] && [ "$INST_STATE" != "UNKNOWN" ] && [ "$INST_STATE" != "-" ]; then
            OUTPUT="${OUTPUT} (Instance: ${INST_STATE})"
        fi
        if [ -n "$REASON" ] && [ "$REASON" != "-" ] && [ "$STATUS" = "UNKNOWN" ]; then
            OUTPUT="${OUTPUT} - ${REASON:0:50}"
        fi
        echo -e "  ${OUTPUT}"
    done
fi
echo ""

# Display alarm history summary
if [ ${#ALARM_HISTORY[@]} -eq 0 ]; then
    echo -e "${GREEN}Alarm Triggers (Last 7 Days): None${NC}"
else
    echo -e "${CYAN}Alarm Triggers (Last 7 Days): ${#ALARM_HISTORY[@]}${NC}"
    for HIST in "${ALARM_HISTORY[@]}"; do
        IFS='|' read -r TIME ALARM_NAME OLD_STATE NEW_STATE REASON <<< "$HIST"
        echo -e "  ${RED}⚠${NC} ${TIME} - ${ALARM_NAME} (${OLD_STATE} → ${NEW_STATE})"
        if [ -n "$REASON" ] && [ "$REASON" != "N/A" ] && [ "$REASON" != "-" ]; then
            echo -e "      Reason: ${REASON:0:80}"
        fi
    done
fi
echo ""

# Display alarm summary
if [ "$ALARM_DETAILS" != "[]" ] && [ -n "$ALARM_DETAILS" ]; then
    OK_COUNT=$(echo "$ALARM_DETAILS" | jq '[.[] | select(.StateValue == "OK")] | length')
    ALARM_COUNT=$(echo "$ALARM_DETAILS" | jq '[.[] | select(.StateValue == "ALARM")] | length')
    INSUFFICIENT_COUNT=$(echo "$ALARM_DETAILS" | jq '[.[] | select(.StateValue == "INSUFFICIENT_DATA")] | length')
    
    echo -e "${CYAN}Alarm States:${NC}"
    echo -e "  ${GREEN}OK: ${OK_COUNT}${NC}"
    if [ "$ALARM_COUNT" -gt 0 ]; then
        echo -e "  ${RED}ALARM: ${ALARM_COUNT}${NC}"
    else
        echo -e "  ALARM: ${ALARM_COUNT}"
    fi
    echo -e "  INSUFFICIENT_DATA: ${INSUFFICIENT_COUNT}"
    echo ""
    
    # Display individual alarms
    echo -e "${CYAN}Alarm Details:${NC}"
    for ALARM in $(echo "$ALARM_DETAILS" | jq -c '.[]'); do
        ALARM_NAME=$(echo "$ALARM" | jq -r '.AlarmName')
        STATE=$(echo "$ALARM" | jq -r '.StateValue')
        METRIC=$(echo "$ALARM" | jq -r '.MetricName')
        
        STATE_COLOR="${GREEN}"
        if [ "$STATE" = "ALARM" ]; then
            STATE_COLOR="${RED}"
        elif [ "$STATE" = "INSUFFICIENT_DATA" ]; then
            STATE_COLOR="${YELLOW}"
        fi
        
        echo -e "  ${STATE_COLOR}${STATE}${NC} - ${ALARM_NAME} (${METRIC})"
    done
else
    echo -e "${YELLOW}Alarm States: No alarms configured${NC}"
fi
echo ""

echo "=========================================="
echo -e "${GREEN}✓ Report written to: ${REPORT_FILE}${NC}"
echo "=========================================="

