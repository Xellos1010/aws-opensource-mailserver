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

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

# Configuration
MEMORY_THRESHOLD_PERCENT=85  # Stop instance if memory usage is above this percentage
MAX_RETRIES=3
RETRY_DELAY=30  # seconds between retries

echo "=========================================="
echo "Memory Check and Instance Stop Script"
echo "=========================================="
echo "Domain: ${DOMAIN_NAME}"
echo "Stack: ${STACK_NAME}"
echo "Region: ${REGION}"
echo "Memory Threshold: ${MEMORY_THRESHOLD_PERCENT}%"
echo "Max Retries: ${MAX_RETRIES}"
echo "=========================================="

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
        log_error "Could not retrieve stack outputs for ${STACK_NAME}"
        return 1
    fi

    local instance_id
    instance_id=$(echo "$stack_outputs" | jq -r '.[] | select(.OutputKey=="RestorePrefix") | .OutputValue')

    if [ -z "$instance_id" ] || [ "$instance_id" = "null" ]; then
        log_error "Could not find EC2 instance ID in the stack outputs"
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

# Function to check memory usage via CloudWatch
check_memory_usage() {
    local instance_id="$1"
    local memory_percent

    # Get the latest memory utilization metric
    memory_percent=$(aws cloudwatch get-metric-statistics \
        --profile "${AWS_PROFILE}" \
        --region "${REGION}" \
        --namespace CWAgent \
        --metric-name mem_used_percent \
        --dimensions Name=InstanceId,Value="${instance_id}" \
        --start-time $(date -u -d '5 minutes ago' +%Y-%m-%dT%H:%M:%S) \
        --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
        --period 300 \
        --statistics Average \
        --query 'Datapoints[0].Average' \
        --output text 2>/dev/null)

    # If we can't get CPU data, check memory alarm state instead
    if [ -z "$memory_percent" ] || [ "$memory_percent" = "None" ]; then
        log_warn "Could not get CPU metrics, checking memory alarm state..."

        local alarm_state
        alarm_state=$(aws cloudwatch describe-alarms \
            --profile "${AWS_PROFILE}" \
            --region "${REGION}" \
            --alarm-names "MemHigh-${instance_id}" \
            --query 'MetricAlarms[0].StateValue' \
            --output text 2>/dev/null)

        if [ "$alarm_state" = "ALARM" ]; then
            log_warn "Memory alarm is in ALARM state - high memory usage detected"
            return 0  # Return 0 to indicate memory issue
        else
            log_info "Memory alarm state: ${alarm_state:-UNKNOWN}"
            return 1  # No memory issue detected
        fi
    fi

    # Convert to percentage and compare
    memory_percent=$(printf "%.0f" "$memory_percent" 2>/dev/null || echo "0")

    log_info "Current memory utilization: ${memory_percent}%"

    if [ "$memory_percent" -gt "$MEMORY_THRESHOLD_PERCENT" ]; then
        log_warn "Memory usage (${memory_percent}%) exceeds threshold (${MEMORY_THRESHOLD_PERCENT}%)"
        return 0  # Return 0 to indicate memory issue
    else
        log_info "Memory usage (${memory_percent}%) is within normal range"
        return 1  # No memory issue detected
    fi
}

# Function to wait for instance to reach desired state
wait_for_instance_state() {
    local instance_id="$1"
    local desired_state="$2"
    local timeout=600  # 10 minutes timeout
    local count=0

    log_info "Waiting for instance ${instance_id} to reach state: ${desired_state}"

    while [ $count -lt $timeout ]; do
        local current_state
        current_state=$(get_instance_state "$instance_id")

        if [ "$current_state" = "$desired_state" ]; then
            log_success "Instance ${instance_id} is now in ${desired_state} state"
            return 0
        fi

        echo "  Current state: ${current_state}. Waiting... ($((count/6)) minutes elapsed)"
        sleep 10
        ((count += 10))
    done

    log_error "Timeout waiting for instance to reach ${desired_state} state"
    return 1
}

