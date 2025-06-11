#!/bin/bash

# Create logs directory if it doesn't exist
mkdir -p logs

# Get current timestamp
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")

# Log stack resources
echo "Describing stack resources..."
aws cloudformation describe-stacks \
    --profile hepe-admin-mfa \
    --stack-name emcnotary-infrastructure-test \
    --output json > "logs/stack_resources_${TIMESTAMP}.json"

echo "Stack resources logged to logs/stack_resources_${TIMESTAMP}.json"

# Log stack events
echo -e "\nDescribing stack events..."
aws cloudformation describe-stack-events \
    --profile hepe-admin-mfa \
    --stack-name emcnotary-infrastructure-test \
    --output json > "logs/stack_events_${TIMESTAMP}.json"

echo "Stack events logged to logs/stack_events_${TIMESTAMP}.json"

# Also display the latest events in the terminal
echo -e "\nLatest stack events:"
aws cloudformation describe-stack-events \
    --profile hepe-admin-mfa \
    --stack-name emcnotary-infrastructure-test \
    --query 'StackEvents[0:5]' \
    --output table