#!/usr/bin/env bash
set -Eeuo pipefail
IFS=$'\n\t'

# Deploy external health monitoring for hepefoundation.org
# This adds Route 53 health checks and proactive Lambda health checks

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
STACK_NAME="hepefoundation-org-external-monitoring"
REGION="us-east-1"
PROFILE="hepe-admin-mfa"

# Instance configuration
DOMAIN_NAME="hepefoundation.org"
BOX_HOSTNAME="box.hepefoundation.org"
INSTANCE_ID="i-0a1ff83f513575ed4"

# Get emergency restart Lambda ARN from existing stack
EMERGENCY_LAMBDA_ARN=$(aws cloudformation describe-stacks \
    --profile "${PROFILE}" \
    --region "${REGION}" \
    --stack-name "hepefoundation-org-emergency-alarms" \
    --query 'Stacks[0].Outputs[?OutputKey==`MailRecoveryOrchestratorLambdaArn`].OutputValue' \
    --output text 2>/dev/null || echo "")

# Fallback to direct Lambda lookup if stack output not found
if [ -z "${EMERGENCY_LAMBDA_ARN}" ] || [ "${EMERGENCY_LAMBDA_ARN}" = "None" ]; then
    EMERGENCY_LAMBDA_ARN=$(aws lambda get-function \
        --profile "${PROFILE}" \
        --region "${REGION}" \
        --function-name "mail-recovery-orchestrator-hepefoundation-org-emergency-alarms" \
        --query 'Configuration.FunctionArn' \
        --output text 2>/dev/null || echo "")
fi

# Get SNS topic ARN (optional)
ALERT_TOPIC_ARN=$(aws cloudformation describe-stacks \
    --profile "${PROFILE}" \
    --region "${REGION}" \
    --stack-name "hepefoundation-org-mailserver" \
    --query 'Stacks[0].Outputs[?OutputKey==`AlarmsTopicArn`].OutputValue' \
    --output text 2>/dev/null || echo "")

echo "=========================================="
echo "External Health Monitoring Deployment"
echo "=========================================="
echo "Stack Name: ${STACK_NAME}"
echo "Domain: ${DOMAIN_NAME}"
echo "Box Hostname: ${BOX_HOSTNAME}"
echo "Instance ID: ${INSTANCE_ID}"
echo "Emergency Lambda: ${EMERGENCY_LAMBDA_ARN:-NOT FOUND}"
echo "Alert Topic: ${ALERT_TOPIC_ARN:-NOT FOUND}"
echo "=========================================="

if [ -z "${EMERGENCY_LAMBDA_ARN}" ] || [ "${EMERGENCY_LAMBDA_ARN}" = "None" ]; then
    echo "ERROR: Could not find emergency restart Lambda ARN"
    echo "Please ensure the emergency-alarms stack is deployed first."
    exit 1
fi

# Deploy the stack
echo ""
echo "Deploying CloudFormation stack..."

aws cloudformation deploy \
    --profile "${PROFILE}" \
    --region "${REGION}" \
    --stack-name "${STACK_NAME}" \
    --template-file "${SCRIPT_DIR}/external-health-monitoring.yaml" \
    --parameter-overrides \
        DomainName="${DOMAIN_NAME}" \
        BoxHostname="${BOX_HOSTNAME}" \
        InstanceId="${INSTANCE_ID}" \
        EmergencyRestartLambdaArn="${EMERGENCY_LAMBDA_ARN}" \
        AlertTopicArn="${ALERT_TOPIC_ARN:-}" \
        HealthCheckIntervalSeconds=30 \
    --capabilities CAPABILITY_NAMED_IAM \
    --tags \
        app=mailserver \
        env=production \
        owner=hepe \
        domain="${DOMAIN_NAME}"

echo ""
echo "✅ Stack deployed successfully!"
echo ""

# Display outputs
echo "Stack Outputs:"
aws cloudformation describe-stacks \
    --profile "${PROFILE}" \
    --region "${REGION}" \
    --stack-name "${STACK_NAME}" \
    --query 'Stacks[0].Outputs[*].[OutputKey, OutputValue]' \
    --output table

echo ""
echo "=========================================="
echo "What's Now Monitoring:"
echo "=========================================="
echo "1. Route 53 HTTPS Health Check"
echo "   - Checks https://${BOX_HOSTNAME}/ every 30 seconds"
echo "   - Runs from multiple AWS regions globally"
echo "   - Triggers emergency restart after 3 minutes of failure"
echo ""
echo "2. Proactive Health Check Lambda"
echo "   - Runs every 5 minutes"
echo "   - Checks: EC2 status, SSM connectivity, HTTPS"
echo "   - Detects zombie instances (EC2 OK but services down)"
echo "   - Triggers emergency restart on detection"
echo ""
echo "3. Custom CloudWatch Metrics"
echo "   - MailServer/ProactiveHealthCheck/SSMConnectivityHealthy"
echo "   - MailServer/ProactiveHealthCheck/HTTPSHealthy"
echo "   - MailServer/ProactiveHealthCheck/OverallHealthy"
echo "=========================================="




