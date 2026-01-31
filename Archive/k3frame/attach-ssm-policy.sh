#!/usr/bin/env bash
set -Eeuo pipefail
IFS=$'\n\t'

# Attach SSM policy to instance IAM role without redeploying instance stack
# This allows SSM agent to register and work properly

DOMAIN="k3frame.com"
STACK_NAME="hepefoundation-org-mailserver"
INSTANCE_ID="i-0a1ff83f513575ed4"
REGION="us-east-1"
PROFILE="hepe-admin-mfa"
SSM_POLICY_ARN="arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo "=========================================="
echo "Attach SSM Policy to Instance IAM Role"
echo "=========================================="
echo "Domain: ${DOMAIN}"
echo "Instance: ${INSTANCE_ID}"
echo "Policy: ${SSM_POLICY_ARN}"
echo "=========================================="
echo ""

# Get instance IAM profile
echo "📋 Step 1: Getting Instance IAM Profile"
echo "----------------------------------------"
IAM_PROFILE_ARN=$(aws ec2 describe-instances \
    --profile "${PROFILE}" \
    --region "${REGION}" \
    --instance-ids "${INSTANCE_ID}" \
    --query 'Reservations[0].Instances[0].IamInstanceProfile.Arn' \
    --output text 2>/dev/null)

if [ -z "$IAM_PROFILE_ARN" ] || [ "$IAM_PROFILE_ARN" = "None" ]; then
    echo -e "${RED}✗ Instance has no IAM profile attached${NC}"
    echo "Cannot attach policy - instance needs an IAM role first"
    exit 1
fi

IAM_PROFILE_NAME=$(echo "$IAM_PROFILE_ARN" | awk -F'/' '{print $NF}')
echo "IAM Profile: ${IAM_PROFILE_NAME}"
echo ""

# Get role name from instance profile
ROLE_NAME=$(aws iam get-instance-profile \
    --profile "${PROFILE}" \
    --instance-profile-name "${IAM_PROFILE_NAME}" \
    --query 'InstanceProfile.Roles[0].RoleName' \
    --output text 2>/dev/null)

if [ -z "$ROLE_NAME" ] || [ "$ROLE_NAME" = "None" ]; then
    echo -e "${RED}✗ Could not determine IAM role name${NC}"
    exit 1
fi

echo "IAM Role: ${ROLE_NAME}"
echo ""

# Check current policies
echo "📋 Step 2: Checking Current Policies"
echo "----------------------------------------"
ATTACHED_POLICIES=$(aws iam list-attached-role-policies \
    --profile "${PROFILE}" \
    --role-name "${ROLE_NAME}" \
    --query 'AttachedPolicies[*].PolicyArn' \
    --output json 2>/dev/null || echo "[]")

HAS_SSM_POLICY=$(echo "$ATTACHED_POLICIES" | jq -r ".[] | select(. == \"${SSM_POLICY_ARN}\")" || echo "")

if [ -n "$HAS_SSM_POLICY" ]; then
    echo -e "${GREEN}✓ SSM policy already attached${NC}"
    echo ""
    echo "Current attached policies:"
    echo "$ATTACHED_POLICIES" | jq -r '.[]' | sed 's/^/  - /'
    echo ""
    echo "No action needed. The instance role already has SSM permissions."
    exit 0
fi

echo "Current attached policies:"
if [ "$ATTACHED_POLICIES" != "[]" ] && [ -n "$ATTACHED_POLICIES" ]; then
    echo "$ATTACHED_POLICIES" | jq -r '.[]' | sed 's/^/  - /'
else
    echo "  (none)"
fi
echo ""

# Attach SSM policy
echo "📋 Step 3: Attaching SSM Policy"
echo "----------------------------------------"
echo "Attaching ${SSM_POLICY_ARN} to role ${ROLE_NAME}..."

if aws iam attach-role-policy \
    --profile "${PROFILE}" \
    --role-name "${ROLE_NAME}" \
    --policy-arn "${SSM_POLICY_ARN}" 2>/dev/null; then
    echo -e "${GREEN}✓ SSM policy attached successfully${NC}"
else
    echo -e "${RED}✗ Failed to attach SSM policy${NC}"
    echo "You may need to attach it manually via AWS Console or check permissions"
    exit 1
fi
echo ""

# Verify attachment
echo "📋 Step 4: Verifying Policy Attachment"
echo "----------------------------------------"
sleep 2
VERIFY_POLICIES=$(aws iam list-attached-role-policies \
    --profile "${PROFILE}" \
    --role-name "${ROLE_NAME}" \
    --query 'AttachedPolicies[*].PolicyArn' \
    --output json 2>/dev/null || echo "[]")

VERIFY_HAS_SSM=$(echo "$VERIFY_POLICIES" | jq -r ".[] | select(. == \"${SSM_POLICY_ARN}\")" || echo "")

if [ -n "$VERIFY_HAS_SSM" ]; then
    echo -e "${GREEN}✓ Policy attachment verified${NC}"
    echo ""
    echo "Updated attached policies:"
    echo "$VERIFY_POLICIES" | jq -r '.[]' | sed 's/^/  - /'
else
    echo -e "${YELLOW}⚠ Policy attachment verification failed${NC}"
    echo "The policy may still be attaching. Check again in a moment."
fi
echo ""

echo "=========================================="
echo "Summary"
echo "=========================================="
echo "IAM Role: ${ROLE_NAME}"
echo "SSM Policy: ${SSM_POLICY_ARN}"
echo "Status: ${GREEN}Attached${NC}"
echo ""
echo "Next steps:"
echo "  1. Restart SSM agent on the instance to pick up new IAM permissions"
echo "  2. Run fix-ssm-agent.sh to install/configure SSM agent if not already done"
echo "  3. Wait 1-2 minutes for SSM agent to register"
echo "  4. Test SSM access:"
echo "     aws ssm send-command --instance-ids ${INSTANCE_ID} --document-name AWS-RunShellScript --parameters 'commands=[\"echo test\"]' --profile ${PROFILE} --region ${REGION}"
echo ""









