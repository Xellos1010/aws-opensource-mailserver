#!/bin/bash

# Delete the CloudFormation stack
aws cloudformation delete-stack \
    --profile hepe-admin-mfa \
    --stack-name emcnotary-infrastructure-test

echo "Stack deletion initiated. You can monitor the deletion progress using the describe-stack.sh script." 