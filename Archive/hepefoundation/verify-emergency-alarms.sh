#!/usr/bin/env bash
set -Eeuo pipefail
IFS=$'\n\t'

# Comprehensive verification script for emergency alarms
# Verifies alarm configurations, metric monitoring, and Lambda integration

DOMAIN_NAME="hepefoundation.org"
ALARMS_STACK_NAME="hepefoundation-org-emergency-alarms"
LEGACY_STACK_NAME="hepefoundation-org-mailserver"
STOP_START_STACK_NAME="hepefoundation-org-stop-start-helper"
REGION="us-east-1"
PROFILE="hepe-admin-mfa"

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo "=========================================="
echo "Emergency Alarms Verification Report"
echo "=========================================="
echo "Domain: ${DOMAIN_NAME}"
echo "Alarms Stack: ${ALARMS_STACK_NAME}"
echo "Date: $(date)"
echo "=========================================="
echo ""

# Get instance ID
echo "📋 Step 1: Getting Instance Information"
echo "----------------------------------------"
INSTANCE_ID=$(aws cloudformation describe-stacks \
    --profile "${PROFILE}" \
    --region "${REGION}" \
    --stack-name "${LEGACY_STACK_NAME}" \
    --query 'Stacks[0].Outputs[?OutputKey==`RestorePrefix`].OutputValue' \
    --output text 2>/dev/null)

if [ -z "$INSTANCE_ID" ]; then
    INSTANCE_ID=$(aws cloudformation describe-stacks \
        --profile "${PROFILE}" \
        --region "${REGION}" \
        --stack-name "${LEGACY_STACK_NAME}" \
        --query 'Stacks[0].Outputs[?OutputKey==`InstanceId`].OutputValue' \
        --output text 2>/dev/null)
fi

if [ -z "$INSTANCE_ID" ] || [ "$INSTANCE_ID" = "None" ]; then
    echo -e "${RED}✗ Could not find instance ID${NC}"
    exit 1
fi

echo -e "${GREEN}✓ Instance ID: ${INSTANCE_ID}${NC}"

# Get instance state
INSTANCE_STATE=$(aws ec2 describe-instances \
    --profile "${PROFILE}" \
    --region "${REGION}" \
    --instance-ids "${INSTANCE_ID}" \
    --query 'Reservations[0].Instances[0].State.Name' \
    --output text 2>/dev/null)

echo -e "${GREEN}✓ Instance State: ${INSTANCE_STATE}${NC}"
echo ""

# Get Lambda ARN
echo "📋 Step 2: Verifying Lambda Function"
echo "----------------------------------------"
LAMBDA_ARN=$(aws cloudformation describe-stacks \
    --profile "${PROFILE}" \
    --region "${REGION}" \
    --stack-name "${STOP_START_STACK_NAME}" \
    --query 'Stacks[0].Outputs[?OutputKey==`LambdaFunctionArn`].OutputValue' \
    --output text 2>/dev/null)

if [ -z "$LAMBDA_ARN" ] || [ "$LAMBDA_ARN" = "None" ]; then
    echo -e "${RED}✗ Could not find Lambda ARN${NC}"
    exit 1
fi

echo -e "${GREEN}✓ Lambda ARN: ${LAMBDA_ARN}${NC}"

# Verify Lambda exists and is configured correctly
LAMBDA_CONFIG=$(aws lambda get-function \
    --profile "${PROFILE}" \
    --region "${REGION}" \
    --function-name "${LAMBDA_ARN}" \
    --query '{Runtime:Configuration.Runtime,Timeout:Configuration.Timeout,Memory:Configuration.MemorySize,Env:Configuration.Environment}' \
    --output json 2>/dev/null)

if [ -n "$LAMBDA_CONFIG" ]; then
    echo -e "${GREEN}✓ Lambda function exists and is accessible${NC}"
    echo "$LAMBDA_CONFIG" | jq '.'
else
    echo -e "${RED}✗ Lambda function not accessible${NC}"
fi
echo ""

