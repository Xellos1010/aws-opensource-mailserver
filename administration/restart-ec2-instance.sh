#!/bin/bash

# Exit on error, undefined variables, and pipe failures
set -Eeuo pipefail
IFS=$'\n\t'

# Trap errors to show line numbers
trap 'echo "Error on line $LINENO: $BASH_COMMAND"' ERR

# Default domain name
DEFAULT_DOMAIN="emcnotary.com"

# Check if domain name was provided as first argument, otherwise use default
DOMAIN_NAME=${1:-$DEFAULT_DOMAIN}

# Validate domain name format
if ! [[ $DOMAIN_NAME =~ ^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$ ]]; then
    echo "Error: Invalid domain name format. Must match pattern: ^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$"
    echo "Example: example.com"
    exit 1
fi

# Create stack name from domain (remove dots, ensure it starts with a letter, and add a suffix)
STACK_NAME=$(echo "${DOMAIN_NAME}" | sed 's/\./-/g')-mailserver
REGION="us-east-1"  # Adjust if your stack is in a different region
AWS_PROFILE="hepe-admin-mfa"

echo "Restarting EC2 instance for domain: ${DOMAIN_NAME}"
echo "Stack name: ${STACK_NAME}"
echo "Region: ${REGION}"
echo "AWS Profile: ${AWS_PROFILE}"
echo "----------------------------------------"

# Function to get instance ID from stack outputs
get_instance_id() {
    local stack_outputs
    stack_outputs=$(aws cloudformation describe-stacks \
        --profile "${AWS_PROFILE}" \
        --region "${REGION}" \
        --stack-name "${STACK_NAME}" \
        --query 'Stacks[0].Outputs' \
        --output json 2>/dev/null)

    if [ $? -ne 0 ] || [ -z "$stack_outputs" ]; then
        echo "Error: Could not retrieve stack outputs for ${STACK_NAME}"
        return 1
    fi

    local instance_id
    instance_id=$(echo "$stack_outputs" | jq -r '.[] | select(.OutputKey=="RestorePrefix") | .OutputValue')

    if [ -z "$instance_id" ] || [ "$instance_id" = "null" ]; then
        echo "Error: Could not find EC2 instance ID in the stack outputs"
        return 1
    fi

    echo "$instance_id"
}

# Function to get instance state
get_instance_state() {
    local instance_id="$1"
    local state
    state=$(aws ec2 describe-instances \
        --profile "${AWS_PROFILE}" \
        --region "${REGION}" \
        --instance-ids "${instance_id}" \
        --query 'Reservations[0].Instances[0].State.Name' \
        --output text 2>/dev/null)

    echo "$state"
}

# Function to wait for instance to reach desired state
wait_for_instance_state() {
    local instance_id="$1"
    local desired_state="$2"
    local timeout=600  # 10 minutes timeout
    local count=0

    echo "Waiting for instance ${instance_id} to reach state: ${desired_state}"

    while [ $count -lt $timeout ]; do
        local current_state
        current_state=$(get_instance_state "$instance_id")

        if [ "$current_state" = "$desired_state" ]; then
            echo "Instance ${instance_id} is now in ${desired_state} state"
            return 0
        fi

        echo "Current state: ${current_state}. Waiting... ($((count/6)) minutes elapsed)"
        sleep 10
        ((count += 10))
    done

    echo "Error: Timeout waiting for instance to reach ${desired_state} state"
    return 1
}

# Function to stop instance
stop_instance() {
    local instance_id="$1"
    local current_state
    current_state=$(get_instance_state "$instance_id")

    if [ "$current_state" = "stopped" ]; then
        echo "Instance ${instance_id} is already stopped"
        return 0
    fi

    if [ "$current_state" = "stopping" ]; then
        echo "Instance ${instance_id} is already stopping. Waiting for it to stop..."
        wait_for_instance_state "$instance_id" "stopped"
        return $?
    fi

    if [ "$current_state" = "running" ]; then
        echo "Stopping instance ${instance_id}..."
        if ! aws ec2 stop-instances \
            --profile "${AWS_PROFILE}" \
            --region "${REGION}" \
            --instance-ids "${instance_id}" \
            --output table; then
            echo "Error: Failed to stop instance ${instance_id}"
            return 1
        fi

        wait_for_instance_state "$instance_id" "stopped"
        return $?
    fi

    echo "Instance ${instance_id} is in ${current_state} state. Cannot stop."
    return 1
}

# Function to start instance
start_instance() {
    local instance_id="$1"
    local current_state
    current_state=$(get_instance_state "$instance_id")

    if [ "$current_state" = "running" ]; then
        echo "Instance ${instance_id} is already running"
        return 0
    fi

    if [ "$current_state" = "pending" ]; then
        echo "Instance ${instance_id} is already starting. Waiting for it to be running..."
        wait_for_instance_state "$instance_id" "running"
        return $?
    fi

    if [ "$current_state" = "stopped" ]; then
        echo "Starting instance ${instance_id}..."
        if ! aws ec2 start-instances \
            --profile "${AWS_PROFILE}" \
            --region "${REGION}" \
            --instance-ids "${instance_id}" \
            --output table; then
            echo "Error: Failed to start instance ${instance_id}"
            return 1
        fi

        wait_for_instance_state "$instance_id" "running"
        return $?
    fi

    echo "Instance ${instance_id} is in ${current_state} state. Cannot start."
    return 1
}

# Main execution
echo "Getting instance ID from CloudFormation stack..."

INSTANCE_ID=$(get_instance_id)

if [ $? -ne 0 ] || [ -z "$INSTANCE_ID" ]; then
    echo "Error: Failed to get instance ID"
    exit 1
fi

echo "Instance ID: ${INSTANCE_ID}"

# Stop the instance
echo "----------------------------------------"
if ! stop_instance "$INSTANCE_ID"; then
    echo "Error: Failed to stop instance"
    exit 1
fi

echo "----------------------------------------"

# Start the instance
if ! start_instance "$INSTANCE_ID"; then
    echo "Error: Failed to start instance"
    exit 1
fi

echo "----------------------------------------"
echo "EC2 instance restart completed successfully!"
echo "Instance ${INSTANCE_ID} for domain ${DOMAIN_NAME} is now running."











