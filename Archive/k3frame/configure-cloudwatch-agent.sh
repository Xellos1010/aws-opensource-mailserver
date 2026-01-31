#!/usr/bin/env bash
set -Eeuo pipefail
IFS=$'\n\t'

# Manual CloudWatch Agent Configuration for HEPE Foundation
# Configures CloudWatch Agent to forward syslog to CloudWatch Logs
# This is a manual configuration since we cannot modify the legacy stack

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
echo "CloudWatch Agent Manual Configuration"
echo "=========================================="
echo "Domain: ${DOMAIN}"
echo "Stack: ${STACK_NAME}"
echo "Instance: ${INSTANCE_ID}"
echo "SSM Parameter: ${SSM_PARAM_NAME}"
echo "Log Group: ${LOG_GROUP_NAME}"
echo "=========================================="
echo

# Step 1: Verify log group exists
echo "📋 Step 1: Verifying Log Group"
echo "----------------------------------------"
LOG_GROUP_EXISTS=$(aws logs describe-log-groups \
    --profile "${PROFILE}" \
    --region "${REGION}" \
    --log-group-name-prefix "${LOG_GROUP_NAME}" \
    --query "logGroups[?logGroupName=='${LOG_GROUP_NAME}'].logGroupName" \
    --output text 2>/dev/null || echo "")

if [ -n "$LOG_GROUP_EXISTS" ] && [ "$LOG_GROUP_EXISTS" != "None" ]; then
    echo -e "${GREEN}✓ Log group exists: ${LOG_GROUP_NAME}${NC}"
else
    echo -e "${RED}✗ Log group not found: ${LOG_GROUP_NAME}${NC}"
    echo "  Creating log group..."
    aws logs create-log-group \
        --profile "${PROFILE}" \
        --region "${REGION}" \
        --log-group-name "${LOG_GROUP_NAME}" \
        --retention-in-days 7
    echo -e "${GREEN}✓ Log group created${NC}"
fi
echo

# Step 2: Create CloudWatch Agent configuration JSON
echo "📋 Step 2: Creating CloudWatch Agent Configuration"
echo "----------------------------------------"
CW_AGENT_CONFIG=$(cat <<EOF
{
  "agent": {
    "metrics_collection_interval": 60,
    "run_as_user": "root"
  },
  "metrics": {
    "append_dimensions": {
      "InstanceId": "\${aws:InstanceId}"
    },
    "metrics_collected": {
      "mem": {
        "measurement": [
          "mem_used_percent",
          "mem_available"
        ],
        "metrics_collection_interval": 60
      },
      "swap": {
        "measurement": [
          "swap_used_percent"
        ],
        "metrics_collection_interval": 60
      }
    }
  },
  "logs": {
    "logs_collected": {
      "files": {
        "collect_list": [
          {
            "file_path": "/var/log/syslog",
            "log_group_name": "${LOG_GROUP_NAME}",
            "log_stream_name": "{instance_id}"
          }
        ]
      }
    }
  }
}
EOF
)

echo "Configuration JSON:"
echo "$CW_AGENT_CONFIG" | jq '.'
echo

# Step 3: Create/Update SSM Parameter
echo "📋 Step 3: Creating/Updating SSM Parameter"
echo "----------------------------------------"
PARAM_EXISTS=$(aws ssm describe-parameters \
    --profile "${PROFILE}" \
    --region "${REGION}" \
    --parameter-filters "Key=Name,Values=${SSM_PARAM_NAME}" \
    --query 'Parameters[0].Name' \
    --output text 2>/dev/null || echo "")

if [ -n "$PARAM_EXISTS" ] && [ "$PARAM_EXISTS" != "None" ]; then
    echo "Parameter exists, updating..."
    aws ssm put-parameter \
        --profile "${PROFILE}" \
        --region "${REGION}" \
        --name "${SSM_PARAM_NAME}" \
        --value "${CW_AGENT_CONFIG}" \
        --type "String" \
        --overwrite
    echo -e "${GREEN}✓ SSM parameter updated${NC}"
else
    echo "Creating new parameter..."
    aws ssm put-parameter \
        --profile "${PROFILE}" \
        --region "${REGION}" \
        --name "${SSM_PARAM_NAME}" \
        --value "${CW_AGENT_CONFIG}" \
        --type "String" \
        --description "CloudWatch Agent configuration for ${STACK_NAME}"
    echo -e "${GREEN}✓ SSM parameter created${NC}"
fi
echo

# Step 4: Create SSM Association to configure CloudWatch Agent
echo "📋 Step 4: Creating SSM Association"
echo "----------------------------------------"
ASSOCIATION_NAME="ConfigureCloudWatchAgent-${STACK_NAME}"