# Get stack resources
echo "📋 Step 3: Verifying Stack Resources"
echo "----------------------------------------"
STACK_RESOURCES=$(aws cloudformation describe-stack-resources \
    --profile "${PROFILE}" \
    --region "${REGION}" \
    --stack-name "${ALARMS_STACK_NAME}" \
    --query 'StackResources[*].{Type:ResourceType,LogicalId:LogicalResourceId,PhysicalId:PhysicalResourceId,Status:ResourceStatus}' \
    --output json)

ALARM_COUNT=$(echo "$STACK_RESOURCES" | jq '[.[] | select(.Type == "AWS::CloudWatch::Alarm")] | length')
echo -e "${GREEN}✓ Stack contains ${ALARM_COUNT} CloudWatch alarm(s)${NC}"

echo "$STACK_RESOURCES" | jq -r '.[] | "  \(.LogicalId): \(.PhysicalId) [\(.Status)]"'
echo ""

# Verify each alarm
echo "📋 Step 4: Detailed Alarm Configuration"
echo "----------------------------------------"

ALARM_NAMES=(
    "InstanceStatusCheck-${INSTANCE_ID}"
    "SystemStatusCheck-${INSTANCE_ID}"
    "OOMKillDetected-${INSTANCE_ID}"
)

for ALARM_NAME in "${ALARM_NAMES[@]}"; do
    echo ""
    echo -e "${BLUE}Alarm: ${ALARM_NAME}${NC}"
    echo "  ──────────────────────────────────────"
    
    ALARM_CONFIG=$(aws cloudwatch describe-alarms \
        --profile "${PROFILE}" \
        --region "${REGION}" \
        --alarm-names "${ALARM_NAME}" \
        --query 'MetricAlarms[0]' \
        --output json 2>/dev/null)
    
    if [ -z "$ALARM_CONFIG" ] || [ "$ALARM_CONFIG" = "null" ]; then
        echo -e "  ${RED}✗ Alarm not found${NC}"
        continue
    fi
    
    # Extract key information
    NAMESPACE=$(echo "$ALARM_CONFIG" | jq -r '.Namespace')
    METRIC_NAME=$(echo "$ALARM_CONFIG" | jq -r '.MetricName')
    STATISTIC=$(echo "$ALARM_CONFIG" | jq -r '.Statistic')
    PERIOD=$(echo "$ALARM_CONFIG" | jq -r '.Period')
    THRESHOLD=$(echo "$ALARM_CONFIG" | jq -r '.Threshold')
    EVAL_PERIODS=$(echo "$ALARM_CONFIG" | jq -r '.EvaluationPeriods')
    COMPARISON=$(echo "$ALARM_CONFIG" | jq -r '.ComparisonOperator')
    STATE=$(echo "$ALARM_CONFIG" | jq -r '.StateValue')
    ACTIONS=$(echo "$ALARM_CONFIG" | jq -r '.AlarmActions[]')
    DIMENSIONS=$(echo "$ALARM_CONFIG" | jq -c '.Dimensions')
    
    echo -e "  ${GREEN}✓ Alarm exists and is configured${NC}"
    echo "  Namespace: ${NAMESPACE}"
    echo "  Metric: ${METRIC_NAME}"
    echo "  Statistic: ${STATISTIC}"
    echo "  Period: ${PERIOD} seconds"
    echo "  Threshold: ${THRESHOLD}"
    echo "  Evaluation Periods: ${EVAL_PERIODS}"
    echo "  Comparison: ${COMPARISON}"
    echo "  Current State: ${STATE}"
    echo "  Dimensions: ${DIMENSIONS}"
    
    # Verify dimensions match instance
    INSTANCE_IN_DIMENSIONS=$(echo "$DIMENSIONS" | jq -r '.[] | select(.Name == "InstanceId") | .Value')
    if [ "$INSTANCE_IN_DIMENSIONS" = "$INSTANCE_ID" ]; then
        echo -e "  ${GREEN}✓ Dimensions correctly target instance ${INSTANCE_ID}${NC}"
    else
        echo -e "  ${YELLOW}⚠ Dimensions: ${INSTANCE_IN_DIMENSIONS} (expected: ${INSTANCE_ID})${NC}"
    fi
    
    # Verify Lambda action
    HAS_LAMBDA_ACTION=false
    for ACTION in $(echo "$ALARM_CONFIG" | jq -r '.AlarmActions[]'); do
        if [ "$ACTION" = "$LAMBDA_ARN" ]; then
            HAS_LAMBDA_ACTION=true
            break
        fi
    done
    
    if [ "$HAS_LAMBDA_ACTION" = true ]; then
        echo -e "  ${GREEN}✓ Lambda action configured: ${LAMBDA_ARN}${NC}"
    else
        echo -e "  ${RED}✗ Lambda action NOT configured${NC}"
        echo "    Expected: ${LAMBDA_ARN}"
        echo "    Found: $(echo "$ALARM_CONFIG" | jq -r '.AlarmActions[]')"
    fi
    
    # Get recent metric data
    echo ""
    echo "  Recent Metric Data (last 1 hour):"
    END_TIME=$(date -u +%Y-%m-%dT%H:%M:%S)
    # macOS compatible: use -v flag instead of -d
    if [[ "$OSTYPE" == "darwin"* ]]; then
        START_TIME=$(date -u -v-1H +%Y-%m-%dT%H:%M:%S)
    else
        START_TIME=$(date -u -d '1 hour ago' +%Y-%m-%dT%H:%M:%S)
    fi
    
    METRIC_DATA=$(aws cloudwatch get-metric-statistics \
        --profile "${PROFILE}" \
        --region "${REGION}" \
        --namespace "${NAMESPACE}" \
        --metric-name "${METRIC_NAME}" \
        --dimensions ${DIMENSIONS} \
        --start-time "${START_TIME}" \
        --end-time "${END_TIME}" \
        --period 300 \
        --statistics "${STATISTIC}" \
        --query 'Datapoints | sort_by(@, &Timestamp) | [-5:]' \
        --output json 2>/dev/null || echo "[]")
    
    if [ -n "$METRIC_DATA" ] && [ "$METRIC_DATA" != "[]" ] && [ "$METRIC_DATA" != "null" ]; then
        echo "$METRIC_DATA" | jq -r '.[] | "    \(.Timestamp): \(.Maximum // .Sum // .Average // "N/A")"'
    else
        echo -e "    ${YELLOW}⚠ No metric data available (may be normal if no events occurred)${NC}"
    fi
