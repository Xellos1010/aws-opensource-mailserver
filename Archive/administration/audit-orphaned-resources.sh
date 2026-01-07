#!/usr/bin/env bash
set -Eeuo pipefail
IFS=$'\n\t'

# Comprehensive AWS Resource Audit
# Finds orphaned resources not managed by CloudFormation stacks

REGION="${AWS_REGION:-us-east-1}"
PROFILE="${AWS_PROFILE:-hepe-admin-mfa}"
REPORT_FILE="${1:-orphaned-resources-report-$(date +%Y%m%d-%H%M%S).txt}"

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo "=========================================="
echo "AWS Orphaned Resources Audit"
echo "=========================================="
echo "Profile: ${PROFILE}"
echo "Region: ${REGION}"
echo "Report File: ${REPORT_FILE}"
echo "Date: $(date)"
echo "=========================================="
echo ""

# Initialize report file
{
    echo "AWS Orphaned Resources Audit Report"
    echo "===================================="
    echo "Generated: $(date)"
    echo "Profile: ${PROFILE}"
    echo "Region: ${REGION}"
    echo ""
    echo "This report identifies AWS resources that are NOT managed by CloudFormation stacks."
    echo "Resources may be intentionally orphaned (e.g., manually created, from other tools)."
    echo ""
} > "${REPORT_FILE}"

# Get all CloudFormation stacks and their resources
echo "📋 Step 1: Discovering CloudFormation Stacks"
echo "----------------------------------------"

ALL_STACKS=$(aws cloudformation list-stacks \
    --profile "${PROFILE}" \
    --region "${REGION}" \
    --stack-status-filter CREATE_COMPLETE UPDATE_COMPLETE \
    --query 'StackSummaries[*].StackName' \
    --output json 2>/dev/null || echo "[]")

STACK_COUNT=$(echo "$ALL_STACKS" | jq 'length')
echo "Found ${STACK_COUNT} active CloudFormation stack(s)"

# Build map of managed resources
echo "Building resource map from CloudFormation stacks..."
MANAGED_RESOURCES=()

for STACK_NAME in $(echo "$ALL_STACKS" | jq -r '.[]'); do
    echo "  Processing stack: ${STACK_NAME}"
    
    STACK_RESOURCES=$(aws cloudformation list-stack-resources \
        --profile "${PROFILE}" \
        --region "${REGION}" \
        --stack-name "${STACK_NAME}" \
        --query 'StackResourceSummaries[*].{Type:ResourceType,PhysicalId:PhysicalResourceId}' \
        --output json 2>/dev/null || echo "[]")
    
    if [ -n "$STACK_RESOURCES" ] && [ "$STACK_RESOURCES" != "[]" ]; then
        for RESOURCE in $(echo "$STACK_RESOURCES" | jq -c '.[]'); do
            PHYSICAL_ID=$(echo "$RESOURCE" | jq -r '.PhysicalId')
            RESOURCE_TYPE=$(echo "$RESOURCE" | jq -r '.Type')
            if [ -n "$PHYSICAL_ID" ] && [ "$PHYSICAL_ID" != "null" ]; then
                MANAGED_RESOURCES+=("${RESOURCE_TYPE}:${PHYSICAL_ID}")
            fi
        done
    fi
done

echo "Found ${#MANAGED_RESOURCES[@]} managed resources across all stacks"
echo ""

# Function to check if resource is managed
is_managed() {
    local resource_type="$1"
    local resource_id="$2"
    local key="${resource_type}:${resource_id}"
    
    for managed in "${MANAGED_RESOURCES[@]}"; do
        if [ "$managed" = "$key" ]; then
            return 0
        fi
    done
    return 1
}

# Function to add to report
add_to_report() {
    local section="$1"
    local resource_type="$2"
    local resource_id="$3"
    local details="${4:-}"
    
    {
        echo ""
        echo "Resource Type: ${resource_type}"
        echo "Resource ID: ${resource_id}"
        if [ -n "$details" ]; then
            echo "Details: ${details}"
        fi
        echo "---"
    } >> "${REPORT_FILE}"
}

