#!/usr/bin/env bash
set -Eeuo pipefail
IFS=$'\n\t'

# Audit and cleanup CloudWatch alarms for HEPE foundation
# Finds alarms not managed by CloudFormation stacks and deletes them

DOMAIN_NAME="hepefoundation.org"
INSTANCE_ID="i-0a1ff83f513575ed4"
REGION="us-east-1"
PROFILE="hepe-admin-mfa"

echo "=========================================="
echo "Audit and Cleanup CloudWatch Alarms"
echo "=========================================="
echo "Domain: ${DOMAIN_NAME}"
echo "Instance ID: ${INSTANCE_ID}"
echo "Region: ${REGION}"
echo "=========================================="
echo ""

# Get all alarms related to this instance
echo "Finding all alarms for instance ${INSTANCE_ID}..."
ALL_ALARMS=$(aws cloudwatch describe-alarms \
    --profile "${PROFILE}" \
    --region "${REGION}" \
    --query "MetricAlarms[?contains(AlarmName, '${INSTANCE_ID}') || contains(AlarmName, 'hepefoundation')].AlarmName" \
    --output json 2>/dev/null)

if [ -z "$ALL_ALARMS" ] || [ "$ALL_ALARMS" = "[]" ]; then
    echo "No alarms found for this instance"
    exit 0
fi

ALARM_COUNT=$(echo "$ALL_ALARMS" | jq 'length')
echo "Found ${ALARM_COUNT} alarm(s)"
echo ""

# Get all CloudFormation stacks
echo "Getting list of CloudFormation stacks..."
ALL_STACKS=$(aws cloudformation list-stacks \
    --profile "${PROFILE}" \
    --region "${REGION}" \
    --stack-status-filter CREATE_COMPLETE UPDATE_COMPLETE \
    --query 'StackSummaries[*].StackName' \
    --output json)

echo "Found $(echo "$ALL_STACKS" | jq 'length') active stack(s)"
echo ""

# For each stack, get its resources to see which alarms it manages
echo "Identifying alarms managed by CloudFormation stacks..."
MANAGED_ALARMS=()

for STACK_NAME in $(echo "$ALL_STACKS" | jq -r '.[]'); do
    echo "  Checking stack: ${STACK_NAME}"
    
    # Get all resources in this stack
    STACK_RESOURCES=$(aws cloudformation list-stack-resources \
        --profile "${PROFILE}" \
        --region "${REGION}" \
        --stack-name "${STACK_NAME}" \
        --query 'StackResourceSummaries[?ResourceType==`AWS::CloudWatch::Alarm`].PhysicalResourceId' \
        --output json 2>/dev/null || echo "[]")
    
    if [ -n "$STACK_RESOURCES" ] && [ "$STACK_RESOURCES" != "[]" ]; then
        for ALARM_NAME in $(echo "$STACK_RESOURCES" | jq -r '.[]'); do
            MANAGED_ALARMS+=("$ALARM_NAME")
            echo "    ✓ Managed alarm: ${ALARM_NAME}"
        done
    fi
done

echo ""
echo "Found ${#MANAGED_ALARMS[@]} alarm(s) managed by CloudFormation"
echo ""

# Find orphaned alarms (not in managed list)
echo "Identifying orphaned alarms..."
ORPHANED_ALARMS=()

for ALARM_NAME in $(echo "$ALL_ALARMS" | jq -r '.[]'); do
    IS_MANAGED=false
    for MANAGED in "${MANAGED_ALARMS[@]}"; do
        if [ "$ALARM_NAME" = "$MANAGED" ]; then
            IS_MANAGED=true
            break
        fi
    done
    
    if [ "$IS_MANAGED" = false ]; then
        ORPHANED_ALARMS+=("$ALARM_NAME")
        echo "  ⚠️  Orphaned alarm: ${ALARM_NAME}"
    else
        echo "  ✓ Managed alarm: ${ALARM_NAME}"
    fi
done

echo ""

if [ ${#ORPHANED_ALARMS[@]} -eq 0 ]; then
    echo "✅ No orphaned alarms found - all alarms are managed by CloudFormation"
    echo ""
    exit 0
fi

echo "=========================================="
echo "Found ${#ORPHANED_ALARMS[@]} Orphaned Alarm(s)"
echo "=========================================="
echo ""

# Show details of orphaned alarms
for ALARM_NAME in "${ORPHANED_ALARMS[@]}"; do
    echo "Alarm: ${ALARM_NAME}"
    aws cloudwatch describe-alarms \
        --profile "${PROFILE}" \
        --region "${REGION}" \
        --alarm-names "${ALARM_NAME}" \
        --query 'MetricAlarms[0].{State:StateValue,Description:AlarmDescription,Created:AlarmConfigurationUpdatedTimestamp}' \
        --output table
    echo ""
done

# Confirm deletion
echo "=========================================="
echo "Delete Orphaned Alarms?"
echo "=========================================="
echo "The following ${#ORPHANED_ALARMS[@]} alarm(s) will be deleted:"
for ALARM_NAME in "${ORPHANED_ALARMS[@]}"; do
    echo "  - ${ALARM_NAME}"
done
echo ""
read -p "Delete these alarms? (yes/no): " CONFIRM

if [ "$CONFIRM" != "yes" ]; then
    echo "Deletion cancelled"
    exit 0
fi

# Delete orphaned alarms
echo ""
echo "Deleting orphaned alarms..."
for ALARM_NAME in "${ORPHANED_ALARMS[@]}"; do
    echo "  Deleting: ${ALARM_NAME}"
    aws cloudwatch delete-alarms \
        --profile "${PROFILE}" \
        --region "${REGION}" \
        --alarm-names "${ALARM_NAME}" \
        > /dev/null 2>&1
    
    if [ $? -eq 0 ]; then
        echo "    ✓ Deleted ${ALARM_NAME}"
    else
        echo "    ✗ Failed to delete ${ALARM_NAME}"
    fi
done

echo ""
echo "=========================================="
echo "Cleanup Complete!"
echo "=========================================="
echo ""














