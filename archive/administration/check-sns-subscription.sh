#!/usr/bin/env bash
set -Eeuo pipefail

# Check SNS Subscription Status Script
# Shows the current SNS subscription status for email alerts

# Default domain name
DEFAULT_DOMAIN="askdaokapra.com"

# Check if domain name was provided as first argument, otherwise use default
DOMAIN_NAME=${1:-$DEFAULT_DOMAIN}

# Create stack name from domain
STACK_NAME=$(echo "${DOMAIN_NAME}" | sed 's/\./-/g')-mailserver
REGION="us-east-1"

echo "Checking SNS subscription status for domain: ${DOMAIN_NAME}"
echo "Stack name: ${STACK_NAME}"
echo "Region: ${REGION}"
echo "----------------------------------------"

# Get the SNS topic ARN from stack outputs
SNS_TOPIC_ARN=$(aws cloudformation describe-stacks \
    --profile hepe-admin-mfa \
    --region "${REGION}" \
    --stack-name "${STACK_NAME}" \
    --query 'Stacks[0].Outputs[?OutputKey==`AlertTopicArn`].OutputValue' \
    --output text 2>/dev/null)

if [ -z "$SNS_TOPIC_ARN" ]; then
    echo "Error: Could not retrieve SNS topic ARN from stack outputs"
    exit 1
fi

echo "SNS Topic ARN: ${SNS_TOPIC_ARN}"
echo ""

# Get subscription details
echo "SNS Subscriptions:"
aws sns list-subscriptions-by-topic \
    --profile hepe-admin-mfa \
    --region "${REGION}" \
    --topic-arn "${SNS_TOPIC_ARN}" \
    --query 'Subscriptions[].{Protocol:Protocol,Endpoint:Endpoint,SubscriptionArn:SubscriptionArn,ConfirmationWasAuthenticated:ConfirmationWasAuthenticated}' \
    --output table

echo ""
echo "To confirm a pending subscription, check the email and click the confirmation link."
echo "To resend confirmation, use:"
echo "aws sns confirm-subscription --profile hepe-admin-mfa --region ${REGION} --topic-arn ${SNS_TOPIC_ARN} --token <confirmation-token>"
