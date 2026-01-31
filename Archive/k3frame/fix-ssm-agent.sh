#!/usr/bin/env bash
set -Eeuo pipefail
IFS=$'\n\t'

# Fix SSM agent on k3frame.com instance without redeploying the instance stack
# This script installs/configures SSM agent via SSH and verifies IAM role

DOMAIN="k3frame.com"
STACK_NAME="hepefoundation-org-mailserver"
INSTANCE_ID="i-0a1ff83f513575ed4"
REGION="us-east-1"
PROFILE="hepe-admin-mfa"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

echo "=========================================="
echo "SSM Agent Fix Script"
echo "=========================================="
echo "Domain: ${DOMAIN}"
echo "Instance: ${INSTANCE_ID}"
echo "Region: ${REGION}"
echo "=========================================="
echo ""

# Get instance information
echo "📋 Step 1: Getting Instance Information"
echo "----------------------------------------"
INSTANCE_INFO=$(aws ec2 describe-instances \
    --profile "${PROFILE}" \
    --region "${REGION}" \
    --instance-ids "${INSTANCE_ID}" \
    --query 'Reservations[0].Instances[0]' \
    --output json)

INSTANCE_STATE=$(echo "$INSTANCE_INFO" | jq -r '.State.Name')
INSTANCE_IP=$(echo "$INSTANCE_INFO" | jq -r '.PublicIpAddress // .PrivateIpAddress')
IAM_PROFILE=$(echo "$INSTANCE_INFO" | jq -r '.IamInstanceProfile.Arn // "None"')
KEY_NAME=$(echo "$INSTANCE_INFO" | jq -r '.KeyName // "None"')

echo "Instance State: ${INSTANCE_STATE}"
echo "Instance IP: ${INSTANCE_IP}"
echo "IAM Profile: ${IAM_PROFILE}"
echo "Key Name: ${KEY_NAME}"

if [ "$INSTANCE_STATE" != "running" ]; then
    echo -e "${RED}✗ Instance is not running (state: ${INSTANCE_STATE})${NC}"
    echo "Please start the instance first"
    exit 1
fi

if [ "$INSTANCE_IP" = "null" ] || [ -z "$INSTANCE_IP" ]; then
    echo -e "${RED}✗ Could not determine instance IP${NC}"
    exit 1
fi

echo -e "${GREEN}✓ Instance is running${NC}"
echo ""

# Check IAM role
echo "📋 Step 2: Checking IAM Role Configuration"
echo "----------------------------------------"
if [ "$IAM_PROFILE" != "None" ] && [ -n "$IAM_PROFILE" ]; then
    ROLE_NAME=$(echo "$IAM_PROFILE" | awk -F'/' '{print $NF}')
    echo "IAM Role: ${ROLE_NAME}"
    
    # Check if role has SSM permissions
    ROLE_POLICIES=$(aws iam list-attached-role-policies \
        --profile "${PROFILE}" \
        --role-name "${ROLE_NAME}" \
        --query 'AttachedPolicies[*].PolicyArn' \
        --output json 2>/dev/null || echo "[]")
    
    HAS_SSM_POLICY=$(echo "$ROLE_POLICIES" | jq -r '.[] | select(contains("AmazonSSMManagedInstanceCore"))' || echo "")
    
    if [ -n "$HAS_SSM_POLICY" ]; then
        echo -e "${GREEN}✓ IAM role has AmazonSSMManagedInstanceCore policy${NC}"
    else
        echo -e "${YELLOW}⚠ IAM role may not have SSM permissions${NC}"
        echo "  Role: ${ROLE_NAME}"
        echo "  Attached policies:"
        echo "$ROLE_POLICIES" | jq -r '.[]' | sed 's/^/    - /'
        echo ""
        echo "  To fix, attach policy: AmazonSSMManagedInstanceCore"
        echo "  Command:"
        echo "    aws iam attach-role-policy \\"
        echo "      --role-name ${ROLE_NAME} \\"
        echo "      --policy-arn arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore \\"
        echo "      --profile ${PROFILE}"
    fi
else
    echo -e "${RED}✗ Instance has no IAM role attached${NC}"
    echo "SSM agent requires an IAM role with AmazonSSMManagedInstanceCore policy"
    echo "This requires modifying the instance stack or attaching a role manually"
    exit 1