# Check if association exists
EXISTING_ASSOC=$(aws ssm list-associations \
    --profile "${PROFILE}" \
    --region "${REGION}" \
    --association-filter-list "key=Name,value=${ASSOCIATION_NAME}" \
    --query 'Associations[0].AssociationId' \
    --output text 2>/dev/null || echo "")

if [ -n "$EXISTING_ASSOC" ] && [ "$EXISTING_ASSOC" != "None" ]; then
    echo "Association exists: ${EXISTING_ASSOC}"
    echo "Updating association..."
    ASSOC_ID=$(aws ssm update-association \
        --profile "${PROFILE}" \
        --region "${REGION}" \
        --association-id "${EXISTING_ASSOC}" \
        --name "AmazonCloudWatch-ManageAgent" \
        --parameters "action=[configure],mode=[ec2],optionalConfigurationSource=[ssm],optionalConfigurationLocation=[${SSM_PARAM_NAME}]" \
        --targets "Key=InstanceIds,Values=${INSTANCE_ID}" \
        --query 'AssociationDescription.AssociationId' \
        --output text 2>/dev/null || echo "")
    
    if [ -n "$ASSOC_ID" ] && [ "$ASSOC_ID" != "None" ]; then
        echo -e "${GREEN}✓ Association updated: ${ASSOC_ID}${NC}"
    else
        echo -e "${YELLOW}⚠ Association update may have failed, trying to create new one${NC}"
        EXISTING_ASSOC=""
    fi
fi

if [ -z "$EXISTING_ASSOC" ] || [ "$EXISTING_ASSOC" == "None" ]; then
    echo "Creating new association..."
    ASSOC_ID=$(aws ssm create-association \
        --profile "${PROFILE}" \
        --region "${REGION}" \
        --name "AmazonCloudWatch-ManageAgent" \
        --parameters "action=[configure],mode=[ec2],optionalConfigurationSource=[ssm],optionalConfigurationLocation=[${SSM_PARAM_NAME}]" \
        --targets "Key=InstanceIds,Values=${INSTANCE_ID}" \
        --association-name "${ASSOCIATION_NAME}" \
        --query 'AssociationDescription.AssociationId' \
        --output text 2>/dev/null || echo "")
    
    if [ -n "$ASSOC_ID" ] && [ "$ASSOC_ID" != "None" ]; then
        echo -e "${GREEN}✓ Association created: ${ASSOC_ID}${NC}"
    else
        echo -e "${RED}✗ Failed to create association${NC}"
        exit 1
    fi
fi
echo

# Step 5: Run the association immediately
echo "📋 Step 5: Running SSM Association"
echo "----------------------------------------"
echo "Triggering association execution..."
COMMAND_ID=$(aws ssm start-associations-once \
    --profile "${PROFILE}" \
    --region "${REGION}" \
    --association-ids "${ASSOC_ID}" \
    --query 'AssociationExecutionStatuses[0].ExecutionId' \
    --output text 2>/dev/null || echo "")

if [ -n "$COMMAND_ID" ] && [ "$COMMAND_ID" != "None" ]; then
    echo -e "${GREEN}✓ Association execution triggered: ${COMMAND_ID}${NC}"
    echo "Waiting 10 seconds for execution to start..."
    sleep 10
    
    # Check execution status
    EXEC_STATUS=$(aws ssm describe-association-executions \
        --profile "${PROFILE}" \
        --region "${REGION}" \
        --association-id "${ASSOC_ID}" \
        --max-results 1 \
        --query 'AssociationExecutions[0].[ExecutionId,Status,DetailedStatus]' \
        --output text 2>/dev/null || echo "")
    
    if [ -n "$EXEC_STATUS" ]; then
        echo "Execution status: ${EXEC_STATUS}"
    fi
else
    echo -e "${YELLOW}⚠ Could not trigger immediate execution${NC}"
    echo "  The association will run automatically on the next schedule"
fi
echo

# Step 6: Verify CloudWatch Agent installation (via SSM if available)
echo "📋 Step 6: Verifying CloudWatch Agent"
echo "----------------------------------------"
echo "Checking if CloudWatch Agent is installed..."
echo "Note: This requires SSM access to the instance"

# Try to check agent status via SSM
SSM_AVAILABLE=$(aws ssm describe-instance-information \
    --profile "${PROFILE}" \
    --region "${REGION}" \
    --filters "Key=InstanceIds,Values=${INSTANCE_ID}" \
    --query 'InstanceInformationList[0].PingStatus' \
    --output text 2>/dev/null || echo "Inactive")