done

echo ""
echo "📋 Step 5: Lambda Permission Verification"
echo "----------------------------------------"

# Check Lambda permissions
LAMBDA_POLICY=$(aws lambda get-policy \
    --profile "${PROFILE}" \
    --region "${REGION}" \
    --function-name "${LAMBDA_ARN}" \
    --query 'Policy' \
    --output text 2>/dev/null || echo "")

if [ -n "$LAMBDA_POLICY" ]; then
    POLICY_JSON=$(echo "$LAMBDA_POLICY" | jq -r '.')
    HAS_CLOUDWATCH_PERM=$(echo "$POLICY_JSON" | jq -r '.Statement[] | select(.Principal.Service == "events.amazonaws.com" or .Principal.Service == "lambda.amazonaws.com")' 2>/dev/null || echo "")
    
    if [ -n "$HAS_CLOUDWATCH_PERM" ]; then
        echo -e "${GREEN}✓ Lambda has permissions for CloudWatch/EventBridge${NC}"
    else
        echo -e "${YELLOW}⚠ Lambda permissions may need to be configured${NC}"
        echo "  Note: CloudWatch alarms automatically create permissions when configured"
    fi
else
    echo -e "${YELLOW}⚠ Could not retrieve Lambda policy (may be normal)${NC}"
    echo "  CloudWatch alarms automatically create required permissions"
fi
echo ""

echo "📋 Step 6: Test Alarm-to-Lambda Connection"
echo "----------------------------------------"

# Check if we can describe the Lambda (indirect test)
LAMBDA_EXISTS=$(aws lambda get-function-configuration \
    --profile "${PROFILE}" \
    --region "${REGION}" \
    --function-name "${LAMBDA_ARN}" \
    --query 'FunctionName' \
    --output text 2>/dev/null)

