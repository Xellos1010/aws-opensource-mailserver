#!/usr/bin/env bash
set -Eeuo pipefail

# Check Alarm Status Script
# Shows the current status of CloudWatch alarms

# Default domain name
DEFAULT_DOMAIN="askdaokapra.com"

# Check if domain name was provided as first argument, otherwise use default
DOMAIN_NAME=${1:-$DEFAULT_DOMAIN}

# Create stack name from domain
STACK_NAME=$(echo "${DOMAIN_NAME}" | sed 's/\./-/g')-mailserver
REGION="us-east-1"

echo "Checking CloudWatch Alarm Status for domain: ${DOMAIN_NAME}"
echo "Stack name: ${STACK_NAME}"
echo "Region: ${REGION}"
echo "----------------------------------------"

# Get instance ID from EC2
INSTANCE_ID=$(aws ec2 describe-instances \
    --filters "Name=tag:Name,Values=MailInABoxInstance-${STACK_NAME}" \
    --profile hepe-admin-mfa \
    --region "${REGION}" \
    --query 'Reservations[0].Instances[0].InstanceId' \
    --output text 2>/dev/null)

if [ -z "$INSTANCE_ID" ] || [ "$INSTANCE_ID" = "None" ]; then
  echo "Error: Could not retrieve Instance ID from EC2"
  exit 1
fi

echo "Instance ID: ${INSTANCE_ID}"
echo ""

# Check memory alarm
echo "Memory High Alarm:"
aws cloudwatch describe-alarms \
    --profile hepe-admin-mfa \
    --region "${REGION}" \
    --alarm-names "MemHigh-${INSTANCE_ID}" \
    --query 'MetricAlarms[0].{AlarmName:AlarmName,StateValue:StateValue,StateReason:StateReason,StateUpdatedTimestamp:StateUpdatedTimestamp}' \
    --output table

echo ""

# Check swap alarm
echo "Swap High Alarm:"
aws cloudwatch describe-alarms \
    --profile hepe-admin-mfa \
    --region "${REGION}" \
    --alarm-names "SwapHigh-${INSTANCE_ID}" \
    --query 'MetricAlarms[0].{AlarmName:AlarmName,StateValue:StateValue,StateReason:StateReason,StateUpdatedTimestamp:StateUpdatedTimestamp}' \
    --output table

echo ""

# Check OOM alarm
echo "OOM Kill Alarm:"
aws cloudwatch describe-alarms \
    --profile hepe-admin-mfa \
    --region "${REGION}" \
    --alarm-names "OOMKillDetected-${INSTANCE_ID}" \
    --query 'MetricAlarms[0].{AlarmName:AlarmName,StateValue:StateValue,StateReason:StateReason,StateUpdatedTimestamp:StateUpdatedTimestamp}' \
    --output table

echo ""
echo "Alarm States:"
echo "- OK: Normal state, no issues"
echo "- ALARM: Threshold exceeded, action triggered"
echo "- INSUFFICIENT_DATA: Not enough data to determine state"
echo ""
echo "To test alarms, run: ./administration/test-memory-alarms.sh ${DOMAIN_NAME}"
