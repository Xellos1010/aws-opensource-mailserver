#!/usr/bin/env bash
set -Eeuo pipefail

# Test SNS Alert Script
# Sends a test message to the SNS topic to verify email delivery

# Default domain name
DEFAULT_DOMAIN="askdaokapra.com"

# Check if domain name was provided as first argument, otherwise use default
DOMAIN_NAME=${1:-$DEFAULT_DOMAIN}

# Create stack name from domain
STACK_NAME=$(echo "${DOMAIN_NAME}" | sed 's/\./-/g')-mailserver
REGION="us-east-1"

echo "Testing SNS alert for domain: ${DOMAIN_NAME}"
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
    echo "Make sure the stack is deployed and the AlertTopic resource exists"
    exit 1
fi

echo "SNS Topic ARN: ${SNS_TOPIC_ARN}"

# Create test message
TEST_MESSAGE="Test Alert from ${STACK_NAME}

This is a test message to verify that SNS email notifications are working correctly.

Alert Details:
- Stack: ${STACK_NAME}
- Domain: ${DOMAIN_NAME}
- Time: $(date)
- Test Type: Manual verification

If you receive this email, the monitoring system is properly configured and ready to send real alerts.

This test was sent from the test-sns-alert.sh script."

# Send test message to SNS topic
echo "Sending test message to SNS topic..."
aws sns publish \
    --profile hepe-admin-mfa \
    --region "${REGION}" \
    --topic-arn "${SNS_TOPIC_ARN}" \
    --subject "Test Alert - ${STACK_NAME} Monitoring System" \
    --message "${TEST_MESSAGE}"

if [ $? -eq 0 ]; then
    echo "✅ Test message sent successfully!"
    echo "Check the email address: admin@${DOMAIN_NAME}"
    echo "If you don't receive the email within 5 minutes, check:"
    echo "1. Spam/junk folder"
    echo "2. SNS subscription status in AWS Console"
    echo "3. Email address is correctly configured"
else
    echo "❌ Failed to send test message"
    exit 1
fi