# EC2 Instances
echo "📋 Step 2: Auditing EC2 Instances"
echo "----------------------------------------"
{
    echo ""
    echo "=========================================="
    echo "EC2 INSTANCES"
    echo "=========================================="
} >> "${REPORT_FILE}"

EC2_INSTANCES=$(aws ec2 describe-instances \
    --profile "${PROFILE}" \
    --region "${REGION}" \
    --query 'Reservations[*].Instances[*].{InstanceId:InstanceId,State:State.Name,Tags:Tags}' \
    --output json 2>/dev/null || echo "[]")

ORPHANED_EC2=0
for INSTANCE in $(echo "$EC2_INSTANCES" | jq -c '.[][]'); do
    INSTANCE_ID=$(echo "$INSTANCE" | jq -r '.InstanceId')
    STATE=$(echo "$INSTANCE" | jq -r '.State')
    TAGS=$(echo "$INSTANCE" | jq -c '.Tags // []')
    
    if ! is_managed "AWS::EC2::Instance" "$INSTANCE_ID"; then
        ORPHANED_EC2=$((ORPHANED_EC2 + 1))
        TAG_STR=$(echo "$TAGS" | jq -r '.[] | "\(.Key)=\(.Value)"' | tr '\n' ',' | sed 's/,$//')
        add_to_report "EC2" "EC2 Instance" "$INSTANCE_ID" "State: ${STATE}, Tags: ${TAG_STR}"
        echo -e "  ${YELLOW}⚠ Orphaned: ${INSTANCE_ID} (${STATE})${NC}"
    fi
done

if [ $ORPHANED_EC2 -eq 0 ]; then
    echo -e "  ${GREEN}✓ All EC2 instances are managed${NC}"
    echo "No orphaned EC2 instances found." >> "${REPORT_FILE}"
fi
echo ""

# CloudWatch Alarms
echo "📋 Step 3: Auditing CloudWatch Alarms"
echo "----------------------------------------"
{
    echo ""
    echo "=========================================="
    echo "CLOUDWATCH ALARMS"
    echo "=========================================="
} >> "${REPORT_FILE}"

ALARMS=$(aws cloudwatch describe-alarms \
    --profile "${PROFILE}" \
    --region "${REGION}" \
    --query 'MetricAlarms[*].AlarmName' \
    --output json 2>/dev/null || echo "[]")

ORPHANED_ALARMS=0
for ALARM_NAME in $(echo "$ALARMS" | jq -r '.[]'); do
    if ! is_managed "AWS::CloudWatch::Alarm" "$ALARM_NAME"; then
        ORPHANED_ALARMS=$((ORPHANED_ALARMS + 1))
        ALARM_DETAILS=$(aws cloudwatch describe-alarms \
            --profile "${PROFILE}" \
            --region "${REGION}" \
            --alarm-names "$ALARM_NAME" \
            --query 'MetricAlarms[0].{State:StateValue,Metric:MetricName,Namespace:Namespace}' \
            --output json 2>/dev/null || echo "{}")
        add_to_report "CloudWatch" "CloudWatch Alarm" "$ALARM_NAME" "$(echo "$ALARM_DETAILS" | jq -c '.')"
        echo -e "  ${YELLOW}⚠ Orphaned: ${ALARM_NAME}${NC}"
    fi
done

if [ $ORPHANED_ALARMS -eq 0 ]; then
    echo -e "  ${GREEN}✓ All CloudWatch alarms are managed${NC}"
    echo "No orphaned CloudWatch alarms found." >> "${REPORT_FILE}"
fi
echo ""

# Lambda Functions
echo "📋 Step 4: Auditing Lambda Functions"
echo "----------------------------------------"
{
    echo ""
    echo "=========================================="
    echo "LAMBDA FUNCTIONS"
    echo "=========================================="
} >> "${REPORT_FILE}"

LAMBDA_FUNCTIONS=$(aws lambda list-functions \
    --profile "${PROFILE}" \
    --region "${REGION}" \
    --query 'Functions[*].FunctionName' \
    --output json 2>/dev/null || echo "[]")