if [ "$SSM_AVAILABLE" == "Online" ]; then
    echo "SSM is available, checking agent status..."
    
    COMMAND_ID=$(aws ssm send-command \
        --profile "${PROFILE}" \
        --region "${REGION}" \
        --instance-ids "${INSTANCE_ID}" \
        --document-name "AWS-RunShellScript" \
        --parameters 'commands=["which amazon-cloudwatch-agent && echo AGENT_INSTALLED || echo AGENT_NOT_INSTALLED","systemctl status amazon-cloudwatch-agent --no-pager -l 2>&1 | head -10 || echo SERVICE_NOT_FOUND"]' \
        --query 'Command.CommandId' \
        --output text 2>/dev/null || echo "")
    
    if [ -n "$COMMAND_ID" ] && [ "$COMMAND_ID" != "None" ]; then
        echo "Command sent, waiting for result..."
        sleep 5
        
        OUTPUT=$(aws ssm get-command-invocation \
            --profile "${PROFILE}" \
            --region "${REGION}" \
            --command-id "${COMMAND_ID}" \
            --instance-id "${INSTANCE_ID}" \
            --query 'StandardOutputContent' \
            --output text 2>/dev/null || echo "")
        
        if echo "$OUTPUT" | grep -q "AGENT_INSTALLED"; then
            echo -e "${GREEN}✓ CloudWatch Agent is installed${NC}"
        else
            echo -e "${YELLOW}⚠ CloudWatch Agent may not be installed${NC}"
            echo "  You may need to install it manually:"
            echo "    sudo yum install amazon-cloudwatch-agent"
            echo "    OR"
            echo "    sudo apt-get install amazon-cloudwatch-agent"
        fi
        
        if echo "$OUTPUT" | grep -q "active (running)"; then
            echo -e "${GREEN}✓ CloudWatch Agent service is running${NC}"
        elif echo "$OUTPUT" | grep -q "SERVICE_NOT_FOUND"; then
            echo -e "${YELLOW}⚠ CloudWatch Agent service not found${NC}"
        else
            echo -e "${YELLOW}⚠ CloudWatch Agent service status unclear${NC}"
            echo "  Output: ${OUTPUT}"
        fi
    fi
else
    echo -e "${YELLOW}⚠ SSM is not available (Status: ${SSM_AVAILABLE})${NC}"
    echo "  Cannot verify agent status remotely"
    echo "  Please verify manually on the instance:"
    echo "    systemctl status amazon-cloudwatch-agent"
fi
echo

# Step 7: Wait and verify logs are being forwarded
echo "📋 Step 7: Verifying Log Forwarding"
echo "----------------------------------------"
echo "Waiting 30 seconds for logs to start appearing..."
sleep 30

LOG_STREAMS=$(aws logs describe-log-streams \
    --profile "${PROFILE}" \
    --region "${REGION}" \
    --log-group-name "${LOG_GROUP_NAME}" \
    --order-by LastEventTime \
    --descending \
    --max-items 5 \
    --query 'logStreams[*].[logStreamName,lastEventTime]' \
    --output text 2>/dev/null || echo "")

if [ -n "$LOG_STREAMS" ]; then
    echo -e "${GREEN}✓ Log streams found!${NC}"
    echo "$LOG_STREAMS" | while read -r stream time; do
        if [ -n "$time" ]; then
            # Convert timestamp (macOS compatible)
            if date -r "$((time/1000))" >/dev/null 2>&1; then
                date_str=$(date -r "$((time/1000))" 2>/dev/null)
            else
                date_str=$(date -d "@$((time/1000))" 2>/dev/null || echo "unknown")
            fi
            echo "  - ${stream} (last event: ${date_str})"
        fi
    done
else
    echo -e "${YELLOW}⚠ No log streams found yet${NC}"
    echo "  This may be normal if:"
    echo "    1. CloudWatch Agent needs time to start"
    echo "    2. Agent needs to be installed/configured"
    echo "    3. Instance needs SSM access"
fi
echo

# Summary
echo "=========================================="
echo "Configuration Summary"
echo "=========================================="
echo -e "${GREEN}✓ SSM Parameter: ${SSM_PARAM_NAME}${NC}"
echo -e "${GREEN}✓ SSM Association: ${ASSOC_ID}${NC}"
echo -e "${GREEN}✓ Log Group: ${LOG_GROUP_NAME}${NC}"
echo
echo "Next Steps:"
echo "1. Verify CloudWatch Agent is installed on the instance"
echo "2. Check agent status: systemctl status amazon-cloudwatch-agent"
echo "3. If agent is not running, start it: sudo systemctl start amazon-cloudwatch-agent"
echo "4. Monitor logs: aws logs tail ${LOG_GROUP_NAME} --follow --profile ${PROFILE}"
echo "5. Run diagnostic: ./diagnose-oom-alarm.sh"
echo




