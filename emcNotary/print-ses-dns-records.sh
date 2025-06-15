#!/bin/bash

# Exit on error
set -e

# Default domain name
DEFAULT_DOMAIN="emcnotary.com"

# Check if domain name was provided as first argument, otherwise use default
DOMAIN_NAME=${1:-$DEFAULT_DOMAIN}

# Create stack name from domain
STACK_NAME=$(echo "${DOMAIN_NAME}" | sed 's/\./-/g')-mailserver
REGION="us-east-1"  # Adjust if your stack is in a different region

echo "Retrieving SES DNS records for domain: ${DOMAIN_NAME}"
echo "Stack name: ${STACK_NAME}"
echo "Region: ${REGION}"
echo "----------------------------------------"

# Get stack outputs
STACK_OUTPUTS=$(aws cloudformation describe-stacks \
    --profile hepe-admin-mfa \
    --region "${REGION}" \
    --stack-name "${STACK_NAME}" \
    --query 'Stacks[0].Outputs' \
    --output json)

if [ -z "$STACK_OUTPUTS" ]; then
    echo "Error: Could not retrieve stack outputs for ${STACK_NAME}"
    exit 1
fi

# Extract SES DNS records from outputs
DKIM_TOKEN_NAME_1=$(echo "$STACK_OUTPUTS" | jq -r '.[] | select(.OutputKey=="DkimDNSTokenName1") | .OutputValue')
DKIM_TOKEN_VALUE_1=$(echo "$STACK_OUTPUTS" | jq -r '.[] | select(.OutputKey=="DkimDNSTokenValue1") | .OutputValue')
DKIM_TOKEN_NAME_2=$(echo "$STACK_OUTPUTS" | jq -r '.[] | select(.OutputKey=="DkimDNSTokenName2") | .OutputValue')
DKIM_TOKEN_VALUE_2=$(echo "$STACK_OUTPUTS" | jq -r '.[] | select(.OutputKey=="DkimDNSTokenValue2") | .OutputValue')
DKIM_TOKEN_NAME_3=$(echo "$STACK_OUTPUTS" | jq -r '.[] | select(.OutputKey=="DkimDNSTokenName3") | .OutputValue')
DKIM_TOKEN_VALUE_3=$(echo "$STACK_OUTPUTS" | jq -r '.[] | select(.OutputKey=="DkimDNSTokenValue3") | .OutputValue')
MAIL_FROM_DOMAIN=$(echo "$STACK_OUTPUTS" | jq -r '.[] | select(.OutputKey=="MailFromDomain") | .OutputValue')
MAIL_FROM_MX=$(echo "$STACK_OUTPUTS" | jq -r '.[] | select(.OutputKey=="MailFromMXRecord") | .OutputValue')
MAIL_FROM_TXT=$(echo "$STACK_OUTPUTS" | jq -r '.[] | select(.OutputKey=="MailFromTXTRecord") | .OutputValue')

# Validate required outputs
if [ -z "$DKIM_TOKEN_NAME_1" ] || [ -z "$DKIM_TOKEN_VALUE_1" ] || \
   [ -z "$DKIM_TOKEN_NAME_2" ] || [ -z "$DKIM_TOKEN_VALUE_2" ] || \
   [ -z "$DKIM_TOKEN_NAME_3" ] || [ -z "$DKIM_TOKEN_VALUE_3" ] || \
   [ -z "$MAIL_FROM_DOMAIN" ] || [ -z "$MAIL_FROM_MX" ] || [ -z "$MAIL_FROM_TXT" ]; then
    echo "Error: Missing required SES DNS record outputs from stack"
    exit 1
fi

echo "SES DNS Records to Add:"
echo "----------------------------------------"
echo "DKIM Records (CNAME):"
echo "1. Name: ${DKIM_TOKEN_NAME_1}"
echo "   Value: ${DKIM_TOKEN_VALUE_1}"
echo
echo "2. Name: ${DKIM_TOKEN_NAME_2}"
echo "   Value: ${DKIM_TOKEN_VALUE_2}"
echo
echo "3. Name: ${DKIM_TOKEN_NAME_3}"
echo "   Value: ${DKIM_TOKEN_VALUE_3}"
echo
echo "----------------------------------------"
echo "MAIL FROM Records:"
echo "MX Record:"
echo "Name: ${MAIL_FROM_DOMAIN}"
echo "Value: ${MAIL_FROM_MX}"
echo
echo "TXT Record (SPF):"
echo "Name: ${MAIL_FROM_DOMAIN}"
echo "Value: ${MAIL_FROM_TXT}"
echo
echo "----------------------------------------"
echo "Verification Commands:"
echo "To verify DKIM records:"
echo "dig ${DKIM_TOKEN_NAME_1} CNAME"
echo "dig ${DKIM_TOKEN_NAME_2} CNAME"
echo "dig ${DKIM_TOKEN_NAME_3} CNAME"
echo
echo "To verify MAIL FROM records:"
echo "dig ${MAIL_FROM_DOMAIN} MX"
echo "dig ${MAIL_FROM_DOMAIN} TXT"
echo
echo "----------------------------------------"
echo "Note: Allow time for DNS propagation after adding these records."
echo "You can verify the SES identity status in the AWS SES Console." 