fi
echo ""

# Check if SSH key is available
echo "📋 Step 3: Checking SSH Access"
echo "----------------------------------------"
if [ "$KEY_NAME" = "None" ] || [ -z "$KEY_NAME" ]; then
    echo -e "${YELLOW}⚠ No key name found in instance metadata${NC}"
    echo "You'll need to provide SSH key manually"
    KEY_FILE=""
else
    # Try to find key file in common locations
    KEY_FILE=""
    KEY_LOCATIONS=(
        "${HOME}/.ssh/${KEY_NAME}.pem"
        "${HOME}/.ssh/${KEY_NAME}"
        "./keys/${KEY_NAME}.pem"
        "./keys/${KEY_NAME}"
        "../keys/${KEY_NAME}.pem"
        "../keys/${KEY_NAME}"
    )
    
    for loc in "${KEY_LOCATIONS[@]}"; do
        if [ -f "$loc" ]; then
            KEY_FILE="$loc"
            break
        fi
    done
    
    if [ -n "$KEY_FILE" ]; then
        echo -e "${GREEN}✓ Found SSH key: ${KEY_FILE}${NC}"
    else
        echo -e "${YELLOW}⚠ SSH key not found in common locations${NC}"
        echo "  Looking for: ${KEY_NAME}.pem or ${KEY_NAME}"
        echo "  Searched:"
        for loc in "${KEY_LOCATIONS[@]}"; do
            echo "    - ${loc}"
        done
        echo ""
        read -p "Enter path to SSH key file (or press Enter to skip SSH install): " KEY_FILE
    fi
fi
echo ""

# Install SSM agent via SSH (if key available)
if [ -n "$KEY_FILE" ] && [ -f "$KEY_FILE" ]; then
    echo "📋 Step 4: Installing SSM Agent via SSH"
    echo "----------------------------------------"
    echo "Connecting to instance via SSH..."
    
    # Make key file readable only by owner
    chmod 600 "$KEY_FILE" 2>/dev/null || true
    
    # Install SSM agent
    ssh -i "$KEY_FILE" \
        -o StrictHostKeyChecking=no \
        -o UserKnownHostsFile=/dev/null \
        -o ConnectTimeout=10 \
        "ubuntu@${INSTANCE_IP}" << 'EOF'
set -e
echo "=== SSM Agent Installation ==="
echo ""

# Check if SSM agent is already installed
if command -v amazon-ssm-agent >/dev/null 2>&1; then
    echo "SSM agent is already installed"
    INSTALLED_VIA="existing"
else
    echo "SSM agent not found, installing..."
    
    # Try snap first (preferred for Ubuntu)
    if command -v snap >/dev/null 2>&1; then
        echo "Installing via snap..."
        sudo snap install amazon-ssm-agent --classic || {
            echo "Snap install failed, trying apt..."
            sudo apt-get update -qq
            sudo apt-get install -y amazon-ssm-agent
            INSTALLED_VIA="apt"
        }
        INSTALLED_VIA="snap"
    else
        echo "Snap not available, using apt..."
        sudo apt-get update -qq
        sudo apt-get install -y amazon-ssm-agent
        INSTALLED_VIA="apt"
    fi
fi

# Determine service name based on installation method
if [ "$INSTALLED_VIA" = "snap" ] || snap list amazon-ssm-agent >/dev/null 2>&1; then
    echo "SSM agent installed via snap"
    SERVICE_NAME="snap.amazon-ssm-agent.amazon-ssm-agent.service"
    sudo snap start amazon-ssm-agent || true
    sudo snap enable amazon-ssm-agent || true
else
    echo "SSM agent installed via apt"
    SERVICE_NAME="amazon-ssm-agent.service"
    sudo systemctl enable amazon-ssm-agent || true
    sudo systemctl restart amazon-ssm-agent || true
fi

# Wait a moment for service to start
sleep 2

# Check service status
echo ""
echo "=== SSM Agent Status ==="
if systemctl list-units --type=service 2>/dev/null | grep -q "$SERVICE_NAME"; then
    sudo systemctl status "$SERVICE_NAME" --no-pager -l || true
elif snap list amazon-ssm-agent >/dev/null 2>&1; then
    snap services amazon-ssm-agent || true
else
    echo "Could not determine service status"
fi