ORPHANED_LAMBDA=0
for FUNC_NAME in $(echo "$LAMBDA_FUNCTIONS" | jq -r '.[]'); do
    FUNC_ARN=$(aws lambda get-function \
        --profile "${PROFILE}" \
        --region "${REGION}" \
        --function-name "$FUNC_NAME" \
        --query 'Configuration.FunctionArn' \
        --output text 2>/dev/null || echo "")
    
    if [ -n "$FUNC_ARN" ]; then
        if ! is_managed "AWS::Lambda::Function" "$FUNC_NAME" && ! is_managed "AWS::Lambda::Function" "$FUNC_ARN"; then
            ORPHANED_LAMBDA=$((ORPHANED_LAMBDA + 1))
            FUNC_DETAILS=$(aws lambda get-function-configuration \
                --profile "${PROFILE}" \
                --region "${REGION}" \
                --function-name "$FUNC_NAME" \
                --query '{Runtime:Runtime,Timeout:Timeout,Memory:MemorySize}' \
                --output json 2>/dev/null || echo "{}")
            add_to_report "Lambda" "Lambda Function" "$FUNC_NAME" "$(echo "$FUNC_DETAILS" | jq -c '.')"
            echo -e "  ${YELLOW}⚠ Orphaned: ${FUNC_NAME}${NC}"
        fi
    fi
done

if [ $ORPHANED_LAMBDA -eq 0 ]; then
    echo -e "  ${GREEN}✓ All Lambda functions are managed${NC}"
    echo "No orphaned Lambda functions found." >> "${REPORT_FILE}"
fi
echo ""

# S3 Buckets
echo "📋 Step 5: Auditing S3 Buckets"
echo "----------------------------------------"
{
    echo ""
    echo "=========================================="
    echo "S3 BUCKETS"
    echo "=========================================="
} >> "${REPORT_FILE}"

S3_BUCKETS=$(aws s3api list-buckets \
    --profile "${PROFILE}" \
    --query 'Buckets[*].Name' \
    --output json 2>/dev/null || echo "[]")

ORPHANED_S3=0
for BUCKET_NAME in $(echo "$S3_BUCKETS" | jq -r '.[]'); do
    if ! is_managed "AWS::S3::Bucket" "$BUCKET_NAME"; then
        ORPHANED_S3=$((ORPHANED_S3 + 1))
        BUCKET_REGION=$(aws s3api get-bucket-location \
            --profile "${PROFILE}" \
            --bucket "$BUCKET_NAME" \
            --query 'LocationConstraint' \
            --output text 2>/dev/null || echo "unknown")
        add_to_report "S3" "S3 Bucket" "$BUCKET_NAME" "Region: ${BUCKET_REGION}"
        echo -e "  ${YELLOW}⚠ Orphaned: ${BUCKET_NAME}${NC}"
    fi
done

if [ $ORPHANED_S3 -eq 0 ]; then
    echo -e "  ${GREEN}✓ All S3 buckets are managed${NC}"
    echo "No orphaned S3 buckets found." >> "${REPORT_FILE}"
fi
echo ""

# SNS Topics
echo "📋 Step 6: Auditing SNS Topics"
echo "----------------------------------------"
{
    echo ""
    echo "=========================================="
    echo "SNS TOPICS"
    echo "=========================================="
} >> "${REPORT_FILE}"

SNS_TOPICS=$(aws sns list-topics \
    --profile "${PROFILE}" \
    --region "${REGION}" \
    --query 'Topics[*].TopicArn' \
    --output json 2>/dev/null || echo "[]")

ORPHANED_SNS=0
for TOPIC_ARN in $(echo "$SNS_TOPICS" | jq -r '.[]'); do
    TOPIC_NAME=$(echo "$TOPIC_ARN" | awk -F: '{print $NF}')
    if ! is_managed "AWS::SNS::Topic" "$TOPIC_ARN" && ! is_managed "AWS::SNS::Topic" "$TOPIC_NAME"; then
        ORPHANED_SNS=$((ORPHANED_SNS + 1))
        add_to_report "SNS" "SNS Topic" "$TOPIC_ARN" ""
        echo -e "  ${YELLOW}⚠ Orphaned: ${TOPIC_ARN}${NC}"
    fi
