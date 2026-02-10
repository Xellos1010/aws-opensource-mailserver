#!/bin/bash
set -Eeuo pipefail
IFS=$'\n\t'

# Deploy k3frame core stack with custom S3 bucket names
# This allows deployment when buckets with default names already exist in another account
#
# Usage:
#   ./tools/deploy-k3frame-core-with-custom-buckets.sh [backup-bucket-name] [nextcloud-bucket-name]
#
# Example:
#   ./tools/deploy-k3frame-core-with-custom-buckets.sh k3frame-com-backup-v2 k3frame-com-nextcloud-v2

BACKUP_BUCKET_NAME="${1:-k3frame-com-backup-v2}"
NEXTCLOUD_BUCKET_NAME="${2:-k3frame-com-nextcloud-v2}"

echo "🚀 Deploying k3frame core stack with custom bucket names"
echo "════════════════════════════════════════════════════════"
echo "Backup Bucket:    ${BACKUP_BUCKET_NAME}"
echo "Nextcloud Bucket: ${NEXTCLOUD_BUCKET_NAME}"
echo "════════════════════════════════════════════════════════"
echo ""

# Verify buckets don't already exist in this account
echo "🔍 Checking if buckets already exist in this account..."
if AWS_PROFILE="${AWS_PROFILE:-k3frame}" AWS_REGION="${AWS_REGION:-us-east-1}" \
   aws s3api head-bucket --bucket "${BACKUP_BUCKET_NAME}" 2>/dev/null; then
  echo "❌ Error: Backup bucket '${BACKUP_BUCKET_NAME}' already exists in this account"
  exit 1
fi

if AWS_PROFILE="${AWS_PROFILE:-k3frame}" AWS_REGION="${AWS_REGION:-us-east-1}" \
   aws s3api head-bucket --bucket "${NEXTCLOUD_BUCKET_NAME}" 2>/dev/null; then
  echo "❌ Error: Nextcloud bucket '${NEXTCLOUD_BUCKET_NAME}' already exists in this account"
  exit 1
fi

echo "✅ Bucket names are available"
echo ""

# Deploy with custom bucket names
echo "📦 Deploying stack..."
AWS_PROFILE="${AWS_PROFILE:-k3frame}" \
AWS_REGION="${AWS_REGION:-us-east-1}" \
FEATURE_CDK_K3FRAME_STACKS_ENABLED=1 \
DOMAIN=k3frame.com \
pnpm nx run cdk-k3frame-core:deploy \
  --context backupBucketName="${BACKUP_BUCKET_NAME}" \
  --context nextcloudBucketName="${NEXTCLOUD_BUCKET_NAME}"

echo ""
echo "✅ Deployment complete!"
echo ""
echo "📝 Note: The bucket names are stored in SSM parameters and will be used by"
echo "   other stacks (instance stack) automatically. No additional configuration needed."




