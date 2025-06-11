#!/bin/bash

# Get the domain name from the stack parameters
DOMAIN_NAME=$(aws cloudformation describe-stacks \
    --profile hepe-admin-mfa \
    --stack-name emcnotary-infrastructure-test \
    --query 'Stacks[0].Parameters[?ParameterKey==`DomainName`].ParameterValue' \
    --output text)

# Empty the backup bucket
echo "Emptying backup bucket: ${DOMAIN_NAME}-backup"
aws s3 rm "s3://${DOMAIN_NAME}-backup" \
    --profile hepe-admin-mfa \
    --recursive

# Empty the nextcloud bucket
echo "Emptying nextcloud bucket: ${DOMAIN_NAME}-nextcloud"
aws s3 rm "s3://${DOMAIN_NAME}-nextcloud" \
    --profile hepe-admin-mfa \
    --recursive

# Delete the CloudFormation stack
echo "Initiating stack deletion..."
aws cloudformation delete-stack \
    --profile hepe-admin-mfa \
    --stack-name emcnotary-infrastructure-test

echo "Stack deletion initiated. You can monitor the deletion progress using the describe-stack.sh script." 