# Function to stop instance with retries
stop_instance_with_retries() {
    local instance_id="$1"
    local attempt=1

    while [ $attempt -le $MAX_RETRIES ]; do
        log_info "Stop attempt ${attempt}/${MAX_RETRIES}"

        local current_state
        current_state=$(get_instance_state "$instance_id")

        case "$current_state" in
            "stopped")
                log_info "Instance ${instance_id} is already stopped"
                return 0
                ;;
            "stopping")
                log_info "Instance ${instance_id} is already stopping. Waiting for it to stop..."
                if wait_for_instance_state "$instance_id" "stopped"; then
                    return 0
                fi
                ;;
            "running"|"pending")
                log_info "Stopping instance ${instance_id}..."
                if aws ec2 stop-instances \
                    --profile "${AWS_PROFILE}" \
                    --region "${REGION}" \
                    --instance-ids "${instance_id}" \
                    --output table >/dev/null 2>&1; then

                    if wait_for_instance_state "$instance_id" "stopped"; then
                        log_success "Instance stopped successfully on attempt ${attempt}"
                        return 0
                    fi
                else
                    log_error "Failed to initiate stop command on attempt ${attempt}"
                fi
                ;;
            *)
                log_warn "Instance ${instance_id} is in ${current_state} state. Cannot stop."
                return 1
                ;;
        esac

        if [ $attempt -lt $MAX_RETRIES ]; then
            log_warn "Retrying in ${RETRY_DELAY} seconds..."
            sleep $RETRY_DELAY
        fi

        ((attempt++))
    done

    log_error "Failed to stop instance after ${MAX_RETRIES} attempts"
    return 1
}

# Main execution
main() {
    # Check prerequisites
    if ! command -v aws &> /dev/null; then
        log_error "AWS CLI is not installed"
        exit 1
    fi

    if ! command -v jq &> /dev/null; then
        log_error "jq is not installed"
        exit 1
    fi

    # Get instance ID
    log_info "Getting instance information..."
    INSTANCE_ID=$(get_instance_id)

    if [ $? -ne 0 ] || [ -z "$INSTANCE_ID" ]; then
        log_error "Failed to get instance ID"
        exit 1
    fi

    log_success "Found instance: ${INSTANCE_ID}"

    # Check memory usage
    log_info "Checking memory usage..."
    if ! check_memory_usage "$INSTANCE_ID"; then
        log_info "Memory usage is normal. No action needed."
        echo ""
        echo "=========================================="
        echo "Memory Check Complete"
        echo "=========================================="
        echo "✅ Memory usage is within normal range"
        echo "✅ Instance does not need to be stopped"
        echo "=========================================="
        exit 0
    fi

    log_warn "High memory usage detected. Proceeding with instance stop..."

    # Stop the instance with retries
    if stop_instance_with_retries "$INSTANCE_ID"; then
        log_success "Instance stopped successfully"

        echo ""
        echo "=========================================="
        echo "Instance Stop Complete"
        echo "=========================================="
        echo "✅ Instance ${INSTANCE_ID} is now stopped"
        echo "✅ Memory pressure relieved"
        echo ""
        echo "Next step: Run start-instance-and-wait.sh to restart the instance"
        echo "  ./administration/start-instance-and-wait.sh ${DOMAIN_NAME}"
        echo "=========================================="
        exit 0
    else
        log_error "Failed to stop instance after ${MAX_RETRIES} attempts"

        echo ""
        echo "=========================================="
        echo "Instance Stop Failed"
        echo "=========================================="
        echo "❌ Failed to stop instance ${INSTANCE_ID}"
        echo "❌ Manual intervention may be required"
        echo ""
        echo "Troubleshooting:"
        echo "1. Check AWS console for instance state"
        echo "2. Verify AWS permissions"
        echo "3. Check if instance is stuck in stopping state"
        echo "=========================================="
        exit 1
    fi
}

# Run main function
main "$@"