done

if [ $ORPHANED_SNS -eq 0 ]; then
    echo -e "  ${GREEN}✓ All SNS topics are managed${NC}"
    echo "No orphaned SNS topics found." >> "${REPORT_FILE}"
fi
echo ""

# CloudWatch Log Groups
echo "📋 Step 7: Auditing CloudWatch Log Groups"
echo "----------------------------------------"
{
    echo ""
    echo "=========================================="
    echo "CLOUDWATCH LOG GROUPS"
    echo "=========================================="
} >> "${REPORT_FILE}"

LOG_GROUPS=$(aws logs describe-log-groups \
    --profile "${PROFILE}" \
    --region "${REGION}" \
    --query 'logGroups[*].logGroupName' \
    --output json 2>/dev/null || echo "[]")

ORPHANED_LOGS=0
for LOG_GROUP in $(echo "$LOG_GROUPS" | jq -r '.[]'); do
    # Skip AWS service logs (often auto-created)
    if [[ "$LOG_GROUP" == /aws/* ]] && [[ ! "$LOG_GROUP" == /aws/lambda/* ]] && [[ ! "$LOG_GROUP" == /ec2/* ]]; then
        continue
    fi
    
    if ! is_managed "AWS::Logs::LogGroup" "$LOG_GROUP"; then
        ORPHANED_LOGS=$((ORPHANED_LOGS + 1))
        LOG_SIZE=$(aws logs describe-log-groups \
            --profile "${PROFILE}" \
            --region "${REGION}" \
            --log-group-name-prefix "$LOG_GROUP" \
            --query 'logGroups[0].storedBytes' \
            --output text 2>/dev/null || echo "0")
        add_to_report "CloudWatch Logs" "Log Group" "$LOG_GROUP" "Size: ${LOG_SIZE} bytes"
        echo -e "  ${YELLOW}⚠ Orphaned: ${LOG_GROUP}${NC}"
    fi
done

if [ $ORPHANED_LOGS -eq 0 ]; then
    echo -e "  ${GREEN}✓ All CloudWatch log groups are managed${NC}"
    echo "No orphaned CloudWatch log groups found." >> "${REPORT_FILE}"
fi
echo ""

# Security Groups
echo "📋 Step 8: Auditing Security Groups"
echo "----------------------------------------"
{
    echo ""
    echo "=========================================="
    echo "SECURITY GROUPS"
    echo "=========================================="
} >> "${REPORT_FILE}"

SECURITY_GROUPS=$(aws ec2 describe-security-groups \
    --profile "${PROFILE}" \
    --region "${REGION}" \
    --query 'SecurityGroups[*].{GroupId:GroupId,GroupName:GroupName,Description:Description}' \
    --output json 2>/dev/null || echo "[]")

ORPHANED_SG=0
for SG in $(echo "$SECURITY_GROUPS" | jq -c '.[]'); do
    SG_ID=$(echo "$SG" | jq -r '.GroupId')
    SG_NAME=$(echo "$SG" | jq -r '.GroupName')
    SG_DESC=$(echo "$SG" | jq -r '.Description')
    
    # Skip default security groups
    if [ "$SG_NAME" = "default" ]; then
        continue
    fi
    
    if ! is_managed "AWS::EC2::SecurityGroup" "$SG_ID"; then
        ORPHANED_SG=$((ORPHANED_SG + 1))
        add_to_report "EC2" "Security Group" "$SG_ID" "Name: ${SG_NAME}, Description: ${SG_DESC}"
        echo -e "  ${YELLOW}⚠ Orphaned: ${SG_ID} (${SG_NAME})${NC}"
    fi
done

if [ $ORPHANED_SG -eq 0 ]; then
    echo -e "  ${GREEN}✓ All security groups are managed${NC}"
    echo "No orphaned security groups found." >> "${REPORT_FILE}"
fi
echo ""

# EBS Volumes
echo "📋 Step 9: Auditing EBS Volumes"
echo "----------------------------------------"
{
    echo ""
    echo "=========================================="
    echo "EBS VOLUMES"
    echo "=========================================="
} >> "${REPORT_FILE}"

EBS_VOLUMES=$(aws ec2 describe-volumes \
    --profile "${PROFILE}" \
    --region "${REGION}" \
    --query 'Volumes[*].{VolumeId:VolumeId,State:State,Size:Size,Attachments:Attachments}' \
    --output json 2>/dev/null || echo "[]")

ORPHANED_EBS=0
for VOLUME in $(echo "$EBS_VOLUMES" | jq -c '.[]'); do
    VOLUME_ID=$(echo "$VOLUME" | jq -r '.VolumeId')
    VOLUME_STATE=$(echo "$VOLUME" | jq -r '.State')
    VOLUME_SIZE=$(echo "$VOLUME" | jq -r '.Size')
    ATTACHED=$(echo "$VOLUME" | jq -r '.Attachments | length')
    
    if ! is_managed "AWS::EC2::Volume" "$VOLUME_ID"; then
        ORPHANED_EBS=$((ORPHANED_EBS + 1))
        add_to_report "EC2" "EBS Volume" "$VOLUME_ID" "State: ${VOLUME_STATE}, Size: ${VOLUME_SIZE}GB, Attached: ${ATTACHED}"
        echo -e "  ${YELLOW}⚠ Orphaned: ${VOLUME_ID} (${VOLUME_STATE}, ${VOLUME_SIZE}GB)${NC}"
    fi
done

if [ $ORPHANED_EBS -eq 0 ]; then
    echo -e "  ${GREEN}✓ All EBS volumes are managed${NC}"
    echo "No orphaned EBS volumes found." >> "${REPORT_FILE}"
fi
echo ""

# Elastic IPs
echo "📋 Step 10: Auditing Elastic IPs"
echo "----------------------------------------"
{
    echo ""
    echo "=========================================="
    echo "ELASTIC IPs"
    echo "=========================================="
} >> "${REPORT_FILE}"

EIPS=$(aws ec2 describe-addresses \
    --profile "${PROFILE}" \
    --region "${REGION}" \
    --query 'Addresses[*].{AllocationId:AllocationId,PublicIp:PublicIp,AssociationId:AssociationId}' \
    --output json 2>/dev/null || echo "[]")

ORPHANED_EIP=0
for EIP in $(echo "$EIPS" | jq -c '.[]'); do
    EIP_ID=$(echo "$EIP" | jq -r '.AllocationId')
    EIP_IP=$(echo "$EIP" | jq -r '.PublicIp')
    EIP_ASSOC=$(echo "$EIP" | jq -r '.AssociationId // "not-associated"')
    
    if ! is_managed "AWS::EC2::EIP" "$EIP_ID"; then
        ORPHANED_EIP=$((ORPHANED_EIP + 1))
        add_to_report "EC2" "Elastic IP" "$EIP_ID" "IP: ${EIP_IP}, Association: ${EIP_ASSOC}"
        echo -e "  ${YELLOW}⚠ Orphaned: ${EIP_ID} (${EIP_IP})${NC}"
    fi
done

if [ $ORPHANED_EIP -eq 0 ]; then
    echo -e "  ${GREEN}✓ All Elastic IPs are managed${NC}"
    echo "No orphaned Elastic IPs found." >> "${REPORT_FILE}"
fi
echo ""

# IAM Roles (basic check - may have many)
echo "📋 Step 11: Auditing IAM Roles (sample)"
echo "----------------------------------------"
{
    echo ""
    echo "=========================================="
    echo "IAM ROLES (Sample - First 50)"
    echo "=========================================="
    echo "Note: IAM roles are often created by services automatically."
    echo "Only roles with 'cloudformation' in name are checked."
} >> "${REPORT_FILE}"

IAM_ROLES=$(aws iam list-roles \
    --profile "${PROFILE}" \
    --query 'Roles[?contains(RoleName, `cloudformation`) || contains(RoleName, `mailserver`) || contains(RoleName, `hepe`) || contains(RoleName, `emcnotary`)].{RoleName:RoleName,Arn:Arn}' \
    --output json 2>/dev/null || echo "[]")

ORPHANED_IAM=0
for ROLE in $(echo "$IAM_ROLES" | jq -c '.[]'); do
    ROLE_NAME=$(echo "$ROLE" | jq -r '.RoleName')
    ROLE_ARN=$(echo "$ROLE" | jq -r '.Arn')
    
    if ! is_managed "AWS::IAM::Role" "$ROLE_NAME" && ! is_managed "AWS::IAM::Role" "$ROLE_ARN"; then
        ORPHANED_IAM=$((ORPHANED_IAM + 1))
        add_to_report "IAM" "IAM Role" "$ROLE_NAME" "ARN: ${ROLE_ARN}"
        echo -e "  ${YELLOW}⚠ Orphaned: ${ROLE_NAME}${NC}"
    fi
done

if [ $ORPHANED_IAM -eq 0 ]; then
    echo -e "  ${GREEN}✓ All relevant IAM roles are managed${NC}"
    echo "No orphaned IAM roles found (in filtered set)." >> "${REPORT_FILE}"
fi
echo ""

# Summary
TOTAL_ORPHANED=$((ORPHANED_EC2 + ORPHANED_ALARMS + ORPHANED_LAMBDA + ORPHANED_S3 + ORPHANED_SNS + ORPHANED_LOGS + ORPHANED_SG + ORPHANED_EBS + ORPHANED_EIP + ORPHANED_IAM))

echo "=========================================="
echo "Audit Summary"
echo "=========================================="
echo ""
echo "Orphaned Resources by Type:"
echo "  EC2 Instances: ${ORPHANED_EC2}"
echo "  CloudWatch Alarms: ${ORPHANED_ALARMS}"
echo "  Lambda Functions: ${ORPHANED_LAMBDA}"
echo "  S3 Buckets: ${ORPHANED_S3}"
echo "  SNS Topics: ${ORPHANED_SNS}"
echo "  CloudWatch Log Groups: ${ORPHANED_LOGS}"
echo "  Security Groups: ${ORPHANED_SG}"
echo "  EBS Volumes: ${ORPHANED_EBS}"
echo "  Elastic IPs: ${ORPHANED_EIP}"
echo "  IAM Roles (filtered): ${ORPHANED_IAM}"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "TOTAL ORPHANED RESOURCES: ${TOTAL_ORPHANED}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Add summary to report
{
    echo ""
    echo "=========================================="
    echo "SUMMARY"
    echo "=========================================="
    echo "Total Orphaned Resources: ${TOTAL_ORPHANED}"
    echo ""
    echo "Breakdown:"
    echo "  EC2 Instances: ${ORPHANED_EC2}"
    echo "  CloudWatch Alarms: ${ORPHANED_ALARMS}"
    echo "  Lambda Functions: ${ORPHANED_LAMBDA}"
    echo "  S3 Buckets: ${ORPHANED_S3}"
    echo "  SNS Topics: ${ORPHANED_SNS}"
    echo "  CloudWatch Log Groups: ${ORPHANED_LOGS}"
    echo "  Security Groups: ${ORPHANED_SG}"
    echo "  EBS Volumes: ${ORPHANED_EBS}"
    echo "  Elastic IPs: ${ORPHANED_EIP}"
    echo "  IAM Roles (filtered): ${ORPHANED_IAM}"
    echo ""
    echo "=========================================="
    echo "End of Report"
    echo "=========================================="
} >> "${REPORT_FILE}"

echo -e "${GREEN}✓ Report written to: ${REPORT_FILE}${NC}"
echo ""
echo "Next Steps:"
echo "  1. Review the report file: ${REPORT_FILE}"
echo "  2. Identify resources that should be managed by CloudFormation"
echo "  3. Either:"
echo "     - Add resources to existing stacks"
echo "     - Create new stacks for orphaned resources"
echo "     - Delete resources if no longer needed"
echo ""














