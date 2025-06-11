#!/bin/bash

# Deploy the CloudFormation stack for emcnotary infrastructure
aws cloudformation deploy \
    --profile hepe-admin-mfa \
    --template-file mailserver-infrastructure-mvp.yaml \
    --stack-name emcnotary-infrastructure-test \
    --parameter-overrides DomainName=emcnotary.com 