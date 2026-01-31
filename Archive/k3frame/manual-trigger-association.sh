#!/usr/bin/env bash
set -Eeuo pipefail
IFS=$'\n\t'

# Manually trigger SSM Association to configure CloudWatch Agent
# Use this if the association doesn't run automatically

STACK_NAME="hepefoundation-org-mailserver"
REGION="us-east-1"
PROFILE="hepe-admin-mfa"

echo "=========================================="
echo "Manual SSM Association Trigger"
echo "=========================================="
echo

# Find the association
ASSOC_ID=$(aws ssm list-associations \
    --profile "${PROFILE}" \
    --region "${REGION}" \
    --association-filter-list "key=Name,value=ConfigureCloudWatchAgent-${STACK_NAME}" \
    --query 'Associations[0].AssociationId' \
    --output text 2>/dev/null || echo "")

if [ -z "$ASSOC_ID" ] || [ "$ASSOC_ID" == "None" ]; then
    echo "Error: Association not found"
    exit 1
fi

echo "Found association: ${ASSOC_ID}"
echo "Triggering execution..."
echo

# Trigger the association
EXEC_RESULT=$(aws ssm start-associations-once \
    --profile "${PROFILE}" \
    --region "${REGION}" \
    --association-ids "${ASSOC_ID}" \
    --output json 2>&1)

if echo "$EXEC_RESULT" | grep -q "AssociationExecutionStatuses"; then
    EXEC_ID=$(echo "$EXEC_RESULT" | jq -r '.AssociationExecutionStatuses[0].ExecutionId')
    echo "✓ Association execution triggered"
    echo "  Execution ID: ${EXEC_ID}"
    echo
    echo "Waiting 15 seconds, then checking status..."
    sleep 15
    
    # Check execution status
    STATUS=$(aws ssm describe-association-executions \
        --profile "${PROFILE}" \
        --region "${REGION}" \
        --association-id "${ASSOC_ID}" \
        --max-results 1 \
        --query 'AssociationExecutions[0].[ExecutionId,Status,DetailedStatus]' \
        --output text 2>/dev/null || echo "")
    
    if [ -n "$STATUS" ]; then
        echo "Execution Status:"
        echo "  ${STATUS}"
    fi
else
    echo "Error triggering association:"
    echo "$EXEC_RESULT"
    exit 1
fi




