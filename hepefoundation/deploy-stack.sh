#!/bin/bash

# Deploy script for hepefoundation.org with existing S3 buckets
# This script handles the existing S3 buckets for hepefoundation

set -e

# Configuration
DOMAIN_NAME="hepefoundation.org"
STACK_NAME="hepefoundation-org-mailserver"
EXISTING_BACKUP_BUCKET="hepefoundation-aws-opensource-mailserver-backup"
EXISTING_NEXTCLOUD_BUCKET="hepefoundation-aws-opensource-mailserver-nextcloud"

echo "Deploying mailserver infrastructure for ${DOMAIN_NAME}..."
echo "Stack name: ${STACK_NAME}"
echo "Using existing backup bucket: ${EXISTING_BACKUP_BUCKET}"
echo "Using existing NextCloud bucket: ${EXISTING_NEXTCLOUD_BUCKET}"

# Validate domain name format
if ! [[ $DOMAIN_NAME =~ ^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$ ]]; then
    echo "Error: Invalid domain name format. Must match pattern: ^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$"
    echo "Example: example.com"
    exit 1
fi

# Check if stack exists and its status
STACK_STATUS=$(aws cloudformation describe-stacks \
    --profile hepe-admin-mfa \
    --stack-name "${STACK_NAME}" \
    --query 'Stacks[0].StackStatus' \
    --output text 2>/dev/null || echo "STACK_NOT_FOUND")

if [ "$STACK_STATUS" = "DELETE_IN_PROGRESS" ]; then
    echo "Error: Stack ${STACK_NAME} is currently being deleted. Please wait for deletion to complete before deploying again."
    exit 1
elif [ "$STACK_STATUS" = "STACK_NOT_FOUND" ]; then
    echo "Stack ${STACK_NAME} does not exist. Proceeding with deployment..."
else
    echo "Stack ${STACK_NAME} exists with status: ${STACK_STATUS}"
fi

# Check if the existing S3 buckets exist
echo "Verifying existing S3 buckets..."
if ! aws s3api head-bucket --bucket "${EXISTING_BACKUP_BUCKET}" --profile hepe-admin-mfa 2>/dev/null; then
    echo "Error: Backup bucket ${EXISTING_BACKUP_BUCKET} does not exist or is not accessible."
    echo "Please ensure the bucket exists and you have proper permissions."
    exit 1
fi

if ! aws s3api head-bucket --bucket "${EXISTING_NEXTCLOUD_BUCKET}" --profile hepe-admin-mfa 2>/dev/null; then
    echo "Error: NextCloud bucket ${EXISTING_NEXTCLOUD_BUCKET} does not exist or is not accessible."
    echo "Please ensure the bucket exists and you have proper permissions."
    exit 1
fi

echo "✓ Both S3 buckets verified successfully"

# Since the current template creates buckets with ${DomainName}-backup and ${DomainName}-nextcloud,
# we need to use a modified template or override the bucket creation.
# For now, we'll warn the user about this limitation.
echo ""
echo "⚠️  WARNING: The current CloudFormation template expects bucket names:"
echo "   - ${DOMAIN_NAME}-backup"
echo "   - ${DOMAIN_NAME}-nextcloud"
echo ""
echo "But you have existing buckets:"
echo "   - ${EXISTING_BACKUP_BUCKET}"
echo "   - ${EXISTING_NEXTCLOUD_BUCKET}"
echo ""
echo "You may need to:"
echo "1. Rename your existing buckets to match the expected names, OR"
echo "2. Modify the CloudFormation template to accept custom bucket names, OR"
echo "3. Create symbolic links or bucket policies to redirect to your existing buckets"
echo ""
read -p "Continue with deployment using standard bucket names? (y/N): " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Deployment cancelled."
    exit 1
fi

# Deploy the CloudFormation stack
echo "Deploying CloudFormation stack..."
if ! aws cloudformation deploy \
    --profile hepe-admin-mfa \
    --template-file mailserver-infrastructure-mvp.yaml \
    --stack-name "${STACK_NAME}" \
    --capabilities CAPABILITY_NAMED_IAM \
    --parameter-overrides DomainName="${DOMAIN_NAME}"; then
    echo "Error: Stack deployment failed. Check the CloudFormation console for details."
    exit 1
fi

echo "Stack deployment initiated with name: ${STACK_NAME}"
echo ""
echo "⚠️  POST-DEPLOYMENT STEPS REQUIRED:"
echo "1. You'll need to manually configure the EC2 instance to use your existing S3 buckets"
echo "2. Update the backup configuration to point to: ${EXISTING_BACKUP_BUCKET}"
echo "3. Update the NextCloud configuration to point to: ${EXISTING_NEXTCLOUD_BUCKET}"
echo ""
echo "You can monitor the deployment progress using: ./describe-stack.sh" 