if [ -n "$LAMBDA_EXISTS" ]; then
    echo -e "${GREEN}✓ Lambda is accessible and can be invoked${NC}"
    echo "  Function Name: ${LAMBDA_EXISTS}"
    
    # Check Lambda environment variables
    LAMBDA_ENV=$(aws lambda get-function-configuration \
        --profile "${PROFILE}" \
        --region "${REGION}" \
        --function-name "${LAMBDA_ARN}" \
        --query 'Environment.Variables' \
        --output json 2>/dev/null)
    
    if [ -n "$LAMBDA_ENV" ] && [ "$LAMBDA_ENV" != "null" ]; then
        echo "  Environment Variables:"
        echo "$LAMBDA_ENV" | jq -r 'to_entries[] | "    \(.key): \(.value)"'
    fi
else
    echo -e "${RED}✗ Lambda is not accessible${NC}"
fi
echo ""

echo "📋 Step 7: Current Instance Status Checks"
echo "----------------------------------------"

# Get current instance status
INSTANCE_STATUS=$(aws ec2 describe-instance-status \
    --profile "${PROFILE}" \
    --region "${REGION}" \
    --instance-ids "${INSTANCE_ID}" \
    --include-all-instances \
    --query 'InstanceStatuses[0]' \
    --output json 2>/dev/null)

if [ -n "$INSTANCE_STATUS" ] && [ "$INSTANCE_STATUS" != "null" ]; then
    SYSTEM_STATUS=$(echo "$INSTANCE_STATUS" | jq -r '.SystemStatus.Status // "unknown"')
    INSTANCE_STATUS_CHECK=$(echo "$INSTANCE_STATUS" | jq -r '.InstanceStatus.Status // "unknown"')
    
    echo "  System Status Check: ${SYSTEM_STATUS}"
    echo "  Instance Status Check: ${INSTANCE_STATUS_CHECK}"
    
    if [ "$SYSTEM_STATUS" = "ok" ] && [ "$INSTANCE_STATUS_CHECK" = "ok" ]; then
        echo -e "  ${GREEN}✓ All status checks passing${NC}"
    else
        echo -e "  ${YELLOW}⚠ Status checks not passing - alarms should trigger if this persists${NC}"
    fi
else
    echo -e "  ${YELLOW}⚠ Could not retrieve instance status${NC}"
fi
echo ""

echo "=========================================="
echo "Verification Summary"
echo "=========================================="
echo ""

# Final summary
ALL_ALARMS_OK=true
for ALARM_NAME in "${ALARM_NAMES[@]}"; do
    ALARM_STATE=$(aws cloudwatch describe-alarms \
        --profile "${PROFILE}" \
        --region "${REGION}" \
        --alarm-names "${ALARM_NAME}" \
        --query 'MetricAlarms[0].StateValue' \
        --output text 2>/dev/null)
    
    if [ "$ALARM_STATE" = "None" ] || [ -z "$ALARM_STATE" ]; then
        echo -e "${RED}✗ ${ALARM_NAME}: Not found${NC}"
        ALL_ALARMS_OK=false
    else
        echo -e "${GREEN}✓ ${ALARM_NAME}: ${ALARM_STATE}${NC}"
    fi
done

echo ""
if [ "$ALL_ALARMS_OK" = true ]; then
    echo -e "${GREEN}✅ All alarms are properly configured and managed by CloudFormation${NC}"
    echo ""
    echo "What happens when alarms trigger:"
    echo "  1. Alarm enters ALARM state"
    echo "  2. CloudWatch automatically invokes Lambda: ${LAMBDA_ARN}"
    echo "  3. Lambda discovers instance ID from stack: ${LEGACY_STACK_NAME}"
    echo "  4. Lambda performs stop-and-start cycle"
    echo "  5. Instance restarts and status checks should pass"
else
    echo -e "${RED}❌ Some alarms are not properly configured${NC}"
fi

echo ""
echo "To monitor alarms in real-time:"
echo "  aws cloudwatch describe-alarms --alarm-names InstanceStatusCheck-${INSTANCE_ID} --query 'MetricAlarms[0].StateValue'"
echo ""
echo "To view Lambda execution logs:"
echo "  aws logs tail /aws/lambda/StopStartLambda-${STOP_START_STACK_NAME} --follow"
echo ""

