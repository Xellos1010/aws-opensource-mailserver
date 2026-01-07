#!/bin/bash

# Deploy script for hepefoundation.org stop-start helper stack
# This script deploys a Lambda function that stops and starts the EC2 instance daily at 3am EST

set -Eeuo pipefail
IFS=$'\n\t'

# Default values
DOMAIN_NAME="hepefoundation.org"
STACK_NAME="hepefoundation-org-stop-start-helper"
MAIL_SERVER_STACK_NAME="hepefoundation-org-mailserver"
REGION="us-east-1"
AWS_PROFILE="hepe-admin-mfa"
SCHEDULE_EXPRESSION="cron(0 8 * * ? *)"  # 3am EST = 8am UTC

echo "Deploying stop-start helper stack for ${DOMAIN_NAME}..."
echo "Stack name: ${STACK_NAME}"
echo "Mail server stack: ${MAIL_SERVER_STACK_NAME}"
echo "Schedule: ${SCHEDULE_EXPRESSION} (3am EST daily)"
echo "Region: ${REGION}"
echo "AWS Profile: ${AWS_PROFILE}"
echo "----------------------------------------"

# Deploy the CloudFormation stack
if ! aws cloudformation deploy \
    --profile "${AWS_PROFILE}" \
    --region "${REGION}" \
    --template-file stop-start-instance-helper.yaml \
    --stack-name "${STACK_NAME}" \
    --capabilities CAPABILITY_NAMED_IAM \
    --parameter-overrides \
        MailServerStackName="${MAIL_SERVER_STACK_NAME}" \
        ScheduleExpression="${SCHEDULE_EXPRESSION}" \
        Region="${REGION}"; then
    echo "Error: Stack deployment failed. Check the CloudFormation console for details."
    exit 1
fi

echo "----------------------------------------"
echo "✅ Stop-start helper stack deployed successfully!"
echo "Stack: ${STACK_NAME}"
echo "Lambda will execute daily at 3am EST (8am UTC)"

