#!/bin/bash
#
# Fix Mail Delivery and Test Email Flow
#
# This script:
# 1. Cleans up disk space
# 2. Repairs sieve scripts and mailbox indexes
# 3. Sends a test email from admin@k3frame.com to sysops@k3frame.com
#

set -e

DOMAIN="${DOMAIN:-k3frame.com}"
AWS_PROFILE="${AWS_PROFILE:-hepe-admin-mfa}"
AWS_REGION="${AWS_REGION:-us-east-1}"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🔧 Mail Delivery Fix and Test for $DOMAIN"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

cd "$(dirname "$0")/.."

echo "Step 1: Cleaning up disk space..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
AWS_PROFILE=$AWS_PROFILE AWS_REGION=$AWS_REGION DOMAIN=$DOMAIN \
  pnpm nx run cdk-k3frame-instance:admin:cleanup:disk-space || {
    echo "⚠️  Disk cleanup had warnings, continuing..."
  }
echo ""

echo "Step 2: Repairing mail delivery (sieve + mailbox resync)..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
AWS_PROFILE=$AWS_PROFILE AWS_REGION=$AWS_REGION DOMAIN=$DOMAIN \
  pnpm nx run cdk-k3frame-instance:admin:repair:mail || {
    echo "⚠️  Some repairs may have had issues, checking logs..."
  }
echo ""

echo "Step 3: Getting admin credentials..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
ADMIN_CREDS=$(AWS_PROFILE=$AWS_PROFILE AWS_REGION=$AWS_REGION DOMAIN=$DOMAIN \
  pnpm nx run cdk-k3frame-instance:admin:credentials 2>/dev/null | grep -E "Password:" | awk '{print $2}')

if [ -z "$ADMIN_CREDS" ]; then
  echo "❌ Could not retrieve admin credentials"
  echo "   Please run manually: pnpm nx run cdk-k3frame-instance:admin:credentials"
  exit 1
fi
echo "✅ Admin credentials retrieved"
echo ""

echo "Step 4: Sending test email admin@$DOMAIN -> sysops@$DOMAIN..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
AWS_PROFILE=$AWS_PROFILE AWS_REGION=$AWS_REGION DOMAIN=$DOMAIN \
  FROM_EMAIL="admin@$DOMAIN" \
  FROM_PASSWORD="$ADMIN_CREDS" \
  TO="sysops@$DOMAIN" \
  SUBJECT="Test email $(date '+%Y-%m-%d %H:%M:%S')" \
  pnpm nx run cdk-k3frame-instance:admin:mail:flow:test

echo ""
echo "Step 5: Running health gate to verify..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
AWS_PROFILE=$AWS_PROFILE AWS_REGION=$AWS_REGION DOMAIN=$DOMAIN \
  pnpm nx run cdk-k3frame-instance:admin:health-gate || {
    echo "⚠️  Health gate reported issues"
  }

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ Complete! Check sysops@$DOMAIN inbox for the test email"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
