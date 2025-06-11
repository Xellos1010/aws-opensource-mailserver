#!/bin/bash

echo "Describing stack resources..."
aws cloudformation describe-stacks --profile hepe-admin-mfa --stack-name emcnotary-infrastructure-test --output json

echo -e "\nDescribing stack events..."
aws cloudformation describe-stack-events --profile hepe-admin-mfa --stack-name emcnotary-infrastructure-test --output json