echo ""
echo "=== Restarting SSM Agent ==="
if snap list amazon-ssm-agent >/dev/null 2>&1; then
    sudo snap restart amazon-ssm-agent || true
else
    sudo systemctl restart amazon-ssm-agent || true
fi

echo ""
echo "✅ SSM agent installation/configuration complete"
echo "⏳ Waiting 15 seconds for agent to register with Systems Manager..."
sleep 15
echo "✅ Done. SSM agent should be registering now."
EOF

    SSH_EXIT_CODE=$?
    if [ $SSH_EXIT_CODE -eq 0 ]; then
        echo -e "${GREEN}✓ SSM agent installation completed${NC}"
    else
        echo -e "${RED}✗ SSH connection or installation failed${NC}"
        echo "Exit code: ${SSH_EXIT_CODE}"
        exit 1
    fi
else
    echo "📋 Step 4: SSH Installation Skipped"
    echo "----------------------------------------"
    echo -e "${YELLOW}⚠ SSH key not available - skipping SSH installation${NC}"
    echo ""
    echo "To install SSM agent manually, SSH into the instance and run:"
    echo "  sudo snap install amazon-ssm-agent --classic"
    echo "  sudo snap start amazon-ssm-agent"
    echo "  sudo snap enable amazon-ssm-agent"
    echo ""
    echo "Or via apt:"
    echo "  sudo apt-get update"
    echo "  sudo apt-get install -y amazon-ssm-agent"
    echo "  sudo systemctl enable amazon-ssm-agent"
    echo "  sudo systemctl start amazon-ssm-agent"
fi
echo ""

# Verify SSM agent is accessible
echo "📋 Step 5: Verifying SSM Agent Registration"
echo "----------------------------------------"
echo "Waiting 30 seconds for agent to register..."
sleep 30

SSM_STATUS=$(aws ssm describe-instance-information \
    --profile "${PROFILE}" \
    --region "${REGION}" \
    --filters "Key=InstanceIds,Values=${INSTANCE_ID}" \
    --query 'InstanceInformationList[0].PingStatus' \
    --output text 2>/dev/null || echo "None")

if [ "$SSM_STATUS" = "Online" ]; then
    echo -e "${GREEN}✓ SSM agent is online and registered${NC}"
    echo ""
    echo "You can now use SSM commands:"
    echo "  aws ssm send-command --instance-ids ${INSTANCE_ID} --document-name AWS-RunShellScript --parameters 'commands=[\"echo hello\"]' --profile ${PROFILE} --region ${REGION}"
elif [ "$SSM_STATUS" = "None" ] || [ -z "$SSM_STATUS" ]; then
    echo -e "${YELLOW}⚠ SSM agent not yet registered (may take 1-2 minutes)${NC}"
    echo ""
    echo "The agent may still be registering. Check again in a minute:"
    echo "  aws ssm describe-instance-information --filters \"Key=InstanceIds,Values=${INSTANCE_ID}\" --profile ${PROFILE} --region ${REGION}"
else
    echo -e "${YELLOW}⚠ SSM agent status: ${SSM_STATUS}${NC}"
    echo ""
    echo "If status doesn't change to 'Online' within 2-3 minutes, check:"
    echo "  1. IAM role has AmazonSSMManagedInstanceCore policy"
    echo "  2. SSM agent is running on the instance"
    echo "  3. Instance can reach AWS Systems Manager endpoints"
fi
echo ""

echo "=========================================="
echo "Summary"
echo "=========================================="
echo "Instance: ${INSTANCE_ID}"
echo "IP: ${INSTANCE_IP}"
echo "IAM Role: ${ROLE_NAME:-"N/A"}"
echo "SSM Status: ${SSM_STATUS:-"Checking..."}"
echo ""
echo "Next steps:"
echo "  1. Wait 1-2 minutes for SSM agent to fully register"
echo "  2. Test SSM access:"
echo "     aws ssm send-command --instance-ids ${INSTANCE_ID} --document-name AWS-RunShellScript --parameters 'commands=[\"echo test\"]' --profile ${PROFILE} --region ${REGION}"
echo "  3. Test service restart Lambda:"
echo "     aws lambda invoke --function-name service-restart-hepefoundation-org-service-restart --profile ${PROFILE} --region ${REGION} /tmp/result.json"
echo ""









